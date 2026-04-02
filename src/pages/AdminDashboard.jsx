import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { behavioral: '인성면접', unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획' }

export default function AdminDashboard() {
  const { profile } = useAuthStore()
  const isMain = profile?.role === 'main_admin'

  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewTab, setViewTab] = useState('track') // 'track' | 'cohort'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [u, s, r] = await Promise.all([
      supabase.from('users').select('id, track, cohort, role'),
      supabase.from('interview_sessions').select('id, user_id, track, status'),
      supabase.from('interview_results').select('id, user_id, overall_pass, overall_score, created_at, interview_sessions(track)'),
    ])
    setUsers(u.data || [])
    setSessions(s.data || [])
    setResults(r.data || [])
    setLoading(false)
  }

  // 수강생/어드민 분리
  const students = users.filter((u) => !u.role || u.role === 'student')
  const admins = users.filter((u) => u.role === 'admin' || u.role === 'main_admin')

  // 전체 통계 (수강생만)
  const studentIds = new Set(students.map((u) => u.id))
  const completedSessions = sessions.filter((s) => s.status === 'completed' && studentIds.has(s.user_id))
  const studentResults = results.filter((r) => studentIds.has(r.user_id))
  const passedResults = studentResults.filter((r) => r.overall_pass)
  const avgScore = studentResults.length > 0
    ? Math.round(studentResults.reduce((a, r) => a + (r.overall_score || 0), 0) / studentResults.length)
    : 0

  // 트랙별 통계
  const trackStats = Object.keys(TRACK_LABELS).map((trackKey) => {
    const trackSessions = completedSessions.filter((s) => s.track === trackKey)
    const trackResults = studentResults.filter((r) => r.interview_sessions?.track === trackKey)
    const uniqueUsers = new Set(trackResults.map((r) => r.user_id))
    const passed = trackResults.filter((r) => r.overall_pass)
    const avg = trackResults.length > 0
      ? Math.round(trackResults.reduce((a, r) => a + (r.overall_score || 0), 0) / trackResults.length)
      : 0
    return {
      key: trackKey, label: TRACK_LABELS[trackKey],
      students: uniqueUsers.size, completed: trackSessions.length,
      passed: passed.length,
      passRate: trackResults.length > 0 ? Math.round((passed.length / trackResults.length) * 100) : 0,
      avgScore: avg,
    }
  }).filter((t) => t.completed > 0 || t.students > 0)

  // 기수별 통계
  const cohorts = [...new Set(students.map((u) => u.cohort).filter(Boolean))].sort((a, b) => b - a)
  const cohortStats = cohorts.map((cohort) => {
    const ids = new Set(students.filter((u) => u.cohort === cohort).map((u) => u.id))
    const cSessions = completedSessions.filter((s) => ids.has(s.user_id))
    const cResults = studentResults.filter((r) => ids.has(r.user_id))
    const passed = cResults.filter((r) => r.overall_pass)
    const avg = cResults.length > 0
      ? Math.round(cResults.reduce((a, r) => a + (r.overall_score || 0), 0) / cResults.length)
      : 0
    return {
      cohort, students: ids.size, completed: cSessions.length,
      passed: passed.length,
      passRate: cResults.length > 0 ? Math.round((passed.length / cResults.length) * 100) : 0,
      avgScore: avg,
    }
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
            {/* 전체 통계 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{students.length}</p>
                <p className="text-xs text-text-secondary mt-1">수강생</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-accent">{admins.length}</p>
                <p className="text-xs text-text-secondary mt-1">어드민</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{completedSessions.length}</p>
                <p className="text-xs text-text-secondary mt-1">완료된 면접</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">{passedResults.length}</p>
                <p className="text-xs text-text-secondary mt-1">합격</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{studentResults.length > 0 ? Math.round((passedResults.length / studentResults.length) * 100) : 0}%</p>
                <p className="text-xs text-text-secondary mt-1">합격률</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{avgScore}</p>
                <p className="text-xs text-text-secondary mt-1">평균 점수</p>
              </div>
            </div>

            {/* 트랙별 / 기수별 탭 */}
            <div className="space-y-3">
              <div className="flex gap-2 border-b border-border">
                {[
                  { id: 'track', label: '트랙별' },
                  { id: 'cohort', label: '기수별' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setViewTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                      viewTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {viewTab === 'track' ? (
                <div className="overflow-x-auto">
                  {trackStats.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-text-secondary text-left">
                          <th className="py-2.5 px-3 font-semibold">트랙</th>
                          <th className="py-2.5 px-3 text-right font-semibold">수강생</th>
                          <th className="py-2.5 px-3 text-right font-semibold">면접</th>
                          <th className="py-2.5 px-3 text-right font-semibold">합격</th>
                          <th className="py-2.5 px-3 text-right font-semibold">합격률</th>
                          <th className="py-2.5 px-3 text-right font-semibold">평균</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackStats.map((t) => (
                          <tr key={t.key} className="border-b border-border/50 hover:bg-bg-card/50">
                            <td className="py-2.5 px-3 font-medium">{t.label}</td>
                            <td className="py-2.5 px-3 text-right">{t.students}</td>
                            <td className="py-2.5 px-3 text-right">{t.completed}</td>
                            <td className="py-2.5 px-3 text-right text-success">{t.passed}</td>
                            <td className="py-2.5 px-3 text-right">{t.passRate}%</td>
                            <td className="py-2.5 px-3 text-right">{t.avgScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-text-secondary text-sm py-4 text-center">면접 데이터가 없습니다</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {cohortStats.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-text-secondary text-left">
                          <th className="py-2.5 px-3 font-semibold">기수</th>
                          <th className="py-2.5 px-3 text-right font-semibold">수강생</th>
                          <th className="py-2.5 px-3 text-right font-semibold">면접</th>
                          <th className="py-2.5 px-3 text-right font-semibold">합격</th>
                          <th className="py-2.5 px-3 text-right font-semibold">합격률</th>
                          <th className="py-2.5 px-3 text-right font-semibold">평균</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohortStats.map((c) => (
                          <tr key={c.cohort} className="border-b border-border/50 hover:bg-bg-card/50">
                            <td className="py-2.5 px-3 font-medium">{c.cohort}기</td>
                            <td className="py-2.5 px-3 text-right">{c.students}</td>
                            <td className="py-2.5 px-3 text-right">{c.completed}</td>
                            <td className="py-2.5 px-3 text-right text-success">{c.passed}</td>
                            <td className="py-2.5 px-3 text-right">{c.passRate}%</td>
                            <td className="py-2.5 px-3 text-right">{c.avgScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-text-secondary text-sm py-4 text-center">기수 데이터가 없습니다</p>
                  )}
                </div>
              )}
            </div>

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
