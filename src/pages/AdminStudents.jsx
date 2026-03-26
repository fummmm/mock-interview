import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획', behavioral: '인성' }

export default function AdminStudents() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const isMain = profile?.role === 'main_admin'

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTrack, setFilterTrack] = useState('')
  const [filterCohort, setFilterCohort] = useState('')

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    setLoading(true)

    // 수강생 목록
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, track, cohort, role')
      .eq('role', 'student')
      .order('cohort', { ascending: false })

    // 각 수강생의 최신 결과
    const { data: results } = await supabase
      .from('interview_results')
      .select('user_id, overall_score, grade, overall_pass, created_at')
      .order('created_at', { ascending: false })

    // 쿼타
    const { data: quotas } = await supabase
      .from('interview_quotas')
      .select('user_id, total_quota, used_count')

    // 합치기
    const merged = (users || []).map((u) => {
      const userResults = (results || []).filter((r) => r.user_id === u.id)
      const latestResult = userResults[0] || null
      const q = (quotas || []).find((q) => q.user_id === u.id)
      const hasPass = userResults.some((r) => r.overall_pass)

      return {
        ...u,
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

  // 필터링
  const filtered = students.filter((s) => {
    if (filterTrack && s.track !== filterTrack) return false
    if (filterCohort && s.cohort !== parseInt(filterCohort)) return false
    return true
  })

  // 고유 기수 목록
  const cohorts = [...new Set(students.map((s) => s.cohort).filter(Boolean))].sort((a, b) => b - a)

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">수강생 관리</h1>
          <button onClick={() => navigate('/admin')} className="text-sm text-text-secondary hover:text-text-primary cursor-pointer">돌아가기</button>
        </div>

        {/* 필터 */}
        <div className="flex gap-3 flex-wrap">
          <select value={filterTrack} onChange={(e) => setFilterTrack(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-card border border-border text-sm text-text-primary">
            <option value="">전체 트랙</option>
            {Object.entries(TRACK_LABELS).filter(([k]) => k !== 'behavioral').map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-card border border-border text-sm text-text-primary">
            <option value="">전체 기수</option>
            {cohorts.map((c) => <option key={c} value={c}>{c}기</option>)}
          </select>
          <span className="text-sm text-text-secondary self-center">{filtered.length}명</span>
        </div>

        {loading ? (
          <p className="text-text-secondary text-center py-8">로딩 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary text-left">
                  <th className="py-3 px-2">이름</th>
                  <th className="py-3 px-2">트랙</th>
                  <th className="py-3 px-2">기수</th>
                  <th className="py-3 px-2 text-right">면접 횟수</th>
                  <th className="py-3 px-2 text-right">쿼타</th>
                  <th className="py-3 px-2 text-right">최근 점수</th>
                  <th className="py-3 px-2 text-center">합격 여부</th>
                  {isMain && <th className="py-3 px-2 text-center">리포트</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-bg-card/50">
                    <td className="py-3 px-2">{s.name || s.email}</td>
                    <td className="py-3 px-2 text-text-secondary">{TRACK_LABELS[s.track] || s.track}</td>
                    <td className="py-3 px-2 text-text-secondary">{s.cohort}기</td>
                    <td className="py-3 px-2 text-right">{s.interviewCount}</td>
                    <td className="py-3 px-2 text-right text-text-secondary">{s.quota}</td>
                    <td className="py-3 px-2 text-right">
                      {s.latestScore != null ? (
                        <span className={s.latestScore >= 70 ? 'text-success' : s.latestScore >= 50 ? 'text-warning' : 'text-danger'}>
                          {s.latestScore} ({s.latestGrade})
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.hasPass ? 'bg-success/15 text-success' : s.interviewCount > 0 ? 'bg-danger/15 text-danger' : 'bg-bg-elevated text-text-secondary'}`}>
                        {s.hasPass ? '합격' : s.interviewCount > 0 ? '미합격' : '미응시'}
                      </span>
                    </td>
                    {isMain && (
                      <td className="py-3 px-2 text-center">
                        {s.interviewCount > 0 && (
                          <button onClick={() => navigate(`/admin/student/${s.id}`)} className="text-xs text-accent hover:underline cursor-pointer">
                            보기
                          </button>
                        )}
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
