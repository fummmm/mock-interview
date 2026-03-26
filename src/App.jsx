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
import MyPage from './pages/MyPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminStudents from './pages/AdminStudents'
import AdminQuotas from './pages/AdminQuotas'
import AdminManage from './pages/AdminManage'

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

      <Route path="/mypage" element={
        <ProtectedRoute><OnboardingGuard><Layout><MyPage /></Layout></OnboardingGuard></ProtectedRoute>
      } />

      <Route path="/admin" element={
        <ProtectedRoute><OnboardingGuard><AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/admin/students" element={
        <ProtectedRoute><OnboardingGuard><AdminRoute><Layout><AdminStudents /></Layout></AdminRoute></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/admin/quotas" element={
        <ProtectedRoute><OnboardingGuard><AdminRoute><Layout><AdminQuotas /></Layout></AdminRoute></OnboardingGuard></ProtectedRoute>
      } />
      <Route path="/admin/admins" element={
        <ProtectedRoute><OnboardingGuard><AdminRoute><Layout><AdminManage /></Layout></AdminRoute></OnboardingGuard></ProtectedRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
