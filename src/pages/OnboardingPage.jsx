import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const TRACKS = [
  { id: 'unity', label: 'Unity' },
  { id: 'unreal', label: 'Unreal Engine' },
  { id: 'pm', label: 'PM' },
  { id: 'design', label: '게임기획' },
  { id: 'spring', label: 'Spring' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { profile, completeOnboarding } = useAuthStore()
  const [name, setName] = useState('')
  const [track, setTrack] = useState('')
  const [cohort, setCohort] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (profile?.onboarding_completed) return <Navigate to="/" replace />

  const canSave = name.trim() && track && cohort

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const ok = await completeOnboarding({ name: name.trim(), track, cohort })
    if (ok) {
      navigate('/')
    } else {
      setError('저장에 실패했습니다. 다시 시도해주세요.')
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">프로필 설정</h1>
          <p className="text-text-secondary">면접 연습을 시작하기 전에 기본 정보를 입력해주세요</p>
        </div>

        <div className="space-y-5">
          {/* 이름 */}
          <div className="space-y-2">
            <label className="text-text-secondary text-sm font-medium">본명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="본명을 입력해주세요"
              className="bg-bg-card border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent w-full rounded-xl border px-4 py-3 focus:outline-none"
            />
            <p className="text-text-secondary text-xs">
              관리자가 확인할 수 있도록 실명을 입력해주세요
            </p>
          </div>

          {/* 트랙 */}
          <div className="space-y-2">
            <label className="text-text-secondary text-sm font-medium">트랙</label>
            <div className="grid grid-cols-2 gap-2">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrack(t.id)}
                  className={`cursor-pointer rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                    track === t.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-bg-card text-text-secondary hover:border-accent/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 기수 */}
          <div className="space-y-2">
            <label className="text-text-secondary text-sm font-medium">기수</label>
            <input
              type="text"
              inputMode="numeric"
              value={cohort}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '')
                setCohort(v)
              }}
              placeholder="예: 6"
              maxLength={3}
              className="bg-bg-card border-border text-text-primary placeholder:text-text-secondary/50 focus:border-accent w-full [appearance:textfield] rounded-xl border px-4 py-3 focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSave || saving}
          className={`w-full rounded-xl py-4 text-lg font-semibold transition-all ${
            canSave && !saving
              ? 'bg-accent hover:bg-accent-hover cursor-pointer text-white'
              : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
          }`}
        >
          {saving ? '저장 중...' : '시작하기'}
        </button>
      </div>
    </div>
  )
}
