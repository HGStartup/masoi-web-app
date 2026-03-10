import { useState } from 'react'
import { getConnection } from '../../lib/signalr'
import { useAuthStore } from '../../lib/auth'

interface JoinFormProps {
  roomCode: string
}

export default function JoinForm({ roomCode }: JoinFormProps) {
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState(user?.name ?? '')
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    if (!name.trim()) return
    setLoading(true)
    const conn = getConnection()
    await conn.invoke('JoinRoom', roomCode, name.trim())
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <img src="/icons/wolf.png" alt="Ma Sói" className="w-10 h-10 rounded-full" /> Ma Sói
          </h1>
          <p className="text-gray-400 mt-1">Phòng: <span className="text-violet-400 font-mono font-bold">{roomCode}</span></p>
        </div>

        {user && (
          <div className="flex items-center justify-center gap-2 text-gray-300">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name[0]}
              </div>
            )}
            <span className="text-sm">Đăng nhập: <strong>{user.name}</strong></span>
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nhập tên của bạn..."
            className="w-full py-3 px-4 bg-gray-800 border border-gray-600 rounded-xl text-white text-center text-lg focus:outline-none focus:border-violet-500"
            autoFocus
            maxLength={20}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={!name.trim() || loading}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors cursor-pointer text-lg"
          >
            {loading ? 'Đang vào...' : '🚪 Tham gia'}
          </button>
        </div>
      </div>
    </div>
  )
}
