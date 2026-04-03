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
  spring: 'Spring',
}

const COUNTS = [5, 6]

export default function SetupPage() {
  const navigate = useNavigate()
  const {
    companySize,
    track,
    questionCount,
    setCompanySize,
    setTrack,
    setQuestionCount,
    setMode: setStoreMode,
  } = useSettingsStore()
  const { loadQuestions, reset } = useInterviewStore()
  const { profile, quota, isMainAdmin } = useAuthStore()
  const mainAdmin = isMainAdmin()

  const userTrack = profile?.track
  const remaining = quota ? Math.max(0, quota.total_quota - quota.used_count) : 0

  const [starting, setStarting] = useState(false)
  const [docs, setDocs] = useState([])
  const [mode, _setMode] = useState('general')
  const setMode = (m) => {
    _setMode(m)
    setStoreMode(m)
  }

  // 공고 정보
  const [jobCompany, setJobCompany] = useState('')
  const [jobPosition, setJobPosition] = useState('')
  const [jobScreenshots, setJobScreenshots] = useState([])

  // 모드별 설정: 공고→behavioral/5개 고정, 하드→일반과 동일 선택
  const effectiveTrack = mode === 'job' ? 'behavioral' : track
  const effectiveCount = mode === 'job' ? 5 : questionCount
  const hasResume = docs.some((d) => d.doc_type === 'resume')
  const hasPortfolio = docs.some((d) => d.doc_type === 'portfolio')
  const hasJobInfo =
    mode === 'job' && (jobCompany.trim() || jobPosition.trim() || jobScreenshots.length > 0)
  const canStart = (mode === 'job' ? hasJobInfo : !!track) && (mainAdmin || remaining > 0)

  useEffect(() => {
    if (profile?.id) {
      supabase
        .from('user_documents')
        .select('doc_type')
        .eq('user_id', profile.id)
        .then(({ data }) => setDocs(data || []))
    }
  }, [profile?.id])

  const handleStart = async () => {
    if (!canStart || starting) return

    // 쿼타 차감 안내 (관리자 제외)
    if (!mainAdmin) {
      const r = remaining
      const msg =
        r <= 1
          ? `남은 면접 횟수가 ${r}회입니다. 시작하면 1회가 차감됩니다.\n\n면접을 시작하시겠습니까?`
          : `면접 횟수 1회가 차감됩니다. (남은 횟수: ${r}회 → ${r - 1}회)\n\n면접을 시작하시겠습니까?`
      if (!confirm(msg)) return
    }

    setStarting(true)

    reset()
    // settingsStore에 모드별 값 반영 (InterviewPage에서 참조)
    setStoreMode(mode)
    if (mode === 'job') {
      setTrack('behavioral')
      setQuestionCount(5)
    }
    let questions = getQuestions(effectiveCount, effectiveTrack, companySize)

    const customCount = mode === 'job' ? 3 : effectiveCount >= 6 ? 2 : 1
    try {
      let customQuestions = []

      // 공고 맞춤 모드: 공고 질문 생성 필수 (실패 시 면접 시작 안 함)
      if (hasJobInfo) {
        customQuestions = await generateJobPostingQuestions(
          {
            companyName: jobCompany,
            position: jobPosition,
            screenshots: jobScreenshots,
          },
          effectiveTrack,
          customCount,
        )
        if (mode === 'job' && customQuestions.length === 0) {
          alert('공고 분석에 실패했습니다. 캡처 이미지를 확인하고 다시 시도해주세요.')
          setStarting(false)
          return
        }
      }

      // 일반/하드 모드: 이력서/포폴 질문 보충 (CS면접은 제외)
      if (mode !== 'job' && effectiveTrack !== 'cs') {
        const docRemaining = customCount - customQuestions.length
        if (docRemaining > 0) {
          const { data: docs } = await supabase
            .from('user_documents')
            .select('extracted_text, doc_type')
            .eq('user_id', profile.id)

          const resume = docs.find((d) => d.doc_type === 'resume' && d.extracted_text?.length > 50)
          const portfolio = docs.find(
            (d) => d.doc_type === 'portfolio' && d.extracted_text?.length > 50,
          )
          // 이력서와 포폴을 명확히 구분하여 각각 충분한 분량 전달
          const parts = []
          if (resume) parts.push(`[이력서]\n${resume.extracted_text.slice(0, 2500)}`)
          if (portfolio) parts.push(`[포트폴리오]\n${portfolio.extracted_text.slice(0, 2500)}`)
          const docTexts = parts.join('\n\n---\n\n')

          if (docTexts) {
            const docQuestions = await generateDocumentQuestions(
              docTexts,
              effectiveTrack,
              docRemaining,
            )
            customQuestions = [...customQuestions, ...docQuestions]
          }
        }
      }

      if (customQuestions.length > 0) {
        const introIdx = questions.findIndex((q) => q.id === 'beh-intro')
        const insertAt = introIdx >= 0 ? introIdx + 1 : 1
        const base = [
          ...questions.slice(0, insertAt),
          ...questions.slice(insertAt + customQuestions.length),
        ]
        questions = [...base.slice(0, insertAt), ...customQuestions, ...base.slice(insertAt)].slice(
          0,
          effectiveCount,
        )
      }
    } catch (e) {
      if (mode === 'job') {
        alert('공고 분석 중 오류가 발생했습니다: ' + e.message)
        setStarting(false)
        return
      }
      console.warn('맞춤형 질문 생성 스킵:', e.message)
    }

    loadQuestions(questions)

    const { startSession } = useInterviewStore.getState()
    await startSession(profile.id, effectiveTrack, effectiveCount)

    const { refreshQuota } = useAuthStore.getState()
    await refreshQuota()

    setStarting(false)
    navigate('/interview')
  }

  return (
    <div className="relative flex flex-1 flex-col items-center p-4 sm:p-6 sm:pt-24">
      {/* 로딩 오버레이 */}
      {starting && (
        <div className="bg-bg-primary/50 absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-accent h-3 w-3 rounded-full"
                style={{
                  animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
          <p className="text-text-primary text-lg font-semibold">
            {hasJobInfo
              ? '면접관이 채용 공고를 분석하고 있습니다'
              : hasResume || hasPortfolio
                ? '면접관이 이력서와 포트폴리오를 열람하고 있습니다'
                : '면접을 준비하고 있습니다'}
          </p>
          <p className="text-text-secondary text-sm">잠시만 기다려주세요</p>
        </div>
      )}

      {/* 메인: 좌측 모드 선택 + 구분선 + 우측 콘텐츠 */}
      <div className="flex w-full max-w-5xl items-start gap-0">
        {/* 좌측 모드 선택 */}
        <div className="sticky top-6 flex w-48 shrink-0 flex-col gap-1 pt-2 pr-6">
          {[
            { id: 'general', label: '일반 모의면접', sub: '트랙별 기본 질문' },
            { id: 'hard', label: '하드모드', sub: '질문에 즉각적인 답변요구' },
            { id: 'job', label: '공고 맞춤 면접', sub: '채용 공고 기반 질문' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`group relative cursor-pointer rounded-r-lg px-4 py-3 text-left transition-all ${
                mode === m.id ? 'bg-accent/5' : 'hover:bg-bg-elevated/50'
              }`}
            >
              {/* 좌측 인디케이터 바 */}
              <div
                className={`absolute top-2 bottom-2 left-0 w-[3px] rounded-full transition-all ${
                  mode === m.id ? 'bg-accent' : 'group-hover:bg-border bg-transparent'
                }`}
              />
              <div
                className={`text-sm font-semibold transition-colors ${
                  mode === m.id ? 'text-accent' : 'text-text-primary'
                }`}
              >
                {m.label}
              </div>
              <div
                className={`mt-0.5 text-xs transition-colors ${
                  mode === m.id ? 'text-accent/60' : 'text-text-secondary/60'
                }`}
              >
                {m.sub}
              </div>
            </button>
          ))}
        </div>

        {/* 구분선 */}
        <div className="bg-border w-px shrink-0 self-stretch" />

        {/* 우측 콘텐츠 */}
        <div className="min-w-0 flex-1 space-y-8 pl-6">
          {/* 헤더 */}
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">AI 모의면접 연습</h1>
            <div
              className={`inline-block rounded-full px-4 py-1.5 text-sm ${mainAdmin || remaining > 0 ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}
            >
              {mainAdmin ? '관리자 (무제한)' : `남은 면접 횟수: ${remaining}회`}
            </div>
            <div className="mt-1 flex items-center justify-center gap-4 text-sm">
              <span
                className={`flex items-center gap-1.5 ${hasResume ? 'text-success' : 'text-text-secondary'}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${hasResume ? 'bg-success' : 'bg-text-secondary/30'}`}
                />
                이력서 {hasResume ? '등록' : '미등록'}
              </span>
              <span className="text-border">|</span>
              <span
                className={`flex items-center gap-1.5 ${hasPortfolio ? 'text-success' : 'text-text-secondary'}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${hasPortfolio ? 'bg-success' : 'bg-text-secondary/30'}`}
                />
                포트폴리오 {hasPortfolio ? '등록' : '미등록'}
              </span>
            </div>
          </div>

          {/* 기업 규모 (항상 같은 위치) */}
          <section className="space-y-3">
            <h2 className="text-text-secondary text-lg font-semibold">기업 규모</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: 'small',
                  label: '스타트업',
                  sub: '소규모 팀, 실무 중심',
                  desc: '대표 + 실무 사수',
                },
                {
                  id: 'medium',
                  label: '중소/중견',
                  sub: '팀 단위 종합 면접',
                  desc: '팀장 + HR + 임원',
                },
                {
                  id: 'large',
                  label: '대기업',
                  sub: '체계적이고 높은 수준을 요하는 면접',
                  desc: '기술면접관 2명 + HR + 본부장',
                },
              ].map((size) => (
                <button
                  key={size.id}
                  onClick={() => setCompanySize(size.id)}
                  className={`relative cursor-pointer rounded-xl border p-4 text-center transition-all ${
                    companySize === size.id
                      ? 'border-accent bg-accent/10 ring-accent ring-1'
                      : 'border-border bg-bg-card hover:border-accent/50'
                  }`}
                >
                  {size.id === 'large' && (
                    <div className="group absolute top-2 right-2">
                      <span className="bg-accent/20 text-accent flex h-5 w-5 cursor-help items-center justify-center rounded-full text-xs">
                        ?
                      </span>
                      <div className="bg-bg-primary border-border invisible absolute top-0 left-full z-30 ml-2 w-64 rounded-xl border p-3 text-left opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100">
                        <p className="text-text-primary text-xs leading-relaxed">
                          같은 개념에 대한 질문이라도 높은 이해도를 요구하는 질문이 주어지며, 답변에
                          대한 판단과 점수 책정 기준, 합격 기준이 다른 기업 규모 선택지보다 높게
                          설정되어 있습니다.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-text-secondary mt-0.5 text-xs">{size.sub}</div>
                  <div className="text-text-secondary/60 mt-1 text-xs">{size.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 모드별 콘텐츠 */}
          {mode !== 'job' ? (
            <>
              {/* 면접 유형 */}
              <section className="space-y-3">
                <h2 className="text-text-secondary text-lg font-semibold">면접 유형</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setTrack('behavioral')}
                    className={`cursor-pointer rounded-xl border p-5 text-left transition-all ${
                      track === 'behavioral'
                        ? 'border-accent bg-accent/10 ring-accent ring-1'
                        : 'border-border bg-bg-card hover:border-accent/50'
                    }`}
                  >
                    <div className="font-semibold">인성면접 (공통)</div>
                    <div className="text-text-secondary mt-1 text-sm">
                      직군 무관, 인성/역량 중심 질문
                    </div>
                  </button>
                  <button
                    onClick={() => setTrack('cs')}
                    className={`cursor-pointer rounded-xl border p-5 text-left transition-all ${
                      track === 'cs'
                        ? 'border-accent bg-accent/10 ring-accent ring-1'
                        : 'border-border bg-bg-card hover:border-accent/50'
                    }`}
                  >
                    <div className="font-semibold">CS 지식 면접 (공통)</div>
                    <div className="text-text-secondary mt-1 text-sm">
                      OS, 네트워크, 자료구조, DB 기초
                    </div>
                  </button>

                  {mainAdmin
                    ? Object.entries(TRACK_LABELS).map(([key, label]) => {
                        const sub =
                          key === 'pm' || key === 'design' ? '직무 전문 질문' : '기술 전문 질문'
                        return (
                          <button
                            key={key}
                            onClick={() => setTrack(key)}
                            className={`cursor-pointer rounded-xl border p-5 text-left transition-all ${
                              track === key
                                ? 'border-accent bg-accent/10 ring-accent ring-1'
                                : 'border-border bg-bg-card hover:border-accent/50'
                            }`}
                          >
                            <div className="font-semibold">{label} 면접</div>
                            <div className="text-text-secondary mt-1 text-sm">{sub}</div>
                          </button>
                        )
                      })
                    : userTrack &&
                      TRACK_LABELS[userTrack] && (
                        <button
                          onClick={() => setTrack(userTrack)}
                          className={`cursor-pointer rounded-xl border p-5 text-left transition-all ${
                            track === userTrack
                              ? 'border-accent bg-accent/10 ring-accent ring-1'
                              : 'border-border bg-bg-card hover:border-accent/50'
                          }`}
                        >
                          <div className="font-semibold">{TRACK_LABELS[userTrack]} 면접</div>
                          <div className="text-text-secondary mt-1 text-sm">
                            {userTrack === 'pm' || userTrack === 'design'
                              ? '직무 전문 질문'
                              : '기술 전문 질문'}
                          </div>
                        </button>
                      )}
                </div>
              </section>

              {/* 질문 수 */}
              <section className="space-y-3">
                <h2 className="text-text-secondary text-lg font-semibold">질문 수</h2>
                <div className="flex gap-3">
                  {COUNTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setQuestionCount(c)}
                      className={`h-16 w-16 cursor-pointer rounded-xl border text-xl font-bold transition-all ${
                        questionCount === c
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-bg-card hover:border-accent/50 text-text-secondary'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-text-secondary text-xs">
                  꼬리질문으로 인한 추가 질문이 발생할 수 있습니다.
                </p>
              </section>
            </>
          ) : (
            <>
              {/* 채용 공고 정보 */}
              <section className="space-y-4">
                <h2 className="text-text-secondary text-lg font-semibold">채용 공고 정보</h2>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={jobCompany}
                    onChange={(e) => setJobCompany(e.target.value)}
                    placeholder="회사명 (선택)"
                    className="bg-bg-card border-border text-text-primary placeholder:text-text-secondary/40 focus:border-accent rounded-xl border px-4 py-3 text-sm focus:outline-none"
                  />
                  <input
                    value={jobPosition}
                    onChange={(e) => setJobPosition(e.target.value)}
                    placeholder="지원 직무 (선택)"
                    className="bg-bg-card border-border text-text-primary placeholder:text-text-secondary/40 focus:border-accent rounded-xl border px-4 py-3 text-sm focus:outline-none"
                  />
                </div>
                <p className="text-text-secondary text-xs">
                  입력하면 해당 회사/직무에 맞는 더 정교한 질문이 생성됩니다
                </p>

                {/* 스크린샷 붙여넣기 */}
                <div
                  className={`relative rounded-xl border-2 border-dashed p-4 transition-all ${
                    jobScreenshots.length > 0
                      ? 'border-success bg-success/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items
                    if (!items) return
                    for (const item of items) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault()
                        const blob = item.getAsFile()
                        // 이미지 리사이즈 (최대 1200px, JPEG 80%) - API 요청 크기 절감
                        const img = new Image()
                        img.onload = () => {
                          const maxW = 1200
                          let w = img.width,
                            h = img.height
                          if (w > maxW) {
                            h = Math.round(h * (maxW / w))
                            w = maxW
                          }
                          const canvas = document.createElement('canvas')
                          canvas.width = w
                          canvas.height = h
                          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
                          const resized = canvas.toDataURL('image/jpeg', 0.8)
                          setJobScreenshots((prev) => [...prev, resized])
                          URL.revokeObjectURL(img.src)
                        }
                        img.src = URL.createObjectURL(blob)
                      }
                    }
                  }}
                  tabIndex={0}
                >
                  {jobScreenshots.length === 0 ? (
                    <div className="space-y-3 py-3 text-center">
                      <p className="text-text-primary text-sm font-medium">
                        자격요건 / 우대사항 캡처 붙여넣기
                      </p>
                      <div className="flex justify-center gap-6">
                        <div className="text-left">
                          <p className="text-text-secondary/60 mb-1 text-xs">Windows</p>
                          <p className="text-text-secondary text-xs">
                            <span className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 font-mono text-[11px]">
                              Win + Shift + S
                            </span>
                            <span className="mx-1.5">→ 영역 선택 →</span>
                            <span className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 font-mono text-[11px]">
                              Ctrl + V
                            </span>
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-text-secondary/60 mb-1 text-xs">Mac</p>
                          <p className="text-text-secondary text-xs">
                            <span className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 font-mono text-[11px]">
                              Cmd + Shift + 4
                            </span>
                            <span className="mx-1.5">→ 영역 선택 →</span>
                            <span className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 font-mono text-[11px]">
                              Cmd + V
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="bg-bg-elevated text-text-secondary space-y-1 rounded-lg p-3 text-xs">
                        <p>
                          1. 채용 공고 페이지에서{' '}
                          <strong className="text-text-primary">자격요건/우대사항</strong> 부분을
                          영역 캡처
                        </p>
                        <p>2. 이 영역을 클릭한 후 붙여넣기 (여러 장 가능)</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-success text-sm font-medium">
                          캡처 {jobScreenshots.length}장 등록됨
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setJobScreenshots([])
                          }}
                          className="text-text-secondary hover:text-danger cursor-pointer text-xs transition-colors"
                        >
                          전체 삭제
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {jobScreenshots.map((src, i) => (
                          <div key={i} className="group relative">
                            <img
                              src={src}
                              alt={`캡처 ${i + 1}`}
                              className="border-border h-24 rounded-lg border object-cover"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setJobScreenshots((prev) => prev.filter((_, j) => j !== i))
                              }}
                              className="bg-danger absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-text-secondary text-xs">
                        추가 캡처를 더 붙여넣을 수 있습니다
                      </p>
                    </div>
                  )}
                </div>

                {hasJobInfo && (
                  <div className="text-success flex items-center gap-2 text-sm">
                    <span className="bg-success h-2 w-2 rounded-full" />
                    공고 정보 등록됨 - 면접 시 맞춤형 질문이 포함됩니다
                  </div>
                )}
              </section>

              {/* 질문 수 고정 안내 */}
              <div className="bg-bg-card border-border flex items-center gap-3 rounded-xl border p-4">
                <span className="text-accent text-2xl font-bold">5</span>
                <div>
                  <p className="text-sm font-medium">질문 5개 고정</p>
                  <p className="text-text-secondary text-xs">
                    채용 공고 기반 맞춤 질문을 포함하여 준비됩니다
                  </p>
                </div>
              </div>
            </>
          )}

          {/* 시작 버튼 */}
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className={`w-full rounded-xl py-4 text-lg font-semibold transition-all ${
              canStart && !starting
                ? 'bg-accent hover:bg-accent-hover cursor-pointer text-white'
                : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
            }`}
          >
            {starting
              ? '준비 중...'
              : mainAdmin || remaining > 0
                ? mode === 'job'
                  ? '공고 맞춤 면접 시작'
                  : mode === 'hard'
                    ? '하드모드 면접 시작'
                    : '면접 시작'
                : '면접 횟수가 없습니다 (관리자에게 문의)'}
          </button>
        </div>
      </div>
    </div>
  )
}
