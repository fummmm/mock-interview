import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function Layout({ children }) {
  const { profile, signOut } = useAuthStore()
  const location = useLocation()

  const hideNav = ['/interview', '/analyzing'].includes(location.pathname)
  if (hideNav) return <>{children}</>

  return (
    <div className="flex flex-1 flex-col">
      <nav className="border-border bg-bg-secondary/80 sticky top-0 z-50 border-b px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-accent/15 flex h-7 w-7 items-center justify-center rounded-lg">
              <svg
                className="text-accent h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <span className="text-sm font-bold">AI 모의면접 연습</span>
          </Link>

          <div className="flex items-center gap-3">
            {profile && (
              <>
                <Link
                  to="/"
                  className={`rounded-lg px-3 py-1.5 text-xs transition-all ${location.pathname === '/' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  면접
                </Link>
                <Link
                  to="/mypage"
                  className={`rounded-lg px-3 py-1.5 text-xs transition-all ${location.pathname === '/mypage' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  마이페이지
                </Link>
                {['main_admin', 'sub_admin'].includes(profile.role) && (
                  <>
                    <Link
                      to="/resume-builder"
                      className={`rounded-lg px-3 py-1.5 text-xs transition-all ${location.pathname === '/resume-builder' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      이력서 빌더
                    </Link>
                    <Link
                      to="/admin"
                      className={`rounded-lg px-3 py-1.5 text-xs transition-all ${location.pathname.startsWith('/admin') ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      어드민
                    </Link>
                  </>
                )}

                <div className="bg-border mx-1 h-4 w-px" />

                <div className="flex items-center gap-2">
                  {profile.avatar_url && (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="ring-border h-6 w-6 rounded-full ring-1"
                    />
                  )}
                  <span className="text-text-secondary hidden text-xs sm:inline">
                    {profile.name || ''}
                  </span>
                </div>

                <button
                  onClick={signOut}
                  className="text-text-secondary/60 hover:text-text-primary cursor-pointer text-xs transition-colors"
                >
                  로그아웃
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="animate-fade-in flex flex-1 flex-col">{children}</main>
    </div>
  )
}
