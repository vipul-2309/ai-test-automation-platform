import { Route, Routes } from 'react-router-dom'
import { SubmitPage } from './pages/SubmitPage'
import { JobStatusPage } from './pages/JobStatusPage'
import { Header } from './components/Header'
import { ToastProvider } from './components/Toast'

export default function App() {
  return (
    <ToastProvider>
      <Header />
      <Routes>
        <Route path="/" element={<SubmitPage />} />
        <Route path="/jobs/:id" element={<JobStatusPage />} />
      </Routes>
    </ToastProvider>
  )
}
