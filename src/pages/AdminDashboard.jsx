import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { behavioral: '인성면접', unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획', spring: 'Spring' }

export default function AdminDashboard() {
  const { profile, adminAssignments, loadAdminAssignments } = useAuthStore()
  const isMain = profile?.role === 'main_admin'

  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewTab, setViewTab] = useState('track')
  const [expanded, setExpanded] = useState(null) // 펼쳐진 행

  useEffect(() => { loadAdminAssignments(); loadData() }, [])

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

  const students = users.filter((u) => !u.role || u.role === 'student')
  const admins = users.filter((u) => u.role === 'admin' || u.role === 'main_admin')
  const studentIds = new Set(students.map((u) => u.id))
  const completedSessions = sessions.filter((s) => s.status === 'completed' && studentIds.has(s.user_id))
  const studentResults = results.filter((r) => studentIds.has(r.user_id))
  const passedResults = studentResults.filter((r) => r.overall_pass)
  const avgScore = studentResults.length > 0
    ? Math.round(studentResults.reduce((a, r) => a + (r.overall_score || 0), 0) / studentResults.length) : 0

  // 특정 조건의 통계 계산
  function calcStats(userIdSet, trackFilter) {
    const s = completedSessions.filter((x) => userIdSet.has(x.user_id) && (!trackFilter || x.track === trackFilter))
    const r = studentResults.filter((x) => userIdSet.has(x.user_id) && (!trackFilter || x.interview_sessions?.track === trackFilter))
    const passed = r.filter((x) => x.overall_pass)
    return {
      completed: s.length,
      passed: passed.length,
      passRate: r.length > 0 ? Math.round((passed.length / r.length) * 100) : 0,
      avgScore: r.length > 0 ? Math.round(r.reduce((a, x) => a + (x.overall_score || 0), 0) / r.length) : 0,
    }
  }

  // === 트랙별 데이터 ===
  const trackData = Object.keys(TRACK_LABELS).map((trackKey) => {
    const trackStudents = students.filter((u) => u.track === trackKey)
    const trackStudentIds = new Set(trackStudents.map((u) => u.id))
    const stats = calcStats(trackStudentIds, null)
    // 해당 트랙의 기수별 하위
    const cohorts = [...new Set(trackStudents.map((u) => u.cohort).filter(Boolean))].sort((a, b) => b - a)
    const subRows = cohorts.map((cohort) => {
      const ids = new Set(trackStudents.filter((u) => u.cohort === cohort).map((u) => u.id))
      return { cohort, students: ids.size, ...calcStats(ids, null) }
    })
    return { key: trackKey, label: TRACK_LABELS[trackKey], students: trackStudents.length, ...stats, subRows }
  }).filter((t) => t.students > 0)

  // === 기수별 데이터 ===
  const allCohorts = [...new Set(students.map((u) => u.cohort).filter(Boolean))].sort((a, b) => b - a)
  const cohortData = allCohorts.map((cohort) => {
    const cohortStudents = students.filter((u) => u.cohort === cohort)
    const cohortStudentIds = new Set(cohortStudents.map((u) => u.id))
    const stats = calcStats(cohortStudentIds, null)
    // 해당 기수의 트랙별 하위
    const tracks = [...new Set(cohortStudents.map((u) => u.track).filter(Boolean))]
    const subRows = tracks.map((trackKey) => {
      const ids = new Set(cohortStudents.filter((u) => u.track === trackKey).map((u) => u.id))
      return { track: trackKey, label: TRACK_LABELS[trackKey] || trackKey, students: ids.size, ...calcStats(ids, null) }
    }).filter((t) => t.students > 0)
    return { cohort, students: cohortStudents.length, ...stats, subRows }
  }).filter((c) => c.students > 0)

  const toggleExpand = (key) => setExpanded(expanded === key ? null : key)

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">어드민 대시보드</h1>
          <span className="text-xs px-3 py-1 rounded-full bg-accent/15 text-accent">
            {isMain ? '메인 어드민' : '서브 어드민'}
          </span>
        </div>

        {/* 내 담당 범위 */}
        {adminAssignments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-secondary">담당:</span>
            {adminAssignments.map((a, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-bg-card border border-border rounded-lg">
                {TRACK_LABELS[a.track] || a.track}{a.cohort > 0 ? ` ${a.cohort}기` : ' (전 기수)'}
              </span>
            ))}
          </div>
        )}
        {adminAssignments.length === 0 && !loading && (
          <p className="text-xs text-warning">담당 범위가 배정되지 않았습니다. 메인 어드민에게 문의하세요.</p>
        )}

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
                {[{ id: 'track', label: '트랙별' }, { id: 'cohort', label: '기수별' }].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setViewTab(tab.id); setExpanded(null) }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                      viewTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary text-left">
                      <th className="py-2.5 px-3 font-semibold">{viewTab === 'track' ? '트랙' : '기수'}</th>
                      <th className="py-2.5 px-3 text-right font-semibold">수강생</th>
                      <th className="py-2.5 px-3 text-right font-semibold">면접</th>
                      <th className="py-2.5 px-3 text-right font-semibold">합격</th>
                      <th className="py-2.5 px-3 text-right font-semibold">합격률</th>
                      <th className="py-2.5 px-3 text-right font-semibold">평균</th>
                      <th className="py-2.5 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewTab === 'track' ? trackData.map((row) => (
                      <StatsRow
                        key={row.key}
                        id={row.key}
                        label={row.label}
                        stats={row}
                        subRows={row.subRows}
                        subLabel={(sub) => `${sub.cohort}기`}
                        expanded={expanded === row.key}
                        onToggle={() => toggleExpand(row.key)}
                      />
                    )) : cohortData.map((row) => (
                      <StatsRow
                        key={row.cohort}
                        id={row.cohort}
                        label={`${row.cohort}기`}
                        stats={row}
                        subRows={row.subRows}
                        subLabel={(sub) => sub.label}
                        expanded={expanded === row.cohort}
                        onToggle={() => toggleExpand(row.cohort)}
                      />
                    ))}
                  </tbody>
                </table>
                {((viewTab === 'track' && trackData.length === 0) || (viewTab === 'cohort' && cohortData.length === 0)) && (
                  <p className="text-text-secondary text-sm py-4 text-center">데이터가 없습니다</p>
                )}
              </div>
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

