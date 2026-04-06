import { useEffect, useState, useRef } from 'react'
import SnakeGame from '../components/SnakeGame'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { analyzeText, analyzeVision, correctTranscript } from '../lib/api'
import { preloadModel, transcribeAudio, isModelLoaded } from '../lib/whisper'

export default function AnalyzingPage() {
  const navigate = useNavigate()
  const { track, companySize } = useSettingsStore()
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
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        w: 'UP',
        s: 'DOWN',
        a: 'LEFT',
        d: 'RIGHT',
        W: 'UP',
        S: 'DOWN',
        A: 'LEFT',
        D: 'RIGHT',
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
          (msg) => setStatusText(msg),
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
          updateAnswer(i, {
            rawTranscript: result.transcript,
            transcript: result.transcript,
            fillerWordCount: result.fillerWordCount,
            silenceSegments: result.silencePositions || [],
          })
          const corrected = await correctTranscript(result.transcript, a.questionText, track)
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

      // 비전 분석 비활성화 (5초 캡처로는 유의미한 분석 불가, 전체 영상 분석 필요)
      const [textResult] = await Promise.allSettled([
        analyzeText({
          questions,
          answers: updatedAnswers,
          track,
          companySize,
        }).then((r) => {
          setProgress(85)
          return r
        }),
      ])

      setProgress(90)
      setStatusText('종합 리포트 생성 중...')

      let textData = textResult.status === 'fulfilled' ? textResult.value : null
      const visionData = null // 비전 분석 비활성화

      // 텍스트 분석 실패 시 한번 더 단독 재시도
      if (!textData) {
        const textError =
          textResult.status === 'rejected' ? textResult.reason?.message || '알 수 없는 오류' : null
        console.error('[분석] 텍스트 분석 실패, 단독 재시도:', textError)
        setStatusText('면접관 평가 재시도 중...')
        try {
          textData = await analyzeText({
            questions,
            answers: updatedAnswers,
            track,
            companySize,
          })
          setProgress(85)
        } catch (retryErr) {
          console.error('[분석] 텍스트 분석 재시도도 실패:', retryErr.message)
        }
      }

      if (!textData && !visionData)
        throw new Error('텍스트 분석과 비전 분석 모두 실패했습니다. 다시 시도해주세요.')

      const { buildReport } = await import('../hooks/useAnalysis')
      const report = buildReport(textData, visionData, updatedAnswers, companySize)

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

  // 대기 중 순환 문구 (8초마다 전환)
  const waitMessages = [
    '면접관들이 꼼꼼하게 평가 중입니다',
    '답변의 논리 구조를 분석하고 있어요',
    '각 질문별 핵심 키워드를 확인하고 있습니다',
    '면접관 3명이 독립적으로 채점 중입니다',
    '답변의 구체성과 사례를 검토하고 있어요',
    '면접관들이 강점과 개선점을 정리하고 있습니다',
    '질문별 모범 답안과 비교 분석 중이에요',
    '종합 점수를 산정하고 있습니다',
    '합격 여부를 판단하고 있어요',
    '거의 다 됐습니다. 조금만 기다려주세요',
    '답변 하나하나 정성껏 분석하고 있어요',
    '질문이 많을수록 분석에 시간이 걸립니다',
    '면접관들의 코멘트를 취합하고 있습니다',
    '면접관들이 점수를 조율하고 있어요',
    '곧 리포트가 완성됩니다',
  ]
  const waitIdx =
    step === 'llm' && elapsed >= 10 ? Math.floor((elapsed - 10) / 8) % waitMessages.length : -1
  const waitMessage = waitIdx >= 0 ? waitMessages[waitIdx] : null

  const formatBytes = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : '')

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* 게임 힌트 (점 위에 표시, 5초 후 페이드인) */}
        {step !== 'error' && !gameActive && (
          <p
            className="text-text-secondary text-sm"
            style={{
              opacity: showHint ? 1 : 0,
              transition: 'opacity 1s ease-in',
            }}
          >
            방향키를 눌러보세요
          </p>
        )}
        {step !== 'error' && gameActive && (
          <p className="text-text-secondary/60 text-xs">방향키/WASD 조작 | ESC 닫기</p>
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
                transition:
                  'width 0.5s ease-out, height 0.5s ease-out, background-color 0.4s ease-out, border-color 0.4s ease-out',
              }}
            >
              {/* 점 3개 — 항상 렌더, gameActive 시 페이드아웃 */}
              <div
                className="absolute inset-0 flex items-center justify-center gap-2"
                style={{
                  opacity: gameActive ? 0 : 1,
                  transition: 'opacity 0.3s ease-out',
                  pointerEvents: gameActive ? 'none' : 'auto',
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-accent h-3 w-3 rounded-full"
                    style={{
                      animation: gameActive
                        ? 'none'
                        : 'analyzing-dots 1.4s infinite ease-in-out both',
                      animationDelay: `${i * 0.16}s`,
                    }}
                  />
                ))}
              </div>

              {/* 스네이크 게임 — 점 페이드아웃 후 마운트 */}
              {gameReady && (
                <SnakeGame initialDir={initialDir} onClose={() => setGameActive(false)} />
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
          {waitMessage && (
            <p
              className="text-text-secondary/70 mt-1 text-sm"
              style={{ animation: 'fadeIn 0.5s ease-in' }}
            >
              {waitMessage}
            </p>
          )}

          {step === 'model-download' && downloadInfo && downloadInfo.total && (
            <p className="text-text-secondary text-xs">
              모델 다운로드: {formatBytes(downloadInfo.loaded)} / {formatBytes(downloadInfo.total)}
              <br />
              <span className="text-text-secondary/60">(최초 1회만, 이후 캐시)</span>
            </p>
          )}

          {step !== 'error' && (
            <div className="text-text-secondary mt-4 flex justify-center gap-6 text-xs">
              {['model-download', 'whisper', 'llm'].map((s, i) => {
                const labels = ['1. 모델 준비', '2. 음성 변환 + 교정', '3. 평가']
                const steps = ['model-download', 'whisper', 'llm']
                const currentIdx = steps.indexOf(step)
                return (
                  <span
                    key={s}
                    className={
                      step === s ? 'text-accent font-medium' : currentIdx > i ? 'text-success' : ''
                    }
                  >
                    {currentIdx > i ? labels[i] + ' 완료' : labels[i]}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 프로그레스 바 */}
        <div className="bg-bg-elevated h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-text-secondary flex justify-between text-sm">
          <span>{progress}%</span>
          <span>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} 경과
          </span>
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-danger/10 border-danger/30 space-y-3 rounded-xl border p-4">
            <p className="text-danger text-sm">{error}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  startedRef.current = false
                  setError(null)
                  setStep('init')
                  setProgress(0)
                  runPipeline()
                }}
                className="bg-accent cursor-pointer rounded-lg px-4 py-2 text-sm text-white"
              >
                다시 시도
              </button>
              <button
                onClick={() => navigate('/')}
                className="border-border text-text-secondary cursor-pointer rounded-lg border px-4 py-2 text-sm"
              >
                홈으로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
