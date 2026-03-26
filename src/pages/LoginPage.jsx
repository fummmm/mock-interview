import { useAuthStore } from '../stores/authStore'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { user, loading, signInWithGoogle, error } = useAuthStore()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-secondary">로딩 중...</p>
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold">AI Mock Interview(테스트)</h1>
          <p className="text-text-secondary">AI 모의면접으로 면접 역량을 키워보세요</p>
          <p className="text-sm text-text-secondary">캠과 마이크로 답변하면 3명의 면접관이 평가합니다</p>
        </div>

        <div className="space-y-4">
          <div className="bg-bg-card border border-border rounded-2xl p-6 space-y-3 text-left text-sm">
            <div className="flex gap-3 items-start">
              <span className="text-accent shrink-0">1.</span>
              <span>면접 질문에 캠+마이크로 답변</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-accent shrink-0">2.</span>
              <span>AI가 음성 변환 + 답변 분석 + 비언어 분석</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-accent shrink-0">3.</span>
              <span>면접관 3명의 독립 평가 + 코치 총평 리포트</span>
            </div>
          </div>

          <button
            onClick={signInWithGoogle}
            className="w-full py-3 rounded-xl bg-white text-gray-800 font-semibold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 시작하기
          </button>

          {error && <p className="text-danger text-sm">{error}</p>}
        </div>
      </div>
    </div>
  )
}