/* 통계 행 + 하위 펼침 */
function StatsRow({ id, label, stats, subRows, subLabel, expanded, onToggle }) {
  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-bg-card/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 px-3 font-medium">{label}</td>
        <td className="py-2.5 px-3 text-right">{stats.students}</td>
        <td className="py-2.5 px-3 text-right">{stats.completed}</td>
        <td className="py-2.5 px-3 text-right text-success">{stats.passed}</td>
        <td className="py-2.5 px-3 text-right">{stats.passRate}%</td>
        <td className="py-2.5 px-3 text-right">{stats.avgScore}</td>
        <td className="py-2.5 px-3 text-center">
          {subRows.length > 0 && (
            <svg className={`w-4 h-4 text-text-secondary transition-transform inline-block ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </td>
      </tr>
      {expanded && subRows.map((sub, i) => (
        <tr key={i} className="bg-bg-card/30 border-b border-border/30">
          <td className="py-2 px-3 pl-8 text-text-secondary text-xs">{subLabel(sub)}</td>
          <td className="py-2 px-3 text-right text-xs">{sub.students}</td>
          <td className="py-2 px-3 text-right text-xs">{sub.completed}</td>
          <td className="py-2 px-3 text-right text-xs text-success">{sub.passed}</td>
          <td className="py-2 px-3 text-right text-xs">{sub.passRate}%</td>
          <td className="py-2 px-3 text-right text-xs">{sub.avgScore}</td>
          <td></td>
        </tr>
      ))}
    </>
  )
}
