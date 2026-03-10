import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'
import { ROLE_NAMES } from '../../types/game'
import RoleIcon from '../shared/RoleIcon'

export default function DayPhase() {
  const { roomCode, round, players, announcements } = useStore()
  const conn = getConnection()

  const handleAnnounce = () => {
    conn.invoke('Announce', roomCode)
  }

  const handleOpenVote = () => {
    conn.invoke('OpenVote', roomCode)
  }

  const handleStartNight = () => {
    conn.invoke('StartNight', roomCode)
  }

  const handleMarkDead = (playerId: string) => {
    if (confirm('Xác nhận đánh dấu người chơi này đã chết?')) {
      conn.invoke('MarkDead', roomCode, playerId)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">☀️ Ban ngày – Vòng {round}</h2>
        <div className="flex gap-2">
          <button onClick={handleOpenVote}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors cursor-pointer">
            🗳️ Mở bầu chọn
          </button>
          <button onClick={handleStartNight}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors cursor-pointer">
            🌙 Chuyển đêm
          </button>
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">📢 Thông báo</h3>
            <button onClick={handleAnnounce}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer">
              📣 Công bố kết quả
            </button>
          </div>
          {announcements.map((msg, i) => (
            <div key={i} className="bg-gray-900/50 rounded-lg px-4 py-2 text-gray-200">
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Player List */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="font-semibold">📋 Danh sách người chơi</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700/50">
              <th className="px-4 py-2 text-left w-12">#</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Vai</th>
              <th className="px-4 py-2 text-left">Trạng thái</th>
              <th className="px-4 py-2 text-left w-20"></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-800/50">
                <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                <td className="px-4 py-2 font-semibold">{p.name}</td>
                <td className="px-4 py-2">
                  <span className={p.role === 'wolf' ? 'text-red-400' : p.role === 'seer' ? 'text-purple-400' : p.role === 'doctor' ? 'text-amber-400' : p.role === 'witch' ? 'text-green-400' : p.role === 'hunter' ? 'text-orange-400' : 'text-gray-300'}>
                    <RoleIcon role={p.role || 'villager'} size={20} /> {ROLE_NAMES[p.role || 'villager']}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {p.isAlive ? (
                    <span className="text-green-400">Còn sống</span>
                  ) : (
                    <span className="text-red-400">Đã chết</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.isAlive && (
                    <button onClick={() => handleMarkDead(p.id)}
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer">
                      ☠️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
