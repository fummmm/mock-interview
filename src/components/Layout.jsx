import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function Layout({ children }) {
  const { profile, signOut } = useAuthStore()
  const location = useLocation()

  // 면접 진행 중에는 네비 숨김
  const hideNav = ['/interview', '/analyzing'].includes(location.pathname)

  if (hideNav) return <>{children}</>

  return (
    <div className="flex-1 flex flex-col">
      <nav className="border-b border-border bg-bg-secondary px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">AI Mock Interview(테스트)</Link>

          <div className="flex items-center gap-4">
            {profile && (
              <>
                <Link
                  to="/mypage"
                  className={`text-sm transition-colors ${location.pathname === '/mypage' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  마이페이지
                </Link>

                {['main_admin', 'sub_admin'].includes(profile.role) && (
                  <Link
                    to="/admin"
                    className={`text-sm transition-colors ${location.pathname.startsWith('/admin') ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    어드민
                  </Link>
                )}

                <div className="flex items-center gap-2">
                  {profile.avatar_url && (
                    <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                  )}
                  <span className="text-sm text-text-secondary">{profile.name || profile.email}</span>
                </div>

                <button
                  onClick={signOut}
                  className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  로그아웃
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  )
}
