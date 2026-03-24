import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useAnalysis } from '../hooks/useAnalysis'

const STEPS = [
  { at: 10, label: '답변 데이터 준비 중...' },
  { at: 30, label: '답변 내용 분석 중...' },
  { at: 50, label: '텍스트 분석 완료, 영상 분석 중...' },
  { at: 80, label: '비언어적 요소 분석 중...' },
  { at: 90, label: '종합 리포트 생성 중...' },
  { at: 100, label: '분석 완료!' },
]

export default function AnalyzingPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const { questions, answers, phase, setReport } = useInterviewStore()
  const { isAnalyzing, progress, error, analyze } = useAnalysis()

  // 분석 시작
  useEffect(() => {
    if (phase !== 'processing') {
      navigate('/')
      return
    }

    analyze({ questions, answers, track }).then((report) => {
      if (report) {
        setReport(report)
        navigate('/report')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = STEPS.filter((s) => s.at <= progress).pop() || STEPS[0]

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* 로딩 애니메이션 */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-accent"
              style={{
                animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">답변을 분석하고 있습니다</h1>
          <p className="text-text-secondary">{currentStep.label}</p>
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-text-secondary">{progress}%</p>

        {/* 에러 표시 */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 space-y-3">
            <p className="text-danger text-sm">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => analyze({ questions, answers, track }).then((r) => {
                  if (r) { setReport(r); navigate('/report') }
                })}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer"
              >
                다시 시도
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm cursor-pointer"
              >
                홈으로
              </button>
            </div>
          </div>
        )}

        {/* API 키 없을 때 안내 */}
        {!import.meta.env.VITE_OPENROUTER_API_KEY && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <p className="text-warning text-sm">
              VITE_OPENROUTER_API_KEY가 설정되지 않았습니다.
              <br />프로젝트 루트에 .env 파일을 생성하고 키를 추가해주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
