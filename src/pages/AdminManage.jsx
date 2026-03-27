import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획' }

export default function AdminManage() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [subAdmins, setSubAdmins] = useState([])
  const [assignments, setAssignments] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState('sub_admin')

  // Hooks 이후에 조건부 렌더링 (React Hooks 규칙 준수)
  if (profile?.role !== 'main_admin') {
    return <Navigate to="/admin" replace />
  }
  const [assignTrack, setAssignTrack] = useState('')
  const [assignCohort, setAssignCohort] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: admins } = await supabase.from('users').select('*').in('role', ['sub_admin', 'main_admin'])
    const { data: assigns } = await supabase.from('admin_assignments').select('*')
    const { data: users } = await supabase.from('users').select('id, name, email, role')

    setSubAdmins((admins || []).filter((a) => a.id !== profile?.id)) // 본인 제외 전체 어드민
    setAssignments(assigns || [])
    setAllUsers(users || [])
    setLoading(false)
  }

  // 어드민 부여 (메인/서브 선택)
  async function handlePromote() {
    if (!selectedUser) return
    await supabase.from('users').update({ role: selectedRole }).eq('id', selectedUser)
    setSelectedUser(null)
    setSearchTerm('')
    setSelectedRole('sub_admin')
    await loadData()
  }

  // 서브 어드민 박탈
  async function handleDemote(userId) {
    await supabase.from('users').update({ role: 'student' }).eq('id', userId)
    await supabase.from('admin_assignments').delete().eq('admin_id', userId)
    await loadData()
  }

  // 트랙+기수 할당
  async function handleAssign(adminId) {
    if (!assignTrack || !assignCohort) return
    await supabase.from('admin_assignments').insert({
      admin_id: adminId, track: assignTrack, cohort: parseInt(assignCohort), assigned_by: profile.id,
    })
    setAssignTrack('')
    setAssignCohort('')
    await loadData()
  }

  // 할당 해제
  async function handleUnassign(assignId) {
    await supabase.from('admin_assignments').delete().eq('id', assignId)
    await loadData()
  }

  const searchResults = searchTerm.length >= 1
    ? allUsers.filter((u) => u.role === 'student' && (u.name || u.email).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : []

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">어드민 관리</h1>
          <button onClick={() => navigate('/admin')} className="text-sm text-text-secondary hover:text-text-primary cursor-pointer">돌아가기</button>
        </div>

        {loading ? <p className="text-text-secondary">로딩 중...</p> : (
          <>
            {/* 서브 어드민 부여 */}
            <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold">어드민 부여</h2>
              <input type="text" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelectedUser(null) }}
                placeholder="수강생 검색 (이름 또는 이메일)"
                className="w-full px-4 py-2.5 rounded-xl bg-bg-secondary border border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none" />
              {searchResults.length > 0 && !selectedUser && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {searchResults.map((u) => (
                    <button key={u.id} onClick={() => { setSelectedUser(u.id); setSearchTerm(u.name || u.email) }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-bg-elevated cursor-pointer">
                      {u.name || u.email}
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && (
                <div className="flex gap-3 items-center">
                  <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary">
                    <option value="sub_admin">서브 어드민</option>
                    <option value="main_admin">메인 어드민</option>
                  </select>
                  <button onClick={handlePromote} className="px-6 py-2 rounded-xl bg-accent text-white text-sm cursor-pointer">
                    지정
                  </button>
                </div>
              )}
            </div>

            {/* 현재 서브 어드민 목록 */}
            <div className="space-y-3">
              <h2 className="font-semibold">어드민 목록 ({subAdmins.length}명)</h2>
              {subAdmins.map((admin) => {
                const adminAssigns = assignments.filter((a) => a.admin_id === admin.id)
                return (
                  <div key={admin.id} className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{admin.name || admin.email}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${admin.role === 'main_admin' ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-secondary'}`}>
                            {admin.role === 'main_admin' ? '메인' : '서브'}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary">{admin.email}</p>
                      </div>
                      <button onClick={() => handleDemote(admin.id)}
                        className="text-xs text-danger hover:underline cursor-pointer">권한 박탈</button>
                    </div>

                    {/* 할당된 트랙+기수 */}
                    <div className="flex gap-2 flex-wrap">
                      {adminAssigns.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 bg-bg-elevated rounded-lg text-xs">
                          {TRACK_LABELS[a.track]} {a.cohort}기
                          <button onClick={() => handleUnassign(a.id)} className="text-text-secondary hover:text-danger cursor-pointer">x</button>
                        </span>
                      ))}
                    </div>

                    {/* 할당 추가 */}
                    <div className="flex gap-2 items-end">
                      <select value={assignTrack} onChange={(e) => setAssignTrack(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs text-text-primary">
                        <option value="">트랙</option>
                        {Object.entries(TRACK_LABELS).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                      <input type="text" inputMode="numeric" value={assignCohort}
                        onChange={(e) => setAssignCohort(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="기수" maxLength={3}
                        className="w-16 px-2 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs text-text-primary" />
                      <button onClick={() => handleAssign(admin.id)}
                        className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs cursor-pointer">추가</button>
                    </div>
                  </div>
                )
              })}
              {subAdmins.length === 0 && <p className="text-text-secondary text-sm">서브 어드민이 없습니다.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
