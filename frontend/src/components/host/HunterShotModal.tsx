import { useState } from 'react'
import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'
import RoleIcon from '../shared/RoleIcon'

export default function HunterShotModal() {
  const { roomCode, hunterShot, players } = useStore()
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const conn = getConnection()

  if (!hunterShot) return null

  const alivePlayers = players.filter(p => p.isAlive && p.id !== hunterShot.id)

  const handleShoot = () => {
    if (!selectedTarget) return
    conn.invoke('HunterShoot', roomCode, selectedTarget)
    useStore.setState({ hunterShot: null })
    setSelectedTarget(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-orange-600 rounded-2xl p-6 max-w-md w-[calc(100%-2rem)] space-y-4">
        <div className="text-center space-y-2">
          <div className="text-4xl"><RoleIcon role="hunter" size={48} /></div>
          <h3 className="text-xl font-bold text-orange-400">Thợ săn bắn trước khi chết!</h3>
          <p className="text-gray-400 text-sm">
            {hunterShot.name} (Thợ săn) đã chết. Chọn người bị bắn:
          </p>
        </div>

        <div className="space-y-1">
          {alivePlayers.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedTarget(p.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                selectedTarget === p.id
                  ? 'bg-orange-600/40 border-2 border-orange-500'
                  : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <span className="text-white font-medium">{p.name}</span>
              {p.role && (
                <span className="text-sm text-gray-400">
                  <RoleIcon role={p.role} size={20} />
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleShoot}
          disabled={!selectedTarget}
          className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors cursor-pointer"
        >
          🏹 Bắn!
        </button>
      </div>
    </div>
  )
}
