import { ROLE_NAMES, type RevealInfo } from '../../types/game'
import RoleIcon from './RoleIcon'

interface GameOverProps {
  winner: string
  reveals: RevealInfo[]
  isHost: boolean
  onNewGame?: () => void
}

export default function GameOver({ winner, reveals, isHost, onNewGame }: GameOverProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="text-center space-y-4 py-8">
        <div>
          {winner === 'village'
            ? <RoleIcon role="villager" size={80} />
            : <RoleIcon role="wolf" size={80} />
          }
        </div>
        <h2 className="text-3xl font-bold">
          {winner === 'village' ? (
            <span className="text-green-400">Làng thắng!</span>
          ) : (
            <span className="text-red-400">Sói thắng!</span>
          )}
        </h2>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="font-semibold">📋 Kết quả ván chơi</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700/50">
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Vai</th>
              <th className="px-4 py-2 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {reveals.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-800/50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-semibold">{p.name}</td>
                <td className="px-4 py-2">
                  <span className={p.role === 'wolf' ? 'text-red-400' : 'text-gray-300'}>
                    <RoleIcon role={p.role || 'villager'} size={20} /> {ROLE_NAMES[p.role] || p.role}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {p.isAlive ? (
                    <span className="text-green-400">Còn sống</span>
                  ) : (
                    <span className="text-red-400">Đã chết</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isHost && onNewGame && (
        <button
          onClick={onNewGame}
          className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors cursor-pointer"
        >
          🔄 Ván mới
        </button>
      )}
    </div>
  )
}
