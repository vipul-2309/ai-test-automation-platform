import { Route, Routes } from 'react-router-dom'
import { SubmitPage } from './pages/SubmitPage'
import { JobStatusPage } from './pages/JobStatusPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SubmitPage />} />
      <Route path="/jobs/:id" element={<JobStatusPage />} />
    </Routes>
  )
}
