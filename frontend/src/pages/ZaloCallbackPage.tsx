import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { handleZaloCallback, useAuthStore } from '../lib/auth'

export default function ZaloCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state) {
      setError('Thiếu thông tin xác thực từ Zalo')
      return
    }

    handleZaloCallback(code, state)
      .then((user) => {
        setUser(user)
        // Redirect to pending URL or home
        const pendingUrl = localStorage.getItem('masoi_pending_url')
        localStorage.removeItem('masoi_pending_url')
        navigate(pendingUrl || '/', { replace: true })
      })
      .catch((err) => {
        setError(err.message || 'Đăng nhập thất bại')
      })
  }, [searchParams, navigate, setUser])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-red-400 text-lg">{error}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors cursor-pointer"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-4">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400">Đang xác thực với Zalo...</p>
      </div>
    </div>
  )
}
