import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

export default function AdminDashboard() {
  const { profile } = useAuthStore()
  const isMain = profile?.role === 'main_admin'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const { data: sessions } = await supabase.from('interview_sessions').select('status, track')
    const { data: results } = await supabase.from('interview_results').select('overall_pass, overall_score')
    const { data: users } = await supabase.from('users').select('role').eq('role', 'student')

    const completed = sessions?.filter((s) => s.status === 'completed') || []
    const passed = results?.filter((r) => r.overall_pass) || []
    const avgScore = results?.length > 0
      ? Math.round(results.reduce((a, r) => a + (r.overall_score || 0), 0) / results.length)
      : 0

    setStats({
      totalStudents: users?.length || 0,
      totalSessions: completed.length,
      passCount: passed.length,
      passRate: completed.length > 0 ? Math.round((passed.length / results.length) * 100) : 0,
      avgScore,
    })
    setLoading(false)
  }

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">어드민 대시보드</h1>
          <span className="text-xs px-3 py-1 rounded-full bg-accent/15 text-accent">
            {isMain ? '메인 어드민' : '서브 어드민'}
          </span>
        </div>

        {loading ? (
          <p className="text-text-secondary">로딩 중...</p>
        ) : (
          <>
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalStudents}</p>
                <p className="text-xs text-text-secondary mt-1">수강생</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalSessions}</p>
                <p className="text-xs text-text-secondary mt-1">완료된 면접</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">{stats.passCount}</p>
                <p className="text-xs text-text-secondary mt-1">합격</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{stats.passRate}%</p>
                <p className="text-xs text-text-secondary mt-1">합격률</p>
              </div>
              <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{stats.avgScore}</p>
                <p className="text-xs text-text-secondary mt-1">평균 점수</p>
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
