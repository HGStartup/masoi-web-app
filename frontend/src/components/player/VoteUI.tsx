import { useState } from 'react'
import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'

export default function VoteUI() {
  const { roomCode, players, myPlayerId, voteCounts, voteTimer } = useStore()
  const [voted, setVoted] = useState<string | null>(null)
  const conn = getConnection()

  const me = players.find(p => p.id === myPlayerId)
  const alivePlayers = players.filter(p => p.isAlive)
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0)
  const isAlive = me?.isAlive ?? false

  const handleVote = (targetId: string) => {
    if (!isAlive || voted) return
    setVoted(targetId)
    conn.invoke('CastVote', roomCode, targetId)
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 space-y-6 pt-12">
      <div className="text-center space-y-2">
        <div className="text-5xl">🗳️</div>
        <h2 className="text-2xl font-bold">Bầu chọn treo cổ</h2>
        {!isAlive && <p className="text-gray-500">Bạn đã chết — chế độ theo dõi</p>}
        <p className="text-gray-400 text-sm">Phiếu: {totalVotes}/{alivePlayers.length}</p>
        {voteTimer != null && (
          <div className={`text-2xl font-bold ${voteTimer <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
            ⏱️ {voteTimer}s
          </div>
        )}
      </div>

      <div className="w-full max-w-sm space-y-2">
        {alivePlayers.map(p => {
          const count = voteCounts[p.id] || 0
          const pct = alivePlayers.length > 0 ? (count / alivePlayers.length) * 100 : 0
          const isSelected = voted === p.id
          const isMe = p.id === myPlayerId

          return (
            <button
              key={p.id}
              onClick={() => handleVote(p.id)}
              disabled={!isAlive || !!voted || isMe}
              className={`w-full text-left p-3 rounded-xl transition-colors ${
                isSelected
                  ? 'bg-violet-600/40 border-2 border-violet-500'
                  : isMe
                  ? 'bg-gray-800/30 border border-gray-800 opacity-50 cursor-not-allowed'
                  : 'bg-gray-800/50 border border-gray-700 hover:border-gray-600'
              } ${!isAlive || voted ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-white">{p.name} {isMe ? '(bạn)' : ''}</span>
                <span className="text-sm text-violet-400">{count}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }} />
              </div>
            </button>
          )
        })}
      </div>

      {voted && (
        <p className="text-green-400 text-sm">Đã bỏ phiếu</p>
      )}
    </div>
  )
}
