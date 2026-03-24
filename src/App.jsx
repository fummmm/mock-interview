import { Routes, Route } from 'react-router-dom'
import SetupPage from './pages/SetupPage'
import InterviewPage from './pages/InterviewPage'
import AnalyzingPage from './pages/AnalyzingPage'
import ReportPage from './pages/ReportPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/interview" element={<InterviewPage />} />
      <Route path="/analyzing" element={<AnalyzingPage />} />
      <Route path="/report" element={<ReportPage />} />
    </Routes>
  )
}

export default App
