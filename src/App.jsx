import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import ProtectedRoute, { OnboardingGuard, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import SetupPage from './pages/SetupPage'
import InterviewPage from './pages/InterviewPage'
import AnalyzingPage from './pages/AnalyzingPage'
import ReportPage from './pages/ReportPage'

function App() {
  return (
    <Routes>
      {/* 공개 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 인증 필요 */}
      <Route path="/onboarding" element={
        <ProtectedRoute><OnboardingPage /></ProtectedRoute>
      } />

      {/* 인증 + 온보딩 완료 */}
      <Route path="/" element={
        <ProtectedRoute><OnboardingGuard><Layout><SetupPage /></Layout></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/interview" element={
        <ProtectedRoute><OnboardingGuard><InterviewPage /></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/analyzing" element={
        <ProtectedRoute><OnboardingGuard><AnalyzingPage /></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/report/:id" element={
        <ProtectedRoute><OnboardingGuard><Layout><ReportPage /></Layout></OnboardingGuard></ProtectedRoute>
      } />
      {/* 기존 /report (id 없음)도 지원 - 현재 세션 리포트용 */}
      <Route path="/report" element={
        <ProtectedRoute><OnboardingGuard><Layout><ReportPage /></Layout></OnboardingGuard></ProtectedRoute>
      } />

      {/* 마이페이지 (Step 4에서 구현) */}
      <Route path="/mypage" element={
        <ProtectedRoute><OnboardingGuard><Layout>
          <div className="flex-1 flex items-center justify-center"><p className="text-text-secondary">마이페이지 (준비 중)</p></div>
        </Layout></OnboardingGuard></ProtectedRoute>
      } />

      {/* 어드민 (Step 6에서 구현) */}
      <Route path="/admin/*" element={
        <ProtectedRoute><OnboardingGuard><AdminRoute><Layout>
          <div className="flex-1 flex items-center justify-center"><p className="text-text-secondary">어드민 (준비 중)</p></div>
        </Layout></AdminRoute></OnboardingGuard></ProtectedRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
