import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
import ResumeBuilderPage from './pages/resume-builder/ResumeBuilderPage'

const MIN_WIDTH = 1024

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MIN_WIDTH)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MIN_WIDTH)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (isMobile) {
    return (
      <div className="bg-bg-primary flex min-h-screen flex-col items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-4">
          <div className="text-4xl">
            <svg
              className="text-accent mx-auto h-16 w-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-text-primary text-xl font-bold">PC 환경에서 이용해주세요</h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            AI 모의면접은 카메라, 마이크, 넓은 화면이 필요합니다. PC 또는 노트북 환경에서
            접속해주세요.
          </p>
          <p className="text-text-secondary/60 text-xs">PC라면 브라우저 창 크기를 키워주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* 공개 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 인증 필요 */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* 인증 + 온보딩 완료 */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <Layout>
                <SetupPage />
              </Layout>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <InterviewPage />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analyzing"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AnalyzingPage />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/report/:id"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <Layout>
                <ReportPage />
              </Layout>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      {/* 기존 /report (id 없음)도 지원 - 현재 세션 리포트용 */}
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <Layout>
                <ReportPage />
              </Layout>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mypage"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <Layout>
                <MyPage />
              </Layout>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AdminRoute>
                <Layout>
                  <AdminDashboard />
                </Layout>
              </AdminRoute>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AdminRoute>
                <Layout>
                  <AdminStudents />
                </Layout>
              </AdminRoute>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/quotas"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AdminRoute>
                <Layout>
                  <AdminQuotas />
                </Layout>
              </AdminRoute>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/admins"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AdminRoute>
                <Layout>
                  <AdminManage />
                </Layout>
              </AdminRoute>
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      {/* 이력서 빌더 */}
      <Route path="/resume-builder" element={
        <ProtectedRoute><OnboardingGuard><ResumeBuilderPage /></OnboardingGuard></ProtectedRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
