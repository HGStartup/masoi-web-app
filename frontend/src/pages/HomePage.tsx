import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { startConnection } from '../lib/signalr'
import { useStore, subscribeToEvents } from '../lib/store'
import { useAuthStore, startZaloLogin } from '../lib/auth'
import Toast from '../components/shared/Toast'

interface PublicRoom {
  code: string
  playerCount: number
  maxPlayers: number | null
}

export default function HomePage() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isPublic, setIsPublic] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  // Fetch public rooms
  useEffect(() => {
    if (!user) return
    const fetchRooms = () => {
      fetch('/api/rooms/public')
        .then(r => r.json())
        .then(setPublicRooms)
        .catch(() => {})
    }
    fetchRooms()
    const interval = setInterval(fetchRooms, 5000)
    return () => clearInterval(interval)
  }, [user])

  const handleLogin = async () => {
    setLoginError(null)
    try {
      await startZaloLogin()
    } catch (err: any) {
      setLoginError(err.message || 'Không thể đăng nhập Zalo')
    }
  }

  const handleCreate = async () => {
    setLoading(true)
    try {
      const conn = await startConnection()
      subscribeToEvents()

      conn.on('RoomCreated', (roomCode: string) => {
        useStore.setState({ roomCode, isHost: true })
        navigate(`/host/${roomCode}`)
      })

      await conn.invoke('CreateRoom', isPublic)
    } catch {
      useStore.setState({ error: 'Không thể kết nối server' })
      setLoading(false)
    }
  }

  const handleJoin = () => {
    if (joinCode.trim().length >= 4) {
      navigate(`/play/${joinCode.trim()}`)
    }
  }

  const handleJoinRoom = (code: string) => {
    navigate(`/play/${code}`)
  }

  // Not logged in → show login screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-4">
        <Toast message={loginError} onDismiss={() => setLoginError(null)} />
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold flex items-center justify-center gap-3">
              <img src="/icons/wolf.png" alt="Ma Sói" className="w-14 h-14 rounded-full" /> Ma Sói
            </h1>
            <p className="text-gray-400 text-lg">Trò chơi nhập vai trực tuyến</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleLogin}
              className="w-full py-4 px-6 bg-[#0068ff] hover:bg-[#0054cc] text-white text-lg font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-3"
            >
              <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="10" fill="white" />
                <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm8.96 27.12c-.36.84-1.32 1.44-2.28 1.44h-4.56l-3.12 3.72c-.24.24-.48.36-.84.36-.6 0-1.08-.48-1.08-1.08v-3h-1.2c-1.08 0-2.04-.6-2.52-1.56-.12-.24-.24-.6-.24-.96V20.88c0-1.32 1.08-2.4 2.4-2.4h10.8c1.32 0 2.4 1.08 2.4 2.4v9.36c.12.36.12.6.24.88z" fill="#0068FF" />
              </svg>
              Đăng nhập bằng Zalo
            </button>
            <p className="text-gray-500 text-sm">Bạn cần đăng nhập Zalo để tham gia trò chơi</p>
          </div>
        </div>
      </div>
    )
  }

  // Logged in → show main menu
  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4">
      <div className="w-full max-w-md mx-auto space-y-6 pt-8">
        <div className="space-y-2 text-center">
          <h1 className="text-5xl font-bold flex items-center justify-center gap-3">
            <img src="/icons/wolf.png" alt="Ma Sói" className="w-14 h-14 rounded-full" /> Ma Sói
          </h1>
          <p className="text-gray-400 text-lg">Trò chơi nhập vai trực tuyến</p>
        </div>

        {/* User info bar */}
        <div className="flex items-center justify-center gap-3 bg-gray-800/50 rounded-xl px-4 py-3">
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
              {user.name[0]}
            </div>
          )}
          <span className="text-white font-medium">{user.name}</span>
          <button
            onClick={logout}
            className="ml-auto text-gray-400 hover:text-red-400 text-sm transition-colors cursor-pointer"
          >
            Đăng xuất
          </button>
        </div>

        <div className="space-y-4">
          {/* Create room with public/private toggle */}
          <div className="space-y-3">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 px-6 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-lg font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {loading ? 'Đang tạo...' : '🏠 Tạo phòng mới'}
            </button>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setIsPublic(true)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isPublic
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                🌐 Public
              </button>
              <button
                onClick={() => setIsPublic(false)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  !isPublic
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                🔒 Private
              </button>
              <span className="text-gray-500 text-xs">
                {isPublic ? 'Hiện trong danh sách' : 'Chỉ quét QR/nhập mã'}
              </span>
            </div>
          </div>

          {!showJoin ? (
            <button
              onClick={() => setShowJoin(true)}
              className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 text-white text-lg font-semibold rounded-xl transition-colors border border-gray-700 cursor-pointer"
            >
              🚪 Nhập mã phòng
            </button>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Nhập mã phòng..."
                maxLength={8}
                className="w-full py-3 px-4 bg-gray-800 border border-gray-600 rounded-xl text-white text-center text-2xl tracking-widest focus:outline-none focus:border-violet-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowJoin(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors border border-gray-700 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleJoin}
                  disabled={joinCode.trim().length < 4}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Vào phòng
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Public rooms list */}
        {publicRooms.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-300">🌐 Phòng công khai</h2>
            <div className="space-y-2">
              {publicRooms.map(room => (
                <button
                  key={room.code}
                  onClick={() => handleJoinRoom(room.code)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 border border-gray-700 hover:border-violet-500 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono font-bold text-white tracking-wider">{room.code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">
                      👥 {room.playerCount}{room.maxPlayers ? `/${room.maxPlayers}` : ''}
                    </span>
                    <span className="text-violet-400 text-sm font-medium">Vào →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
