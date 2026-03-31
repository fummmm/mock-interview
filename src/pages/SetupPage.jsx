import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useAuthStore } from '../stores/authStore'
import { getQuestions } from '../lib/questions'
import { generateDocumentQuestions } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useState, useEffect } from 'react'

const TRACK_LABELS = {
  unity: 'Unity',
  unreal: 'Unreal Engine',
  pm: 'PM',
  design: '게임기획',
}

const COUNTS = [4, 5]

export default function SetupPage() {
  const navigate = useNavigate()
  const { track, questionCount, setTrack, setQuestionCount } = useSettingsStore()
  const { loadQuestions, reset } = useInterviewStore()
  const { profile, quota, isMainAdmin } = useAuthStore()
  const mainAdmin = isMainAdmin()

  const userTrack = profile?.track
  const remaining = quota ? Math.max(0, quota.total_quota - quota.used_count) : 0
  const canStart = !!track && (mainAdmin || remaining > 0)

  const [starting, setStarting] = useState(false)
  const [docs, setDocs] = useState([])

  const hasResume = docs.some((d) => d.doc_type === 'resume')
  const hasPortfolio = docs.some((d) => d.doc_type === 'portfolio')

  useEffect(() => {
    if (profile?.id) {
      supabase.from('user_documents').select('doc_type').eq('user_id', profile.id)
        .then(({ data }) => setDocs(data || []))
    }
  }, [profile?.id])

  const handleStart = async () => {
    if (!canStart || starting) return
    setStarting(true)

    reset()
    let questions = getQuestions(questionCount, track)

    // 이력서/포폴 기반 질문 생성 시도
    try {
      const { data: docs } = await supabase
        .from('user_documents')
        .select('extracted_text, doc_type')
        .eq('user_id', profile.id)

      const docTexts = (docs || [])
        .filter((d) => d.extracted_text && d.extracted_text.length > 50)
        .map((d) => `[${d.doc_type}]\n${d.extracted_text}`)
        .join('\n\n')

      if (docTexts) {
        const docQuestions = await generateDocumentQuestions(docTexts, track, Math.min(2, questionCount - 2))
        if (docQuestions.length > 0) {
          // 자기소개 다음, 마무리 전에 삽입
          const introIdx = questions.findIndex((q) => q.id === 'beh-intro')
          const insertAt = introIdx >= 0 ? introIdx + 1 : 1
          questions = [
            ...questions.slice(0, insertAt),
            ...docQuestions,
            ...questions.slice(insertAt),
          ].slice(0, questionCount + docQuestions.length) // 전체 수 조정
        }
      }
    } catch (e) {
      console.warn('이력서 질문 생성 스킵:', e.message)
    }

    loadQuestions(questions)

    const { startSession } = useInterviewStore.getState()
    await startSession(profile.id, track, questionCount)

    const { refreshQuota } = useAuthStore.getState()
    await refreshQuota()

    setStarting(false)
    navigate('/interview')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-10">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">AI 모의면접 연습</h1>
          {/* 쿼타 표시 */}
          <div className={`inline-block px-4 py-1.5 rounded-full text-sm ${mainAdmin || remaining > 0 ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
            {mainAdmin ? '관리자 (무제한)' : `남은 면접 횟수: ${remaining}회`}
          </div>

          {/* 이력서/포폴 등록 상태 */}
          <div className="flex items-center justify-center gap-4 text-sm mt-1">
            <span className={`flex items-center gap-1.5 ${hasResume ? 'text-success' : 'text-text-secondary'}`}>
              <span className={`w-2 h-2 rounded-full ${hasResume ? 'bg-success' : 'bg-text-secondary/30'}`} />
              이력서 {hasResume ? '등록' : '미등록'}
            </span>
            <span className="text-border">|</span>
            <span className={`flex items-center gap-1.5 ${hasPortfolio ? 'text-success' : 'text-text-secondary'}`}>
              <span className={`w-2 h-2 rounded-full ${hasPortfolio ? 'bg-success' : 'bg-text-secondary/30'}`} />
              포트폴리오 {hasPortfolio ? '등록' : '미등록'}
            </span>
          </div>
          {(!hasResume || !hasPortfolio) && (
            <p className="text-xs text-accent">
              이력서/포트폴리오 등록 시 해당 문서를 분석하고 상황에 맞는 맞춤형 질문을 추가로 제공합니다.
            </p>
          )}
        </div>

        {/* 면접 유형 선택 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">면접 유형</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setTrack('behavioral')}
              className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
                track === 'behavioral'
                  ? 'border-accent bg-accent/10 ring-1 ring-accent'
                  : 'border-border bg-bg-card hover:border-accent/50'
              }`}
            >
              <div className="font-semibold">인성면접 (공통)</div>
              <div className="text-sm text-text-secondary mt-1">직군 무관, 인성/역량 중심 질문</div>
            </button>

            {mainAdmin
              ? Object.entries(TRACK_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTrack(key)}
                    className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
                      track === key
                        ? 'border-accent bg-accent/10 ring-1 ring-accent'
                        : 'border-border bg-bg-card hover:border-accent/50'
                    }`}
                  >
                    <div className="font-semibold">{label} 면접</div>
                    <div className="text-sm text-text-secondary mt-1">기술 + 인성 종합 질문</div>
                  </button>
                ))
              : userTrack && TRACK_LABELS[userTrack] && (
                  <button
                    onClick={() => setTrack(userTrack)}
                    className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
                      track === userTrack
                        ? 'border-accent bg-accent/10 ring-1 ring-accent'
                        : 'border-border bg-bg-card hover:border-accent/50'
                    }`}
                  >
                    <div className="font-semibold">{TRACK_LABELS[userTrack]} 면접</div>
                    <div className="text-sm text-text-secondary mt-1">기술 + 인성 종합 질문</div>
                  </button>
                )
            }
          </div>
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
          <p className="text-xs text-text-secondary">꼬리질문으로 인한 추가 질문이 발생할 수 있습니다.</p>
        </section>

        {/* 시작 버튼 */}
        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${
            canStart && !starting
              ? 'bg-accent hover:bg-accent-hover text-white cursor-pointer'
              : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
          }`}
        >
          {starting ? '준비 중...' : mainAdmin || remaining > 0 ? '면접 시작' : '면접 횟수가 없습니다 (관리자에게 문의)'}
        </button>
      </div>
    </div>
  )
}
