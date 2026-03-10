import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'

export default function VotePanel() {
  const { roomCode, round, players, voteCounts } = useStore()
  const conn = getConnection()
  const alivePlayers = players.filter(p => p.isAlive)
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0)
  const aliveCount = alivePlayers.length

  const handleConfirmExecute = (targetId: string) => {
    const target = players.find(p => p.id === targetId)
    if (target && confirm(`Xác nhận treo cổ ${target.name}?`)) {
      conn.invoke('ConfirmExecute', roomCode, targetId)
    }
  }

  const handleSkipVote = () => {
    conn.invoke('SkipVote', roomCode)
  }

  // Sort by vote count
  const sorted = alivePlayers
    .map(p => ({ ...p, votes: voteCounts[p.id] || 0 }))
    .sort((a, b) => b.votes - a.votes)

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">🗳️ Bầu chọn – Vòng {round}</h2>
        <button onClick={handleSkipVote}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors cursor-pointer">
          ⏭️ Bỏ qua vote
        </button>
      </div>

      <div className="text-gray-400 text-sm">
        Đã bỏ phiếu: {totalVotes}/{aliveCount}
      </div>

      <div className="space-y-2">
        {sorted.map(p => {
          const pct = aliveCount > 0 ? (p.votes / aliveCount) * 100 : 0
          return (
            <div key={p.id} className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-violet-400">{p.votes} phiếu</span>
                  <button onClick={() => handleConfirmExecute(p.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors cursor-pointer">
                    Treo cổ
                  </button>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
