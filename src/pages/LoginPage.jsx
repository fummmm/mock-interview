import { useAuthStore } from '../stores/authStore'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { user, loading, signInWithGoogle, error } = useAuthStore()

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
      {/* 배경 이미지 */}
      <div className="absolute inset-0">
        <img src="/login-bg.png" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* 콘텐츠 */}
      <div className="animate-fade-in relative z-10 mx-auto w-full max-w-2xl space-y-6 px-6 text-center">
        {/* 타이틀 */}
        <div className="space-y-3 text-center">
          <h1 className="text-5xl leading-none font-black tracking-tighter text-white sm:text-7xl">
            AI 모의면접 연습
          </h1>
          <p className="text-sm tracking-wide text-white/50">
            AI 면접관이 당신의 면접을 평가합니다
          </p>
        </div>

        {/* 로그인 버튼 */}
        <button
          onClick={signInWithGoogle}
          className="mx-auto flex w-full max-w-sm cursor-pointer items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-base font-bold text-gray-800 shadow-2xl transition-all hover:bg-gray-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google로 시작하기
        </button>

        {error && <p className="text-center text-sm text-red-400">{error}</p>}

        <p className="text-center text-xs text-white/30">팀스파르타 KDT 수강생 전용</p>
      </div>
    </div>
  )
}
