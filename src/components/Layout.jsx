import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function Layout({ children }) {
  const { profile, signOut } = useAuthStore()
  const location = useLocation()

  const hideNav = ['/interview', '/analyzing'].includes(location.pathname)
  if (hideNav) return <>{children}</>

  return (
    <div className="flex-1 flex flex-col">
      <nav className="border-b border-border bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-50 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <span className="font-bold text-sm">AI 모의면접 연습</span>
          </Link>

          <div className="flex items-center gap-3">
            {profile && (
              <>
                <Link
                  to="/"
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${location.pathname === '/' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  면접
                </Link>
                <Link
                  to="/mypage"
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${location.pathname === '/mypage' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  마이페이지
                </Link>

                {['main_admin', 'sub_admin'].includes(profile.role) && (
                  <Link
                    to="/admin"
                    className={`text-xs px-3 py-1.5 rounded-lg transition-all ${location.pathname.startsWith('/admin') ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    어드민
                  </Link>
                )}

                <div className="h-4 w-px bg-border mx-1" />

                <div className="flex items-center gap-2">
                  {profile.avatar_url && (
                    <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full ring-1 ring-border" />
                  )}
                  <span className="text-xs text-text-secondary hidden sm:inline">{profile.name || ''}</span>
                </div>

                <button
                  onClick={signOut}
                  className="text-xs text-text-secondary/60 hover:text-text-primary transition-colors cursor-pointer"
                >
                  로그아웃
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col animate-fade-in">
        {children}
      </main>
    </div>
  )
}
