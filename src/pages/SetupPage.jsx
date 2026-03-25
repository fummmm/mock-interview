import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { getQuestions } from '../lib/questions'

const TRACKS = [
  { id: 'behavioral', label: '인성면접 (공통)', desc: '직군 무관, 인성/역량 중심 면접' },
  { id: 'unity', label: 'Unity', desc: 'C# 기반 게임 클라이언트 개발' },
  { id: 'unreal', label: 'Unreal Engine', desc: 'C++/Blueprint 기반 게임 개발' },
  { id: 'design', label: '게임기획', desc: '시스템/레벨/밸런스 기획' },
]

const COUNTS = [2, 3, 4, 5, 7]

export default function SetupPage() {
  const navigate = useNavigate()
  const { track, questionCount, setTrack, setQuestionCount } = useSettingsStore()
  const { loadQuestions, reset } = useInterviewStore()

  const canStart = !!track

  const handleStart = () => {
    if (!canStart) return
    reset()
    const questions = getQuestions(questionCount, track)
    loadQuestions(questions)
    navigate('/interview')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-10">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">AI Mock Interview</h1>
          <p className="text-text-secondary">AI 모의면접 연습 서비스</p>
        </div>

        {/* 트랙 선택 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">지원 트랙</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRACKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTrack(t.id)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  track === t.id
                    ? 'border-accent bg-accent/10 ring-1 ring-accent'
                    : 'border-border bg-bg-card hover:border-accent/50'
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-sm text-text-secondary mt-1">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-text-secondary">
            인성면접은 직군 무관 공통 질문, 직군 트랙은 기술+인성 종합 질문으로 출제됩니다.
          </p>
        </section>

        {/* 질문 수 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">질문 수</h2>
          <div className="flex gap-3">
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => setQuestionCount(c)}
                className={`w-16 h-16 rounded-xl border text-xl font-bold transition-all cursor-pointer ${
                  questionCount === c
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-bg-card hover:border-accent/50 text-text-secondary'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* 시작 버튼 */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${
            canStart
              ? 'bg-accent hover:bg-accent-hover text-white cursor-pointer'
              : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
          }`}
        >
          면접 시작
        </button>
      </div>
    </div>
  )
}
