import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import CustomSelect from '../components/CustomSelect'

const TRACK_LABELS = {
  unity: 'Unity',
  unreal: 'Unreal',
  pm: 'PM',
  design: '게임기획',
  spring: 'Spring',
  cs: 'CS지식',
}

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

  if (profile?.role !== 'main_admin') {
    return <Navigate to="/admin" replace />
  }

  const [assignTrack, setAssignTrack] = useState('')
  const [assignCohort, setAssignCohort] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: admins } = await supabase
      .from('users')
      .select('*')
      .in('role', ['sub_admin', 'main_admin'])
    const { data: assigns } = await supabase.from('admin_assignments').select('*')
    const { data: users } = await supabase.from('users').select('id, name, email, role')

    setSubAdmins((admins || []).filter((a) => a.id !== profile?.id))
    setAssignments(assigns || [])
    setAllUsers(users || [])
    setLoading(false)
  }

  async function handlePromote() {
    if (!selectedUser) return
    await supabase.from('users').update({ role: selectedRole }).eq('id', selectedUser)
    setSelectedUser(null)
    setSearchTerm('')
    setSelectedRole('sub_admin')
    await loadData()
  }

  async function handleDemote(userId) {
    await supabase.from('users').update({ role: 'student' }).eq('id', userId)
    await supabase.from('admin_assignments').delete().eq('admin_id', userId)
    await loadData()
  }

  // 트랙+기수 할당 (메인 어드민은 트랙만, 서브 어드민은 트랙+기수)
  async function handleAssign(adminId, adminRole) {
    if (!assignTrack) return
    // 서브 어드민은 기수 필수
    if (adminRole === 'sub_admin' && !assignCohort) return

    const { error } = await supabase.from('admin_assignments').insert({
      admin_id: adminId,
      track: assignTrack,
      cohort: adminRole === 'main_admin' ? 0 : parseInt(assignCohort),
      assigned_by: profile.id,
    })
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('이미 동일한 트랙/기수가 할당되어 있습니다.')
      } else {
        alert('할당 실패: ' + error.message)
      }
      return
    }
    setAssignTrack('')
    setAssignCohort('')
    await loadData()
  }

  async function handleUnassign(assignId) {
    await supabase.from('admin_assignments').delete().eq('id', assignId)
    await loadData()
  }

  const searchResults =
    searchTerm.length >= 1
      ? allUsers
          .filter(
            (u) =>
              u.role === 'student' &&
              (u.name || u.email).toLowerCase().includes(searchTerm.toLowerCase()),
          )
          .slice(0, 5)
      : []

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">어드민 관리</h1>
          <button
            onClick={() => navigate('/admin')}
            className="text-text-secondary hover:text-text-primary cursor-pointer text-sm"
          >
            돌아가기
          </button>
        </div>

        {loading ? (
          <p className="text-text-secondary">로딩 중...</p>
        ) : (
          <>
            {/* 어드민 부여 */}
            <div className="bg-bg-card border-border space-y-3 rounded-2xl border p-5">
              <h2 className="font-semibold">어드민 부여</h2>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setSelectedUser(null)
                }}
                placeholder="수강생 검색 (이름 또는 이메일)"
                className="bg-bg-secondary border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent w-full rounded-xl border px-4 py-2.5 focus:outline-none"
              />
              {searchResults.length > 0 && !selectedUser && (
                <div className="border-border overflow-hidden rounded-xl border">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUser(u.id)
                        setSearchTerm(u.name || u.email)
                      }}
                      className="hover:bg-bg-elevated w-full cursor-pointer px-4 py-2 text-left text-sm"
                    >
                      {u.name || u.email}
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && (
                <div className="flex items-center gap-3">
                  <CustomSelect
                    value={selectedRole}
                    onChange={setSelectedRole}
                    className="w-52"
                    options={[
                      { value: 'sub_admin', label: '서브 어드민 (튜터/담임)' },
                      { value: 'main_admin', label: '메인 어드민 (총괄)' },
                    ]}
                  />
                  <button
                    onClick={handlePromote}
                    className="bg-accent cursor-pointer rounded-xl px-6 py-2 text-sm text-white"
                  >
                    지정
                  </button>
                </div>
              )}
            </div>

            {/* 역할 안내 */}
            <div className="bg-bg-card border-border space-y-2 rounded-xl border p-4">
              <h3 className="text-text-secondary text-xs font-semibold">역할별 권한</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <p className="text-accent font-medium">메인 어드민 (총괄)</p>
                  <p className="text-text-secondary">담당 트랙의 모든 기수 관리</p>
                  <p className="text-text-secondary">수강생 관리 + 쿼타 부여 + 리포트 열람</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">서브 어드민 (튜터/담임)</p>
                  <p className="text-text-secondary">배정된 트랙+기수만 관리</p>
                  <p className="text-text-secondary">수강생 관리 + 쿼타 부여 (리포트 열람 불가)</p>
                </div>
              </div>
            </div>

            {/* 어드민 목록 */}
            <div className="space-y-3">
              <h2 className="font-semibold">어드민 목록 ({subAdmins.length}명)</h2>
              {subAdmins.map((admin) => {
                const adminAssigns = assignments.filter((a) => a.admin_id === admin.id)
                const isAdminMain = admin.role === 'main_admin'
                return (
                  <div
                    key={admin.id}
                    className="bg-bg-card border-border space-y-3 rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{admin.name || admin.email}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${isAdminMain ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-secondary'}`}
                          >
                            {isAdminMain ? '메인 (총괄)' : '서브 (튜터/담임)'}
                          </span>
                        </div>
                        <p className="text-text-secondary text-xs">{admin.email}</p>
                      </div>
                      <button
                        onClick={() => handleDemote(admin.id)}
                        className="text-danger cursor-pointer text-xs hover:underline"
                      >
                        권한 박탈
                      </button>
                    </div>

                    {/* 할당된 범위 */}
                    <div className="flex flex-wrap gap-2">
                      {adminAssigns.map((a) => (
                        <span
                          key={a.id}
                          className="bg-bg-elevated inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs"
                        >
                          {TRACK_LABELS[a.track]}
                          {a.cohort > 0 ? ` ${a.cohort}기` : ' (전 기수)'}
                          <button
                            onClick={() => handleUnassign(a.id)}
                            className="text-text-secondary hover:text-danger ml-0.5 cursor-pointer"
                          >
                            x
                          </button>
                        </span>
                      ))}
                      {adminAssigns.length === 0 && (
                        <span className="text-warning text-xs">담당 범위 미배정</span>
                      )}
                    </div>

                    {/* 할당 추가 */}
                    <div className="flex items-end gap-2">
                      <CustomSelect
                        value={assignTrack}
                        onChange={setAssignTrack}
                        placeholder="트랙"
                        className="w-32"
                        options={Object.entries(TRACK_LABELS)
                          .filter(([k]) => k !== 'cs')
                          .map(([id, label]) => ({ value: id, label }))}
                      />
                      {!isAdminMain && (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={assignCohort}
                          onChange={(e) => setAssignCohort(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="기수"
                          maxLength={3}
                          className="bg-bg-secondary border-border text-text-primary w-16 rounded-lg border px-2 py-1.5 text-xs"
                        />
                      )}
                      <button
                        onClick={() => handleAssign(admin.id, admin.role)}
                        className="bg-accent cursor-pointer rounded-lg px-3 py-1.5 text-xs text-white"
                      >
                        추가
                      </button>
                    </div>
                    {isAdminMain && (
                      <p className="text-text-secondary text-xs">
                        메인 어드민은 트랙만 배정 (전 기수 관리)
                      </p>
                    )}
                  </div>
                )
              })}
              {subAdmins.length === 0 && (
                <p className="text-text-secondary text-sm">어드민이 없습니다.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
