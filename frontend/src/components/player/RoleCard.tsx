import { useState, useRef, useCallback } from 'react'
import { ROLE_NAMES, isWolfTeam } from '../../types/game'
import { useStore } from '../../lib/store'
import RoleIcon from '../shared/RoleIcon'

export default function RoleCard() {
  const { myRole } = useStore()
  const [revealed, setRevealed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    if (revealed) {
      // Already shown → hide immediately
      if (timerRef.current) clearTimeout(timerRef.current)
      setRevealed(false)
    } else {
      // Show → auto-hide after 700ms
      setRevealed(true)
      timerRef.current = setTimeout(() => setRevealed(false), 700)
    }
  }, [revealed])

  if (!myRole) return null

  return (
    <button
      onClick={handleClick}
      className="w-full max-w-xs mx-auto block cursor-pointer"
    >
      <div className={`rounded-2xl border-2 p-6 text-center transition-all duration-300 ${
        revealed
          ? isWolfTeam(myRole)
            ? 'bg-red-900/30 border-red-600'
            : 'bg-violet-900/30 border-violet-600'
          : 'bg-gray-800 border-gray-600'
      }`}>
        {revealed ? (
          <div className="space-y-2">
            <div><RoleIcon role={myRole} size={64} /></div>
            <div className={`text-xl font-bold ${isWolfTeam(myRole) ? 'text-red-400' : 'text-violet-300'}`}>
              {ROLE_NAMES[myRole] || myRole}
            </div>
            <p className="text-gray-400 text-xs">Tự ẩn sau 0.7 giây · Nhấn để ẩn ngay</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-5xl">🃏</div>
            <div className="text-gray-400 font-medium">Nhấn để xem vai</div>
          </div>
        )}
      </div>
    </button>
  )
}
