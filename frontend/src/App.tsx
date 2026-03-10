import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './lib/auth'
import HomePage from './pages/HomePage'
import HostPage from './pages/HostPage'
import PlayerPage from './pages/PlayerPage'
import ZaloCallbackPage from './pages/ZaloCallbackPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    // Save the intended URL so we can redirect after login
    localStorage.setItem('masoi_pending_url', location.pathname + location.search)
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth/zalo/callback" element={<ZaloCallbackPage />} />
        <Route
          path="/host/:roomCode"
          element={
            <AuthGuard>
              <HostPage />
            </AuthGuard>
          }
        />
        <Route
          path="/play/:roomCode"
          element={
            <AuthGuard>
              <PlayerPage />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
