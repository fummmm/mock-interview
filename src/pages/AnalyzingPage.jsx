import { useEffect, useState, useRef } from 'react'
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

  async function runPipeline() {
    try {
      setProgress(1) // 즉시 1%로 올려서 시작 확인

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

      // 백그라운드 처리가 끝날 때까지 대기
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

      // 혹시 백그라운드에서 못 처리한 질문 보완
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
      console.log('[분석] 모든 답변 텍스트 준비 완료:', useInterviewStore.getState().answers.map((a, i) => `Q${i + 1}: ${a.transcript?.slice(0, 40) || '(없음)'}`))

      // --- 3단계: LLM 평가 (55~95%) ---
      setStep('llm')
      setStatusText('면접관이 답변을 평가하고 있습니다...')

      const updatedAnswers = useInterviewStore.getState().answers

      // 디버깅: transcript 확인
      console.log('[분석] 답변 데이터:', updatedAnswers.map((a, i) => ({
        q: i + 1,
        transcript: a.transcript?.slice(0, 50) || '(없음)',
        hasVideo: !!a.videoBlob,
        frames: a.frames?.length || 0,
      })))

      const [textResult, visionResult] = await Promise.allSettled([
        analyzeText({ questions, answers: updatedAnswers, track }).then((r) => {
          console.log('[분석] 텍스트 분석 결과:', r)
          setProgress(75)
          setStatusText('텍스트 분석 완료, 영상 분석 중...')
          return r
        }),
        analyzeVision({ answers: updatedAnswers }).then((r) => {
          console.log('[분석] 비전 분석 결과:', r)
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

      // API 키 체크
      if (!textData) {
        const hasKey = !!import.meta.env.VITE_OPENROUTER_API_KEY
        console.error('[분석] API 키 존재:', hasKey, '텍스트 에러:', textError)
      }

      if (!textData && !visionData) throw new Error(`분석 실패. 텍스트: ${textError || '없음'}, 비전: ${visionError || '없음'}`)

      // 리포트 빌드 (useAnalysis에서 가져온 로직을 인라인)
      const { buildReport } = await import('../hooks/useAnalysis')
      const report = buildReport(textData, visionData, updatedAnswers)

      setProgress(95)
      setStatusText('결과 저장 중...')

      // DB에 결과 저장
      const { saveResult } = useInterviewStore.getState()
      const resultId = await saveResult(report)

      setProgress(100)
      setStatusText('분석 완료!')
      setReport(report)

      // resultId가 있으면 /report/:id로, 없으면 /report로
      setTimeout(() => navigate(resultId ? `/report/${resultId}` : '/report'), 500)

    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  const formatBytes = (bytes) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : ''

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        {step !== 'error' && (
          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-accent" style={{
                animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                animationDelay: `${i * 0.16}s`,
              }} />
            ))}
          </div>
        )}

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

        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-sm text-text-secondary">
          <span>{progress}%</span>
          <span>{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} 경과</span>
        </div>

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
