import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import CustomSelect from '../components/CustomSelect'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = {
  unity: 'Unity',
  unreal: 'Unreal',
  pm: 'PM',
  design: '게임기획',
  spring: 'Spring',
  behavioral: '인성',
  cs: 'CS지식',
}
const TRACK_OPTIONS = {
  unity: 'Unity',
  unreal: 'Unreal',
  pm: 'PM',
  design: '게임기획',
  spring: 'Spring',
}

export default function AdminStudents() {
  const { profile, canManageStudent, loadAdminAssignments } = useAuthStore()
  const navigate = useNavigate()
  const isMain = profile?.role === 'main_admin'

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTrack, setFilterTrack] = useState('')
  const [filterCohort, setFilterCohort] = useState('')
  const [showPending, setShowPending] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTrack, setEditTrack] = useState('')
  const [editCohort, setEditCohort] = useState('')

  useEffect(() => {
    loadAdminAssignments().then(() => loadStudents())
  }, [])

  async function loadStudents() {
    setLoading(true)
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, track, cohort, role, onboarding_completed, created_at')
      .eq('role', 'student')
      .order('cohort', { ascending: false })

    const { data: results } = await supabase
      .from('interview_results')
      .select('id, user_id, overall_score, grade, overall_pass, created_at')
      .order('created_at', { ascending: false })

    const { data: quotas } = await supabase
      .from('interview_quotas')
      .select('user_id, total_quota, used_count')

    const merged = (users || []).map((u) => {
      const userResults = (results || []).filter((r) => r.user_id === u.id)
      const latestResult = userResults[0] || null
      const q = (quotas || []).find((q) => q.user_id === u.id)
      const hasPass = userResults.some((r) => r.overall_pass)
      return {
        ...u,
        results: userResults.map((r) => ({
          id: r.id,
          score: r.overall_score,
          grade: r.grade,
          pass: r.overall_pass,
          date: r.created_at,
        })),
        latestScore: latestResult?.overall_score,
        latestGrade: latestResult?.grade,
        hasPass,
        interviewCount: userResults.length,
        quota: q ? `${q.used_count}/${q.total_quota}` : '0/0',
      }
    })
    setStudents(merged)
    setLoading(false)
  }

  async function handleSaveStudent(userId) {
    await supabase
      .from('users')
      .update({
        track: editTrack,
        cohort: parseInt(editCohort),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    setEditingId(null)
    await loadStudents()
  }

  const pendingCount = students.filter((s) => !s.onboarding_completed).length

  const filtered = students.filter((s) => {
    // 온보딩 미완료 계정은 메인 어드민만, 토글 ON일 때만 노출
    if (!s.onboarding_completed) {
      if (!isMain || !showPending) return false
      return true
    }
    // 서브 어드민은 본인 배정 범위만
    if (!canManageStudent(s.track, s.cohort)) return false
    if (filterTrack && s.track !== filterTrack) return false
    if (filterCohort && s.cohort !== parseInt(filterCohort)) return false
    return true
  })

  const cohorts = [...new Set(students.map((s) => s.cohort).filter(Boolean))].sort((a, b) => b - a)

  async function handleDeletePending(userId, email) {
    if (!confirm(`${email} 계정을 삭제하시겠습니까?\n\n온보딩 미완료 상태이며, 이 수강생이 다시 로그인하면 계정이 재생성됩니다.`)) return
    // auth.users는 클라에서 못 지움 (admin API 필요). public.users만 삭제.
    // 재로그인 시 authStore.loadProfile의 PGRST116 fallback이 public.users를 재생성함.
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    await loadStudents()
  }

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">수강생 관리</h1>
          <button
            onClick={() => navigate('/admin')}
            className="text-text-secondary hover:text-text-primary cursor-pointer text-sm"
          >
            돌아가기
          </button>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-3">
          <CustomSelect
            value={filterTrack}
            onChange={setFilterTrack}
            placeholder="전체 트랙"
            className="w-36"
            options={[
              { value: '', label: '전체 트랙' },
              ...Object.entries(TRACK_LABELS)
                .filter(([k]) => k !== 'behavioral' && k !== 'cs')
                .map(([id, label]) => ({ value: id, label })),
              { value: 'tester', label: '테스터' },
            ]}
          />
          <CustomSelect
            value={filterCohort}
            onChange={setFilterCohort}
            placeholder="전체 기수"
            className="w-32"
            options={[
              { value: '', label: '전체 기수' },
              ...cohorts.map((c) => ({ value: c.toString(), label: `${c}기` })),
            ]}
          />
          {isMain && (
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showPending}
                onChange={(e) => setShowPending(e.target.checked)}
                className="accent-accent h-3.5 w-3.5 cursor-pointer"
              />
              <span className="text-text-secondary">
                온보딩 미완료 포함
                {pendingCount > 0 && (
                  <span className="bg-warning/15 text-warning ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]">
                    {pendingCount}
                  </span>
                )}
              </span>
            </label>
          )}
          <span className="text-text-secondary text-sm">{filtered.length}명</span>
        </div>

        {loading ? (
          <p className="text-text-secondary py-8 text-center">로딩 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-text-secondary border-b text-left">
                  <th className="px-2 py-3 font-semibold">이름</th>
                  <th className="px-2 py-3 font-semibold">이메일</th>
                  <th className="px-2 py-3 font-semibold">트랙</th>
                  <th className="px-2 py-3 font-semibold">기수</th>
                  <th className="px-2 py-3 text-right font-semibold">면접</th>
                  <th className="px-2 py-3 text-right font-semibold">쿼타</th>
                  <th className="px-2 py-3 text-right font-semibold">최근 점수</th>
                  <th className="px-2 py-3 text-center font-semibold">합격</th>
                  <th className="px-2 py-3 text-center font-semibold">수정</th>
                  {isMain && <th className="px-2 py-3 text-center font-semibold">리포트</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-border/50 hover:bg-bg-card/50 border-b ${!s.onboarding_completed ? 'opacity-60' : ''}`}
                  >
                    <td className="px-2 py-3 font-medium">
                      {s.name || '-'}
                      {!s.onboarding_completed && (
                        <span className="bg-warning/15 text-warning ml-1.5 rounded px-1.5 py-0.5 text-[10px]">
                          미완료
                        </span>
                      )}
                    </td>
                    <td className="text-text-secondary px-2 py-3 text-xs">{s.email}</td>
                    {editingId === s.id ? (
                      <>
                        <td className="px-2 py-2">
                          <CustomSelect
                            value={editTrack}
                            onChange={setEditTrack}
                            className="w-28"
                            options={Object.entries(TRACK_OPTIONS).map(([id, label]) => ({
                              value: id,
                              label,
                            }))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editCohort}
                            onChange={(e) => setEditCohort(e.target.value.replace(/[^0-9]/g, ''))}
                            className="bg-bg-secondary border-border text-text-primary w-14 rounded border px-2 py-1 text-xs"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-text-secondary px-2 py-3">
                          {TRACK_LABELS[s.track] || (s.track === 'tester' ? '테스터' : s.track) || '-'}
                        </td>
                        <td className="text-text-secondary px-2 py-3">{s.cohort ? `${s.cohort}기` : '-'}</td>
                      </>
                    )}
                    <td className="px-2 py-3 text-right">{s.interviewCount}</td>
                    <td className="text-text-secondary px-2 py-3 text-right">{s.quota}</td>
                    <td className="px-2 py-3 text-right">
                      {s.latestScore != null ? (
                        <span
                          className={
                            s.latestScore >= 70
                              ? 'text-success'
                              : s.latestScore >= 50
                                ? 'text-warning'
                                : 'text-danger'
                          }
                        >
                          {s.latestScore} ({s.latestGrade})
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${s.hasPass ? 'bg-success/15 text-success' : s.interviewCount > 0 ? 'bg-danger/15 text-danger' : 'bg-bg-elevated text-text-secondary'}`}
                      >
                        {s.hasPass ? '합격' : s.interviewCount > 0 ? '미합격' : '미응시'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {editingId === s.id ? (
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => handleSaveStudent(s.id)}
                            className="text-success cursor-pointer text-xs hover:underline"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-text-secondary cursor-pointer text-xs hover:underline"
                          >
                            취소
                          </button>
                        </div>
                      ) : !s.onboarding_completed ? (
                        <button
                          onClick={() => handleDeletePending(s.id, s.email)}
                          className="text-danger cursor-pointer text-xs hover:underline"
                        >
                          삭제
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(s.id)
                            setEditTrack(s.track)
                            setEditCohort(s.cohort?.toString() || '')
                          }}
                          className="text-text-secondary hover:text-accent cursor-pointer text-xs"
                        >
                          수정
                        </button>
                      )}
                    </td>
                    {isMain && (
                      <td className="px-2 py-3 text-center">
                        {s.results.length > 0 &&
                          (s.results.length === 1 ? (
                            <button
                              onClick={() => navigate(`/report/${s.results[0].id}`)}
                              className="text-accent cursor-pointer text-xs hover:underline"
                            >
                              보기
                            </button>
                          ) : (
                            <ReportDropdown
                              results={s.results}
                              onSelect={(id) => navigate(`/report/${id}`)}
                            />
                          ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* 커스텀 리포트 드롭다운 */
function ReportDropdown({ results, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-all ${
          open
            ? 'border-accent text-accent'
            : 'border-border text-text-secondary hover:border-accent/50'
        }`}
      >
        {results.length}회 면접
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="bg-bg-card border-border absolute right-0 bottom-full z-20 mb-1 min-w-[180px] overflow-hidden rounded-xl border shadow-lg">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r.id)
                setOpen(false)
              }}
              className="hover:bg-bg-elevated flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors"
            >
              <span>
                {i + 1}회 - {r.score}점{r.pass && <span className="text-success ml-1">합격</span>}
              </span>
              <span className="text-text-secondary/60">
                {new Date(r.date).toLocaleDateString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
