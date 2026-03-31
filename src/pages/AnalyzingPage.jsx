import { useEffect, useState, useRef } from 'react'
import SnakeGame from '../components/SnakeGame'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { analyzeText, analyzeVision, correctTranscript } from '../lib/api'
import { preloadModel, transcribeAudio, isModelLoaded } from '../lib/whisper'

export default function AnalyzingPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const { questions, answers, phase, setReport, updateAnswer } = useInterviewStore()

  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('init')
  const [statusText, setStatusText] = useState('준비 중...')
  const [downloadInfo, setDownloadInfo] = useState(null)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [gameActive, setGameActive] = useState(false)
  const [gameReady, setGameReady] = useState(false)
  const [initialDir, setInitialDir] = useState(null)
  const [showHint, setShowHint] = useState(false)
  const startedRef = useRef(false)
  const timerRef = useRef(null)

  // 경과 시간 타이머
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'processing' || startedRef.current) return
    startedRef.current = true
    runPipeline()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 5초 후 힌트 표시
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), 5000)
    return () => clearTimeout(timer)
  }, [])

  // 게임 전환 딜레이 (점 페이드아웃 → 캔버스 마운트)
  useEffect(() => {
    if (gameActive) {
      const timer = setTimeout(() => setGameReady(true), 350)
      return () => clearTimeout(timer)
    } else {
      setGameReady(false)
    }
  }, [gameActive])

  // 화살표 키로 게임 시작
  useEffect(() => {
    if (gameActive || step === 'error') return
    const handler = (e) => {
      const dirMap = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
        w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
        W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
      }
      if (dirMap[e.key]) {
        e.preventDefault()
        setInitialDir(dirMap[e.key])
        setGameActive(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [gameActive, step])

  async function runPipeline() {
    try {
      setProgress(1)

      // --- 1단계: 모델 로딩 (0~20%) ---
      if (!isModelLoaded()) {
        setStep('model-download')
        setStatusText('음성 인식 모델 준비 중...')
        setProgress(2)

        await preloadModel(
          (info) => {
            setDownloadInfo(info)
            if (info.total) setProgress(Math.round((info.loaded / info.total) * 20))
          },
          (msg) => setStatusText(msg)
        )
      }
      setProgress(20)

      // --- 2단계: 백그라운드 STT 완료 대기 + 남은 처리 (20~55%) ---
      setStep('whisper')
      setStatusText('음성 변환 완료를 기다리는 중...')

      await new Promise((resolve) => {
        const check = () => {
          const pending = useInterviewStore.getState().pendingSTT
          if (pending <= 0) {
            resolve()
          } else {
            setStatusText(`음성 변환 + 교정 중... (${pending}개 남음)`)
            setProgress(20 + Math.round(((answers.length - pending) / answers.length) * 25))
            setTimeout(check, 500)
          }
        }
        check()
      })

      const latestAnswers = useInterviewStore.getState().answers
      for (let i = 0; i < latestAnswers.length; i++) {
        const a = latestAnswers[i]
        if (a.transcript && a.transcript.length > 0) continue
        if (!a.videoBlob) continue

        setStatusText(`질문 ${i + 1} 음성 변환 중...`)
        try {
          const result = await transcribeAudio(a.videoBlob)
          updateAnswer(i, { rawTranscript: result.transcript, transcript: result.transcript, fillerWordCount: result.fillerWordCount, silenceSegments: result.silencePositions || [] })
          const corrected = await correctTranscript(result.transcript, a.questionText)
          updateAnswer(i, { transcript: corrected })
        } catch (e) {
          console.warn(`Q${i + 1} 보완 처리 실패:`, e.message)
        }
      }

      setProgress(55)

      // --- 3단계: LLM 평가 (55~95%) ---
      setStep('llm')
      setStatusText('면접관이 답변을 평가하고 있습니다...')

      const updatedAnswers = useInterviewStore.getState().answers

      const [textResult, visionResult] = await Promise.allSettled([
        analyzeText({ questions, answers: updatedAnswers, track }).then((r) => {
          setProgress(75)
          setStatusText('텍스트 분석 완료, 영상 분석 중...')
          return r
        }),
        analyzeVision({ answers: updatedAnswers }).then((r) => {
          setProgress(85)
          return r
        }),
      ])

      setProgress(90)
      setStatusText('종합 리포트 생성 중...')

      const textError = textResult.status === 'rejected' ? textResult.reason?.message || '알 수 없는 오류' : null
      const visionError = visionResult.status === 'rejected' ? visionResult.reason?.message || '알 수 없는 오류' : null

      if (textError) {
        console.error('[분석] 텍스트 분석 실패:', textError)
        setStatusText(`텍스트 분석 실패: ${textError.slice(0, 100)}`)
      }
      if (visionError) {
        console.error('[분석] 비전 분석 실패:', visionError)
      }

      const textData = textResult.status === 'fulfilled' ? textResult.value : null
      const visionData = visionResult.status === 'fulfilled' ? visionResult.value : null

      if (!textData && !visionData) throw new Error(`분석 실패. 텍스트: ${textError || '없음'}, 비전: ${visionError || '없음'}`)

      const { buildReport } = await import('../hooks/useAnalysis')
      const report = buildReport(textData, visionData, updatedAnswers)

      setProgress(95)
      setStatusText('결과 저장 중...')

      const { saveResult } = useInterviewStore.getState()
      const resultId = await saveResult(report)

      setProgress(100)
      setStatusText('분석 완료!')
      setReport(report)

      setTimeout(() => navigate(resultId ? `/report/${resultId}` : '/report'), 500)

    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  const formatBytes = (bytes) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : ''

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">

        {/* 게임 힌트 (점 위에 표시, 5초 후 페이드인) */}
        {step !== 'error' && !gameActive && (
          <p className="text-sm text-text-secondary"
            style={{ opacity: showHint ? 1 : 0, transition: 'opacity 1s ease-in' }}>
            방향키를 눌러보세요
          </p>
        )}
        {step !== 'error' && gameActive && (
          <p className="text-xs text-text-secondary/60">방향키/WASD 조작 | ESC 닫기</p>
        )}

        {/* 게임/점 영역 */}
        {step !== 'error' && (
          <div className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-xl"
              style={{
                width: gameActive ? 418 : 52,
                height: gameActive ? 318 : 24,
                backgroundColor: gameActive ? '#1a1a2e' : 'transparent',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: gameActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                transition: 'width 0.5s ease-out, height 0.5s ease-out, background-color 0.4s ease-out, border-color 0.4s ease-out',
              }}
            >
              {/* 점 3개 — 항상 렌더, gameActive 시 페이드아웃 */}
              <div
                className="absolute inset-0 flex justify-center items-center gap-2"
                style={{
                  opacity: gameActive ? 0 : 1,
                  transition: 'opacity 0.3s ease-out',
                  pointerEvents: gameActive ? 'none' : 'auto',
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-3 h-3 rounded-full bg-accent" style={{
                    animation: gameActive ? 'none' : 'analyzing-dots 1.4s infinite ease-in-out both',
                    animationDelay: `${i * 0.16}s`,
                  }} />
                ))}
              </div>

              {/* 스네이크 게임 — 점 페이드아웃 후 마운트 */}
              {gameReady && (
                <SnakeGame
                  initialDir={initialDir}
                  onClose={() => setGameActive(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* 분석 상태 텍스트 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {step === 'error' ? '분석 중 오류 발생' : '답변을 분석하고 있습니다'}
          </h1>
          <p className="text-text-secondary">{statusText}</p>

          {step === 'model-download' && downloadInfo && downloadInfo.total && (
            <p className="text-xs text-text-secondary">
              모델 다운로드: {formatBytes(downloadInfo.loaded)} / {formatBytes(downloadInfo.total)}
              <br /><span className="text-text-secondary/60">(최초 1회만, 이후 캐시)</span>
            </p>
          )}

          {step !== 'error' && (
            <div className="flex justify-center gap-6 text-xs text-text-secondary mt-4">
              {['model-download', 'whisper', 'llm'].map((s, i) => {
                const labels = ['1. 모델 준비', '2. 음성 변환 + 교정', '3. 평가']
                const steps = ['model-download', 'whisper', 'llm']
                const currentIdx = steps.indexOf(step)
                return (
                  <span key={s} className={step === s ? 'text-accent font-medium' : currentIdx > i ? 'text-success' : ''}>
                    {currentIdx > i ? labels[i] + ' 완료' : labels[i]}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-sm text-text-secondary">
          <span>{progress}%</span>
          <span>{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} 경과</span>
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 space-y-3">
            <p className="text-danger text-sm">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { startedRef.current = false; setError(null); setStep('init'); setProgress(0); runPipeline() }}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer">다시 시도</button>
              <button onClick={() => navigate('/')}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm cursor-pointer">홈으로</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
