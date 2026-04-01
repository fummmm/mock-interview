import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useAuthStore } from '../stores/authStore'
import { getQuestions } from '../lib/questions'
import { generateDocumentQuestions, generateJobPostingQuestions } from '../lib/api'
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
  const { companySize, track, questionCount, setCompanySize, setTrack, setQuestionCount } = useSettingsStore()
  const { loadQuestions, reset } = useInterviewStore()
  const { profile, quota, isMainAdmin } = useAuthStore()
  const mainAdmin = isMainAdmin()

  const userTrack = profile?.track
  const remaining = quota ? Math.max(0, quota.total_quota - quota.used_count) : 0
  const canStart = !!track && (mainAdmin || remaining > 0)

  const [starting, setStarting] = useState(false)
  const [docs, setDocs] = useState([])
  const [mode, setMode] = useState('general') // 'general' | 'job'

  // 공고 정보
  const [jobCompany, setJobCompany] = useState('')
  const [jobPosition, setJobPosition] = useState('')
  const [jobScreenshots, setJobScreenshots] = useState([])

  const hasResume = docs.some((d) => d.doc_type === 'resume')
  const hasPortfolio = docs.some((d) => d.doc_type === 'portfolio')

  useEffect(() => {
    if (profile?.id) {
      supabase.from('user_documents').select('doc_type').eq('user_id', profile.id)
        .then(({ data }) => setDocs(data || []))
    }
  }, [profile?.id])

  const hasJobInfo = mode === 'job' && (jobCompany.trim() || jobPosition.trim() || jobScreenshots.length > 0)

  const handleStart = async () => {
    if (!canStart || starting) return
    setStarting(true)

    reset()
    let questions = getQuestions(questionCount, track, companySize)

    const customCount = questionCount <= 4 ? 1 : 2
    try {
      let customQuestions = []

      if (hasJobInfo) {
        customQuestions = await generateJobPostingQuestions(
          { companyName: jobCompany, position: jobPosition, screenshots: jobScreenshots },
          track, customCount,
        )
      }

      const docRemaining = customCount - customQuestions.length
      if (docRemaining > 0) {
        const { data: docs } = await supabase
          .from('user_documents')
          .select('extracted_text, doc_type')
          .eq('user_id', profile.id)

        const docTexts = (docs || [])
          .filter((d) => d.extracted_text && d.extracted_text.length > 50)
          .map((d) => `[${d.doc_type}]\n${d.extracted_text}`)
          .join('\n\n')

        if (docTexts) {
          const docQuestions = await generateDocumentQuestions(docTexts, track, docRemaining)
          customQuestions = [...customQuestions, ...docQuestions]
        }
      }

      if (customQuestions.length > 0) {
        const introIdx = questions.findIndex((q) => q.id === 'beh-intro')
        const insertAt = introIdx >= 0 ? introIdx + 1 : 1
        const base = [...questions.slice(0, insertAt), ...questions.slice(insertAt + customQuestions.length)]
        questions = [
          ...base.slice(0, insertAt),
          ...customQuestions,
          ...base.slice(insertAt),
        ].slice(0, questionCount)
      }
    } catch (e) {
      console.warn('맞춤형 질문 생성 스킵:', e.message)
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
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative">
      {/* 로딩 오버레이 */}
      {starting && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/50 backdrop-blur-sm">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-accent" style={{
                animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                animationDelay: `${i * 0.16}s`,
              }} />
            ))}
          </div>
          <p className="text-lg font-semibold text-text-primary">
            {hasJobInfo ? '면접관이 채용 공고를 분석하고 있습니다' : (hasResume || hasPortfolio) ? '면접관이 이력서와 포트폴리오를 열람하고 있습니다' : '면접을 준비하고 있습니다'}
          </p>
          <p className="text-sm text-text-secondary">잠시만 기다려주세요</p>
        </div>
      )}

      {/* 헤더 */}
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">AI 모의면접 연습</h1>
        <div className={`inline-block px-4 py-1.5 rounded-full text-sm ${mainAdmin || remaining > 0 ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
          {mainAdmin ? '관리자 (무제한)' : `남은 면접 횟수: ${remaining}회`}
        </div>
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
      </div>

      {/* 메인: 좌측 모드 선택 + 구분선 + 우측 콘텐츠 */}
      <div className="w-full max-w-5xl flex gap-0 items-stretch">

        {/* 좌측 모드 선택 */}
        <div className="shrink-0 flex flex-col gap-3 pr-6 w-52">
          <button
            onClick={() => setMode('general')}
            className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
              mode === 'general'
                ? 'border-accent bg-accent/10 ring-1 ring-accent'
                : 'border-border bg-bg-card hover:border-accent/50'
            }`}
          >
            <div className="font-semibold text-sm">일반 모의면접</div>
            <div className="text-xs text-text-secondary mt-1">트랙별 기본 질문으로 연습</div>
          </button>
          <button
            onClick={() => setMode('job')}
            className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
              mode === 'job'
                ? 'border-accent bg-accent/10 ring-1 ring-accent'
                : 'border-border bg-bg-card hover:border-accent/50'
            }`}
          >
            <div className="font-semibold text-sm">공고 맞춤 면접</div>
            <div className="text-xs text-text-secondary mt-1">특정 채용 공고 기반 질문</div>
          </button>
        </div>

        {/* 구분선 */}
        <div className="w-px bg-border shrink-0" />

        {/* 우측 콘텐츠 */}
        <div className="flex-1 pl-6 space-y-8 min-w-0">

          {/* 공고 정보 입력 (공고 맞춤 모드일 때만) */}
          {mode === 'job' && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-text-secondary">채용 공고 정보</h2>

              <div className="grid grid-cols-2 gap-3">
                <input
                  value={jobCompany}
                  onChange={(e) => setJobCompany(e.target.value)}
                  placeholder="회사명"
                  className="px-4 py-3 rounded-xl bg-bg-card border border-border text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none text-sm"
                />
                <input
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder="지원 직무 (예: Unity 클라이언트 개발)"
                  className="px-4 py-3 rounded-xl bg-bg-card border border-border text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none text-sm"
                />
              </div>

              {/* 스크린샷 붙여넣기 */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-4 transition-all ${
                  jobScreenshots.length > 0 ? 'border-success bg-success/5' : 'border-border hover:border-accent/50'
                }`}
                onPaste={(e) => {
                  const items = e.clipboardData?.items
                  if (!items) return
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const blob = item.getAsFile()
                      const reader = new FileReader()
                      reader.onload = () => {
                        setJobScreenshots((prev) => [...prev, reader.result])
                      }
                      reader.readAsDataURL(blob)
                    }
                  }
                }}
                tabIndex={0}
              >
                {jobScreenshots.length === 0 ? (
                  <div className="text-center py-3 space-y-3">
                    <p className="text-sm font-medium text-text-primary">자격요건 / 우대사항 캡처 붙여넣기</p>
                    <div className="flex justify-center gap-6">
                      <div className="text-left">
                        <p className="text-xs text-text-secondary/60 mb-1">Windows</p>
                        <p className="text-xs text-text-secondary">
                          <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-accent font-mono text-[11px]">Win + Shift + S</span>
                          <span className="mx-1.5">→ 영역 선택 →</span>
                          <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-accent font-mono text-[11px]">Ctrl + V</span>
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-text-secondary/60 mb-1">Mac</p>
                        <p className="text-xs text-text-secondary">
                          <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-accent font-mono text-[11px]">Cmd + Shift + 4</span>
                          <span className="mx-1.5">→ 영역 선택 →</span>
                          <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-accent font-mono text-[11px]">Cmd + V</span>
                        </p>
                      </div>
                    </div>
                    <div className="bg-bg-elevated rounded-lg p-3 text-xs text-text-secondary space-y-1">
                      <p>1. 채용 공고 페이지에서 <strong className="text-text-primary">자격요건/우대사항</strong> 부분을 영역 캡처</p>
                      <p>2. 이 영역을 클릭한 후 붙여넣기 (여러 장 가능)</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-success font-medium">캡처 {jobScreenshots.length}장 등록됨</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setJobScreenshots([]) }}
                        className="text-xs text-text-secondary hover:text-danger transition-colors cursor-pointer"
                      >
                        전체 삭제
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {jobScreenshots.map((src, i) => (
                        <div key={i} className="relative group">
                          <img src={src} alt={`캡처 ${i + 1}`} className="h-24 rounded-lg border border-border object-cover" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setJobScreenshots((prev) => prev.filter((_, j) => j !== i))
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-text-secondary">추가 캡처를 더 붙여넣을 수 있습니다</p>
                  </div>
                )}
              </div>

              {hasJobInfo && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  공고 정보 등록됨 - 면접 시 맞춤형 질문이 포함됩니다
                </div>
              )}
            </section>
          )}

          {/* 기업 규모 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-secondary">기업 규모</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'small', label: '소규모', sub: '30명 이하', desc: '대표 + 실무 사수' },
                { id: 'medium', label: '중규모', sub: '100~200명', desc: '팀장 + HR + 임원' },
                { id: 'large', label: '대기업', sub: '1000명+', desc: '기술면접관 2명 + HR + 본부장' },
              ].map((size) => (
                <button
                  key={size.id}
                  onClick={() => setCompanySize(size.id)}
                  className={`p-4 rounded-xl border text-center transition-all cursor-pointer ${
                    companySize === size.id
                      ? 'border-accent bg-accent/10 ring-1 ring-accent'
                      : 'border-border bg-bg-card hover:border-accent/50'
                  }`}
                >
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{size.sub}</div>
                  <div className="text-xs text-text-secondary/60 mt-1">{size.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 면접 유형 */}
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
            {starting ? '준비 중...' : mainAdmin || remaining > 0
              ? mode === 'job' ? '공고 맞춤 면접 시작' : '면접 시작'
              : '면접 횟수가 없습니다 (관리자에게 문의)'}
          </button>
        </div>
      </div>
    </div>
  )
}
