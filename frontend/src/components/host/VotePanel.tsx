import { useState } from 'react'
import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'
import { ROLE_NAMES } from '../../types/game'
import RoleIcon from '../shared/RoleIcon'

export default function VotePanel() {
  const { roomCode, round, players, voteCounts, voteTimer } = useStore()
  const conn = getConnection()
  const alivePlayers = players.filter(p => p.isAlive)
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0)
  const aliveCount = alivePlayers.length

  // Guest voting state
  const [guestVoting, setGuestVoting] = useState<string | null>(null) // playerId of guest being voted for
  const [guestVoted, setGuestVoted] = useState<Set<string>>(new Set())

  // Guest players = players without connectionId (we track by role presence since host added them)
  // We don't have connectionId info on frontend, but we know guests were added by host
  // For simplicity: show a vote-for-guest section for ALL alive players, host picks who to vote for

  const handleConfirmExecute = (targetId: string) => {
    const target = players.find(p => p.id === targetId)
    if (target && confirm(`Xác nhận treo cổ ${target.name}?`)) {
      conn.invoke('ConfirmExecute', roomCode, targetId)
    }
  }

  const handleSkipVote = () => {
    if (confirm('Kết thúc vote ngay?\nNgười chưa vote sẽ bị random.\nNgười nhiều phiếu nhất sẽ bị treo cổ.')) {
      conn.invoke('SkipVote', roomCode)
    }
  }

  const handleGuestVote = (guestId: string, targetId: string) => {
    conn.invoke('CastVoteForGuest', roomCode, guestId, targetId)
    setGuestVoted(prev => new Set(prev).add(guestId))
    setGuestVoting(null)
  }

  // Sort by vote count
  const sorted = alivePlayers
    .map(p => ({ ...p, votes: voteCounts[p.id] || 0 }))
    .sort((a, b) => b.votes - a.votes)

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">🗳️ Bầu chọn – Vòng {round}</h2>
        <div className="flex items-center gap-3">
          {voteTimer != null && (
            <div className={`text-xl font-bold px-3 py-1 rounded-lg ${
              voteTimer <= 5 ? 'bg-red-900/50 text-red-400 animate-pulse' : 'bg-amber-900/30 text-amber-400'
            }`}>
              ⏱️ {voteTimer}s
            </div>
          )}
          <button onClick={handleSkipVote}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl font-semibold transition-colors cursor-pointer">
            Kết thúc vote
          </button>
        </div>
      </div>

      <div className="text-gray-400 text-sm">
        Đã bỏ phiếu: {totalVotes}/{aliveCount}
        {voteTimer != null && voteTimer <= 10 && (
          <span className="text-amber-400 ml-2">
            (Hết giờ sẽ tự random cho người chưa vote)
          </span>
        )}
      </div>

      {/* Vote results */}
      <div className="space-y-2">
        {sorted.map(p => {
          const pct = aliveCount > 0 ? (p.votes / aliveCount) * 100 : 0
          return (
            <div key={p.id} className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">
                  {p.name}
                  {p.role && (
                    <span className="text-gray-500 text-sm ml-2">
                      <RoleIcon role={p.role} size={16} /> {ROLE_NAMES[p.role || 'villager']}
                    </span>
                  )}
                </span>
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

      {/* Vote for guest players */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-400">📱 Vote thay người chơi (không có ĐT)</h3>
        <div className="flex flex-wrap gap-2">
          {alivePlayers.map(p => {
            const hasVoted = guestVoted.has(p.id)
            return (
              <button
                key={p.id}
                onClick={() => setGuestVoting(guestVoting === p.id ? null : p.id)}
                disabled={hasVoted}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  guestVoting === p.id
                    ? 'bg-violet-600 text-white'
                    : hasVoted
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {p.name} {hasVoted ? '✓' : ''}
              </button>
            )
          })}
        </div>

        {guestVoting && (
          <div className="border-t border-gray-700 pt-3 space-y-1">
            <p className="text-sm text-gray-400">
              Vote cho <strong className="text-white">{alivePlayers.find(p => p.id === guestVoting)?.name}</strong>:
            </p>
            {alivePlayers
              .filter(p => p.id !== guestVoting)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => handleGuestVote(guestVoting, p.id)}
                  className="w-full text-left px-3 py-2 bg-gray-900/50 border border-gray-700 hover:border-violet-500 rounded-lg text-white text-sm cursor-pointer transition-colors"
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
