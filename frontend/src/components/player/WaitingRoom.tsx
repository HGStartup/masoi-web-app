import { useStore } from '../../lib/store'

export default function WaitingRoom() {
  const { players, roomCode } = useStore()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="text-4xl animate-pulse">⏳</div>
        <h2 className="text-xl font-bold">Đang chờ quản trò bắt đầu...</h2>
        <p className="text-gray-400">Phòng: <span className="text-violet-400 font-mono font-bold">{roomCode}</span></p>
      </div>

      <div className="w-full max-w-sm bg-gray-800/50 rounded-xl border border-gray-700 p-4">
        <h3 className="font-semibold mb-3">👥 Người chơi ({players.length})</h3>
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2">
              <span className="text-gray-500 w-6 text-center">{i + 1}</span>
              <span className="text-white">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
