import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import CustomSelect from '../components/CustomSelect'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal', pm: 'PM', design: '게임기획', spring: 'Spring', cs: 'CS지식' }

export default function AdminQuotas() {
  const navigate = useNavigate()
  const { canManageStudent, loadAdminAssignments } = useAuthStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)

  // 개별 부여
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [addAmount, setAddAmount] = useState('5')

  // 일괄 부여
  const [batchTrack, setBatchTrack] = useState('')
  const [batchCohort, setBatchCohort] = useState('')
  const [batchAmount, setBatchAmount] = useState('5')
  const [batchResult, setBatchResult] = useState('')

  useEffect(() => { loadAdminAssignments().then(() => loadStudents()) }, [])

  async function loadStudents() {
    setLoading(true)
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, track, cohort')
      .eq('role', 'student')

    const { data: quotas } = await supabase.from('interview_quotas').select('*')

    const merged = (users || []).map((u) => {
      const q = (quotas || []).find((q) => q.user_id === u.id)
      return { ...u, total_quota: q?.total_quota || 0, used_count: q?.used_count || 0 }
    })

    setStudents(merged)
    setLoading(false)
  }

  // 개별 쿼타 부여
  async function handleAddQuota() {
    if (!selectedUser || !addAmount) return
    const amount = parseInt(addAmount)
    if (isNaN(amount) || amount <= 0) return

    const student = students.find((s) => s.id === selectedUser)
    if (!student) return

    await supabase
      .from('interview_quotas')
      .update({ total_quota: student.total_quota + amount, updated_at: new Date().toISOString() })
      .eq('user_id', selectedUser)

    setSelectedUser(null)
    setAddAmount('5')
    await loadStudents()
  }

  // 일괄 쿼타 부여
  async function handleBatchAdd() {
    if (!batchTrack || !batchCohort || !batchAmount) return
    const amount = parseInt(batchAmount)
    if (isNaN(amount) || amount <= 0) return

    const targets = students.filter((s) => s.track === batchTrack && s.cohort === parseInt(batchCohort) && canManageStudent(s.track, s.cohort))
    if (targets.length === 0) { setBatchResult('해당 조건의 수강생이 없거나 권한이 없습니다.'); return }

    let success = 0
    for (const t of targets) {
      const { error } = await supabase
        .from('interview_quotas')
        .update({ total_quota: t.total_quota + amount, updated_at: new Date().toISOString() })
        .eq('user_id', t.id)
      if (!error) success++
    }

    setBatchResult(`${targets.length}명 중 ${success}명에게 ${amount}회 부여 완료`)
    await loadStudents()
  }

  const searchResults = searchTerm.length >= 1
    ? students.filter((s) => canManageStudent(s.track, s.cohort) && (s.name || s.email).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : []

  const cohorts = [...new Set(students.map((s) => s.cohort).filter(Boolean))].sort((a, b) => b - a)

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">면접 횟수 관리</h1>
          <button onClick={() => navigate('/admin')} className="text-sm text-text-secondary hover:text-text-primary cursor-pointer">돌아가기</button>
        </div>

        {loading ? <p className="text-text-secondary">로딩 중...</p> : (
          <>
            {/* 개별 부여 */}
            <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">개별 부여</h2>
              <div className="space-y-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setSelectedUser(null) }}
                  placeholder="수강생 이름 또는 이메일 검색"
                  className="w-full px-4 py-2.5 rounded-xl bg-bg-secondary border border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
                />
                {searchResults.length > 0 && !selectedUser && (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {searchResults.map((s) => (
                      <button key={s.id} onClick={() => { setSelectedUser(s.id); setSearchTerm(s.name || s.email) }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-bg-elevated transition-colors cursor-pointer flex justify-between">
                        <span>{s.name || s.email} <span className="text-text-secondary">({TRACK_LABELS[s.track]} {s.cohort}기)</span></span>
                        <span className="text-text-secondary">{s.used_count}/{s.total_quota}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-text-secondary">추가 횟수</label>
                    <input type="text" inputMode="numeric" value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full px-4 py-2.5 rounded-xl bg-bg-secondary border border-border text-text-primary focus:border-accent focus:outline-none" />
                  </div>
                  <button onClick={handleAddQuota}
                    className="px-6 py-2.5 rounded-xl bg-accent text-white font-medium cursor-pointer">
                    부여
                  </button>
                </div>
              )}
            </div>

            {/* 일괄 부여 */}
            <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">일괄 부여</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-text-secondary">트랙</label>
                  <CustomSelect
                    value={batchTrack}
                    onChange={setBatchTrack}
                    placeholder="선택"
                    options={Object.entries(TRACK_LABELS).filter(([k]) => k !== 'cs').map(([id, label]) => ({ value: id, label }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary">기수</label>
                  <CustomSelect
                    value={batchCohort}
                    onChange={setBatchCohort}
                    placeholder="선택"
                    options={cohorts.map((c) => ({ value: c.toString(), label: `${c}기` }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary">추가 횟수</label>
                  <input type="text" inputMode="numeric" value={batchAmount}
                    onChange={(e) => setBatchAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2.5 rounded-xl bg-bg-secondary border border-border text-text-primary focus:border-accent focus:outline-none" />
                </div>
              </div>
              <button onClick={handleBatchAdd} disabled={!batchTrack || !batchCohort}
                className="px-6 py-2.5 rounded-xl bg-accent text-white font-medium cursor-pointer disabled:opacity-50">
                일괄 부여
              </button>
              {batchResult && <p className="text-sm text-success">{batchResult}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
