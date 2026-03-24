import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useAnalysis } from '../hooks/useAnalysis'
import { preloadModel, transcribeAudio, isModelLoaded } from '../lib/whisper'

export default function AnalyzingPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const { questions, answers, phase, setReport, updateAnswer } = useInterviewStore()
  const { progress: llmProgress, error: llmError, analyze } = useAnalysis()

  const [step, setStep] = useState('init') // init | model-download | whisper | llm | error
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('준비 중...')
  const [downloadInfo, setDownloadInfo] = useState(null)
  const [error, setError] = useState(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'processing' || startedRef.current) return
    startedRef.current = true
    runPipeline()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function runPipeline() {
    try {
      // 1단계: 모델 로딩 (첫 접속 시만 다운로드, 이후 캐시)
      if (!isModelLoaded()) {
        setStep('model-download')
        setStatusText('AI 음성 인식 모델 준비 중...')
        setProgress(0)

        await preloadModel(
          (info) => {
            setDownloadInfo(info)
            if (info.total) {
              const pct = Math.round((info.loaded / info.total) * 20)
              setProgress(pct)
            }
          },
          (msg) => setStatusText(msg)
        )
      }

      // 2단계: Whisper STT (질문별 순차)
      setStep('whisper')
      setProgress(20)

      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i]
        if (!answer.videoBlob) continue

        setStatusText(`질문 ${i + 1}/${answers.length} 음성 변환 중...`)
        setProgress(20 + Math.round((i / answers.length) * 30))

        try {
          const result = await transcribeAudio(answer.videoBlob)
          updateAnswer(i, {
            transcript: result.transcript,
            fillerWordCount: result.fillerWordCount,
            silenceSegments: result.silencePositions || [],
          })
        } catch (e) {
          console.warn(`Q${i + 1} Whisper failed:`, e.message)
        }
      }

      // 3단계: LLM 분석
      setStep('llm')
      setProgress(50)
      setStatusText('AI 면접관이 답변을 평가하고 있습니다...')

      const updatedAnswers = useInterviewStore.getState().answers
      const report = await analyze({ questions, answers: updatedAnswers, track })

      if (report) {
        setProgress(100)
        setStatusText('분석 완료!')
        setReport(report)
        setTimeout(() => navigate('/report'), 500)
      } else {
        throw new Error('리포트 생성에 실패했습니다.')
      }
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  // LLM 진행률 반영
  const displayProgress = step === 'llm'
    ? 50 + Math.round(llmProgress * 0.45)
    : progress

  const displayError = error || llmError
  const formatBytes = (bytes) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : ''

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* 로딩 애니메이션 */}
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

          {/* 모델 다운로드 상세 (첫 접속 시만) */}
          {step === 'model-download' && downloadInfo && (
            <p className="text-xs text-text-secondary">
              모델 다운로드 중: {formatBytes(downloadInfo.loaded)} / {formatBytes(downloadInfo.total)}
              <br />
              <span className="text-text-secondary/60">(최초 1회만, 이후 캐시에서 로딩)</span>
            </p>
          )}

          {/* 단계 표시 */}
          {step !== 'error' && (
            <div className="flex justify-center gap-6 text-xs text-text-secondary mt-4">
              <span className={step === 'model-download' ? 'text-accent font-medium' : step === 'whisper' || step === 'llm' ? 'text-success' : ''}>
                {step === 'whisper' || step === 'llm' ? '1. 모델 준비 완료' : '1. 모델 준비'}
              </span>
              <span className={step === 'whisper' ? 'text-accent font-medium' : step === 'llm' ? 'text-success' : ''}>
                {step === 'llm' ? '2. 음성 변환 완료' : '2. 음성 변환'}
              </span>
              <span className={step === 'llm' ? 'text-accent font-medium' : ''}>
                3. AI 평가
              </span>
            </div>
          )}
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out"
            style={{ width: `${displayProgress}%` }} />
        </div>
        <p className="text-sm text-text-secondary">{displayProgress}%</p>

        {/* 에러 */}
        {displayError && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 space-y-3">
            <p className="text-danger text-sm">{displayError}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { startedRef.current = false; setError(null); setStep('init'); runPipeline() }}
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
