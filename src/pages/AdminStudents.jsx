import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획', behavioral: '인성' }
const TRACK_OPTIONS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획' }

export default function AdminStudents() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const isMain = profile?.role === 'main_admin'

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTrack, setFilterTrack] = useState('')
  const [filterCohort, setFilterCohort] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTrack, setEditTrack] = useState('')
  const [editCohort, setEditCohort] = useState('')

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
      .select('id, user_id, overall_score, grade, overall_pass, created_at')
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
        results: userResults.map((r) => ({ id: r.id, score: r.overall_score, grade: r.grade, pass: r.overall_pass, date: r.created_at })),
        latestResultId: latestResult?.id,
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
    await supabase.from('users').update({
      track: editTrack, cohort: parseInt(editCohort), updated_at: new Date().toISOString()
    }).eq('id', userId)
    setEditingId(null)
    await loadStudents()
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
                  <th className="py-3 px-2 text-center">수정</th>
                  {isMain && <th className="py-3 px-2 text-center">리포트</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-bg-card/50">
                    <td className="py-3 px-2">{s.name || s.email}</td>
                    {editingId === s.id ? (
                      <>
                        <td className="py-2 px-2">
                          <select value={editTrack} onChange={(e) => setEditTrack(e.target.value)}
                            className="px-2 py-1 rounded bg-bg-secondary border border-border text-xs text-text-primary">
                            {Object.entries(TRACK_OPTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input type="text" inputMode="numeric" value={editCohort}
                            onChange={(e) => setEditCohort(e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-14 px-2 py-1 rounded bg-bg-secondary border border-border text-xs text-text-primary" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-2 text-text-secondary">{TRACK_LABELS[s.track] || s.track}</td>
                        <td className="py-3 px-2 text-text-secondary">{s.cohort}기</td>
                      </>
                    )}
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
                    <td className="py-3 px-2 text-center">
                      {editingId === s.id ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => handleSaveStudent(s.id)} className="text-xs text-success hover:underline cursor-pointer">저장</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-text-secondary hover:underline cursor-pointer">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingId(s.id); setEditTrack(s.track); setEditCohort(s.cohort?.toString() || '') }}
                          className="text-xs text-text-secondary hover:text-accent cursor-pointer">수정</button>
                      )}
                    </td>
                    {isMain && (
                      <td className="py-3 px-2 text-center">
                        {s.results.length > 0 && (
                          s.results.length === 1 ? (
                            <button onClick={() => navigate(`/report/${s.results[0].id}`)} className="text-xs text-accent hover:underline cursor-pointer">
                              리포트
                            </button>
                          ) : (
                            <select
                              onChange={(e) => { if (e.target.value) navigate(`/report/${e.target.value}`) }}
                              defaultValue=""
                              className="text-xs bg-bg-secondary border border-border rounded px-1 py-0.5 text-text-primary cursor-pointer"
                            >
                              <option value="">리포트 ({s.results.length})</option>
                              {s.results.map((r, ri) => (
                                <option key={r.id} value={r.id}>
                                  {ri + 1}회 - {r.score}점 {r.pass ? '합격' : ''} ({new Date(r.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                </option>
                              ))}
                            </select>
                          )
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
