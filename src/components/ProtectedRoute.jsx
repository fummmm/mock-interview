import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-secondary">로딩 중...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return children
}

export function OnboardingGuard({ children }) {
  const { profile, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-secondary">로딩 중...</p>
      </div>
    )
  }

  if (profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}

export function AdminRoute({ children }) {
  const { profile, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-secondary">로딩 중...</p>
      </div>
    )
  }

  if (!profile || !['main_admin', 'sub_admin'].includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
