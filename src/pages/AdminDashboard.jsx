import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획' }

export default function AdminDashboard() {
  const { profile } = useAuthStore()
  const isMain = profile?.role === 'main_admin'

  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  const [filterTrack, setFilterTrack] = useState('')
  const [filterCohort, setFilterCohort] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [u, s, r] = await Promise.all([
      supabase.from('users').select('id, track, cohort, role').eq('role', 'student'),
      supabase.from('interview_sessions').select('id, user_id, track, status'),
      supabase.from('interview_results').select('id, user_id, overall_pass, overall_score, created_at, interview_sessions(track)'),
    ])
    setUsers(u.data || [])
    setSessions(s.data || [])
    setResults(r.data || [])
    setLoading(false)
  }

  // 필터 적용된 유저 ID 셋
  const filteredUserIds = new Set(
    users
      .filter((u) => (!filterTrack || u.track === filterTrack) && (!filterCohort || u.cohort === parseInt(filterCohort)))
      .map((u) => u.id)
  )

  // 필터 적용된 통계
  function calcStats(userIds) {
    const s = sessions.filter((x) => x.status === 'completed' && userIds.has(x.user_id))
    const r = results.filter((x) => userIds.has(x.user_id))
    const passed = r.filter((x) => x.overall_pass)
    const avg = r.length > 0 ? Math.round(r.reduce((a, x) => a + (x.overall_score || 0), 0) / r.length) : 0
    return {
      students: userIds.size,
      completed: s.length,
      passed: passed.length,
      passRate: r.length > 0 ? Math.round((passed.length / r.length) * 100) : 0,
      avgScore: avg,
    }
  }

  const stats = calcStats(filteredUserIds)

  // 트랙별 통계
  const trackStats = Object.keys(TRACK_LABELS).map((track) => {
    const ids = new Set(users.filter((u) => u.track === track && (!filterCohort || u.cohort === parseInt(filterCohort))).map((u) => u.id))
    return { track, label: TRACK_LABELS[track], ...calcStats(ids) }
  }).filter((t) => t.students > 0)

  // 기수별 통계
  const cohorts = [...new Set(users.map((u) => u.cohort).filter(Boolean))].sort((a, b) => b - a)
  const cohortStats = cohorts.map((cohort) => {
    const ids = new Set(users.filter((u) => u.cohort === cohort && (!filterTrack || u.track === filterTrack)).map((u) => u.id))
    return { cohort, ...calcStats(ids) }
  }).filter((c) => c.students > 0)

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">어드민 대시보드</h1>
          <span className="text-xs px-3 py-1 rounded-full bg-accent/15 text-accent">
            {isMain ? '메인 어드민' : '서브 어드민'}
          </span>
        </div>

        {loading ? <p className="text-text-secondary">로딩 중...</p> : (
          <>
            {/* 필터 */}
            <div className="flex gap-3 flex-wrap">
              <select value={filterTrack} onChange={(e) => setFilterTrack(e.target.value)}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-sm text-text-primary">
                <option value="">전체 트랙</option>
                {Object.entries(TRACK_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <select value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-sm text-text-primary">
                <option value="">전체 기수</option>
                {cohorts.map((c) => <option key={c} value={c}>{c}기</option>)}
              </select>
              {(filterTrack || filterCohort) && (
                <button onClick={() => { setFilterTrack(''); setFilterCohort('') }}
                  className="text-xs text-text-secondary hover:text-text-primary cursor-pointer">초기화</button>
              )}
            </div>

            {/* 전체 통계 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { value: stats.students, label: '수강생' },
                { value: stats.completed, label: '완료된 면접' },
                { value: stats.passed, label: '합격', color: 'text-success' },
                { value: `${stats.passRate}%`, label: '합격률' },
                { value: stats.avgScore, label: '평균 점수' },
              ].map((s, i) => (
                <div key={i} className="bg-bg-card border border-border rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color || ''}`}>{s.value}</p>
                  <p className="text-xs text-text-secondary mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 트랙별 통계 */}
            {!filterTrack && trackStats.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm text-text-secondary">트랙별</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-text-secondary text-left">
                        <th className="py-2 px-3">트랙</th>
                        <th className="py-2 px-3 text-right">수강생</th>
                        <th className="py-2 px-3 text-right">면접</th>
                        <th className="py-2 px-3 text-right">합격</th>
                        <th className="py-2 px-3 text-right">합격률</th>
                        <th className="py-2 px-3 text-right">평균</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackStats.map((t) => (
                        <tr key={t.track} className="border-b border-border/50 hover:bg-bg-card/50 cursor-pointer"
                          onClick={() => setFilterTrack(t.track)}>
                          <td className="py-2 px-3 font-medium">{t.label}</td>
                          <td className="py-2 px-3 text-right">{t.students}</td>
                          <td className="py-2 px-3 text-right">{t.completed}</td>
                          <td className="py-2 px-3 text-right text-success">{t.passed}</td>
                          <td className="py-2 px-3 text-right">{t.passRate}%</td>
                          <td className="py-2 px-3 text-right">{t.avgScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 기수별 통계 (특정 트랙 선택 시에만 표시) */}
            {filterTrack && !filterCohort && cohortStats.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm text-text-secondary">기수별</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-text-secondary text-left">
                        <th className="py-2 px-3">기수</th>
                        <th className="py-2 px-3 text-right">수강생</th>
                        <th className="py-2 px-3 text-right">면접</th>
                        <th className="py-2 px-3 text-right">합격</th>
                        <th className="py-2 px-3 text-right">합격률</th>
                        <th className="py-2 px-3 text-right">평균</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortStats.map((c) => (
                        <tr key={c.cohort} className="border-b border-border/50 hover:bg-bg-card/50 cursor-pointer"
                          onClick={() => setFilterCohort(c.cohort.toString())}>
                          <td className="py-2 px-3 font-medium">{c.cohort}기</td>
                          <td className="py-2 px-3 text-right">{c.students}</td>
                          <td className="py-2 px-3 text-right">{c.completed}</td>
                          <td className="py-2 px-3 text-right text-success">{c.passed}</td>
                          <td className="py-2 px-3 text-right">{c.passRate}%</td>
                          <td className="py-2 px-3 text-right">{c.avgScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 메뉴 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/admin/students" className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-all">
                <p className="font-semibold">수강생 관리</p>
                <p className="text-sm text-text-secondary mt-1">수강생 목록, 합격 여부, 면접 기록 확인</p>
              </Link>
              <Link to="/admin/quotas" className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-all">
                <p className="font-semibold">면접 횟수 관리</p>
                <p className="text-sm text-text-secondary mt-1">개별/일괄 면접 횟수 부여</p>
              </Link>
              {isMain && (
                <Link to="/admin/admins" className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-all">
                  <p className="font-semibold">어드민 관리</p>
                  <p className="text-sm text-text-secondary mt-1">서브 어드민 부여/박탈, 트랙+기수 할당</p>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
