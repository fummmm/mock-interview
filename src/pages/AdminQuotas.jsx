import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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

  useEffect(() => {
    loadAdminAssignments().then(() => loadStudents())
  }, [])

  async function loadStudents() {
    setLoading(true)
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, track, cohort')
      .eq('role', 'student')

    const { data: quotas } = await supabase.from('interview_quotas').select('*')

    const merged = (users || []).map((u) => {
      const q = (quotas || []).find((q) => q.user_id === u.id)
      return {
        ...u,
        total_quota: q?.total_quota || 0,
        used_count: q?.used_count || 0,
      }
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
      .update({
        total_quota: student.total_quota + amount,
        updated_at: new Date().toISOString(),
      })
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

    const targets = students.filter(
      (s) =>
        s.track === batchTrack &&
        s.cohort === parseInt(batchCohort) &&
        canManageStudent(s.track, s.cohort),
    )
    if (targets.length === 0) {
      setBatchResult('해당 조건의 수강생이 없거나 권한이 없습니다.')
      return
    }

    let success = 0
    for (const t of targets) {
      const { error } = await supabase
        .from('interview_quotas')
        .update({
          total_quota: t.total_quota + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', t.id)
      if (!error) success++
    }

    setBatchResult(`${targets.length}명 중 ${success}명에게 ${amount}회 부여 완료`)
    await loadStudents()
  }

  const searchResults =
    searchTerm.length >= 1
      ? students
          .filter(
            (s) =>
              canManageStudent(s.track, s.cohort) &&
              (s.name || s.email).toLowerCase().includes(searchTerm.toLowerCase()),
          )
          .slice(0, 5)
      : []

  const cohorts = [...new Set(students.map((s) => s.cohort).filter(Boolean))].sort((a, b) => b - a)

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">면접 횟수 관리</h1>
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
            {/* 개별 부여 */}
            <div className="bg-bg-card border-border space-y-4 rounded-2xl border p-5">
              <h2 className="font-semibold">개별 부여</h2>
              <div className="space-y-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setSelectedUser(null)
                  }}
                  placeholder="수강생 이름 또는 이메일 검색"
                  className="bg-bg-secondary border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent w-full rounded-xl border px-4 py-2.5 focus:outline-none"
                />
                {searchResults.length > 0 && !selectedUser && (
                  <div className="border-border overflow-hidden rounded-xl border">
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedUser(s.id)
                          setSearchTerm(s.name || s.email)
                        }}
                        className="hover:bg-bg-elevated flex w-full cursor-pointer justify-between px-4 py-2.5 text-left text-sm transition-colors"
                      >
                        <span>
                          {s.name || s.email}{' '}
                          <span className="text-text-secondary">
                            (
                            {TRACK_LABELS[s.track] ||
                              (s.track === 'tester' ? '테스터' : s.track || '-')}
                            {s.cohort ? ` ${s.cohort}기` : ''})
                          </span>
                        </span>
                        <span className="text-text-secondary">
                          {s.used_count}/{s.total_quota}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-text-secondary text-xs">추가 횟수</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      className="bg-bg-secondary border-border text-text-primary focus:border-accent w-full rounded-xl border px-4 py-2.5 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAddQuota}
                    className="bg-accent cursor-pointer rounded-xl px-6 py-2.5 font-medium text-white"
                  >
                    부여
                  </button>
                </div>
              )}
            </div>

            {/* 일괄 부여 */}
            <div className="bg-bg-card border-border space-y-4 rounded-2xl border p-5">
              <h2 className="font-semibold">일괄 부여</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-text-secondary text-xs">트랙</label>
                  <CustomSelect
                    value={batchTrack}
                    onChange={setBatchTrack}
                    placeholder="선택"
                    options={Object.entries(TRACK_LABELS)
                      .filter(([k]) => k !== 'cs')
                      .map(([id, label]) => ({ value: id, label }))}
                  />
                </div>
                <div>
                  <label className="text-text-secondary text-xs">기수</label>
                  <CustomSelect
                    value={batchCohort}
                    onChange={setBatchCohort}
                    placeholder="선택"
                    options={cohorts.map((c) => ({
                      value: c.toString(),
                      label: `${c}기`,
                    }))}
                  />
                </div>
                <div>
                  <label className="text-text-secondary text-xs">추가 횟수</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={batchAmount}
                    onChange={(e) => setBatchAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    className="bg-bg-secondary border-border text-text-primary focus:border-accent w-full rounded-xl border px-3 py-2.5 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleBatchAdd}
                disabled={!batchTrack || !batchCohort}
                className="bg-accent cursor-pointer rounded-xl px-6 py-2.5 font-medium text-white disabled:opacity-50"
              >
                일괄 부여
              </button>
              {batchResult && <p className="text-success text-sm">{batchResult}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
