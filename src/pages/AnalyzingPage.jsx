import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useAnalysis } from '../hooks/useAnalysis'
import { transcribeAudio } from '../lib/whisper'

const STEPS = [
  { at: 0, label: '답변 데이터 준비 중...' },
  { at: 10, label: '음성을 텍스트로 변환하는 중...' },
  { at: 40, label: '답변 내용 분석 중...' },
  { at: 60, label: '텍스트 분석 완료, 영상 분석 중...' },
  { at: 80, label: '비언어적 요소 분석 중...' },
  { at: 90, label: '종합 리포트 생성 중...' },
  { at: 100, label: '분석 완료!' },
]

export default function AnalyzingPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const { questions, answers, phase, setReport, updateAnswer } = useInterviewStore()
  const { isAnalyzing, progress: llmProgress, error: llmError, analyze } = useAnalysis()
  const [step, setStep] = useState('whisper') // whisper | llm | done | error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const startedRef = useRef(false)

  // 전체 분석 파이프라인
  useEffect(() => {
    if (phase !== 'processing' || startedRef.current) return
    startedRef.current = true
    runPipeline()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function runPipeline() {
    try {
      // 1단계: Whisper STT (질문별 순차)
      setStep('whisper')
      setProgress(5)

      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i]
        if (!answer.videoBlob) continue

        setProgress(5 + Math.round((i / answers.length) * 35))

        try {
          const result = await transcribeAudio(answer.videoBlob)
          updateAnswer(i, {
            transcript: result.transcript,
            fillerWordCount: result.fillerWordCount,
            silenceSegments: result.silencePositions || [],
            wordTimestamps: result.words || [],
          })
        } catch (e) {
          console.warn(`Q${i + 1} Whisper failed:`, e.message)
          // 개별 질문 실패해도 계속 진행
        }
      }

      // 2단계: LLM 분석
      setStep('llm')
      setProgress(40)

      // 최신 answers 가져오기 (Whisper 결과가 반영된)
      const updatedAnswers = useInterviewStore.getState().answers

      const report = await analyze({ questions, answers: updatedAnswers, track })
      if (report) {
        setStep('done')
        setProgress(100)
        setReport(report)
        navigate('/report')
      } else {
        throw new Error('리포트 생성에 실패했습니다.')
      }
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  // LLM 진행률 반영
  const displayProgress = step === 'whisper'
    ? progress
    : step === 'llm'
      ? 40 + Math.round(llmProgress * 0.55)
      : progress

  const currentStep = STEPS.filter((s) => s.at <= displayProgress).pop() || STEPS[0]
  const displayError = error || llmError

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
          <p className="text-text-secondary">{currentStep.label}</p>
          {step === 'whisper' && (
            <p className="text-xs text-text-secondary">Groq Whisper로 음성 변환 중...</p>
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
              <button onClick={() => { startedRef.current = false; setError(null); setStep('whisper'); runPipeline() }}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer">
                다시 시도
              </button>
              <button onClick={() => navigate('/')}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm cursor-pointer">
                홈으로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
