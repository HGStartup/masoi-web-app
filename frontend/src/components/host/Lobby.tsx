import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'
import { CORE_ROLES, SPECIAL_ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS, type Player } from '../../types/game'
import RoleIcon from '../shared/RoleIcon'

export default function Lobby() {
  const { roomCode, players, config } = useStore()
  const [guestName, setGuestName] = useState('')
  const [playerCount, setPlayerCount] = useState(config.playerCount || 10)

  // Enabled special roles (checked)
  const [enabledRoles, setEnabledRoles] = useState<Set<string>>(() => {
    const existing = config.roles && Object.keys(config.roles).length > 0 ? config.roles : null
    if (existing) {
      return new Set(Object.keys(existing).filter(r => (existing[r] || 0) > 0))
    }
    // Default enabled: wolf, villager, seer, doctor, witch
    return new Set(['wolf', 'villager', 'seer', 'doctor', 'witch'])
  })

  const [roles, setRoles] = useState<Record<string, number>>(() => {
    if (config.roles && Object.keys(config.roles).length > 0) return config.roles
    return { wolf: 3, villager: 4, seer: 1, doctor: 1, witch: 1 }
  })

  const totalRoles = Object.entries(roles)
    .filter(([r]) => enabledRoles.has(r))
    .reduce((a, [, b]) => a + b, 0)
  const isValid = totalRoles === playerCount && (roles.wolf || 0) >= 1
  const canStart = isValid && players.length === playerCount

  const joinUrl = `${window.location.origin}/play/${roomCode}`

  // Build effective config (only enabled roles)
  const getEffectiveRoles = () => {
    const effective: Record<string, number> = {}
    for (const [r, count] of Object.entries(roles)) {
      if (enabledRoles.has(r) && count > 0) {
        effective[r] = count
      }
    }
    return effective
  }

  useEffect(() => {
    const conn = getConnection()
    const effectiveRoles = getEffectiveRoles()
    conn.invoke('ConfigureRoom', roomCode, playerCount, effectiveRoles).catch(() => {})
  }, [roomCode, playerCount, roles, enabledRoles])

  const toggleRole = (role: string) => {
    setEnabledRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) {
        next.delete(role)
      } else {
        next.add(role)
        // Default to 1 when enabling
        if (!roles[role] || roles[role] === 0) {
          setRoles(prev => ({ ...prev, [role]: 1 }))
        }
      }
      return next
    })
  }

  const updateRole = (role: string, delta: number) => {
    setRoles(prev => {
      const newVal = Math.max(role === 'wolf' ? 1 : 0, (prev[role] || 0) + delta)
      return { ...prev, [role]: newVal }
    })
  }

  const handleStart = () => {
    const conn = getConnection()
    conn.invoke('StartGame', roomCode)
  }

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      {/* QR Code + Join Info */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={joinUrl} size={160} />
          </div>
          <div className="text-center md:text-left space-y-2 flex-1">
            <p className="text-gray-400">Quét QR hoặc truy cập:</p>
            <p className="text-violet-400 text-sm break-all font-mono">{joinUrl}</p>
            <p className="text-gray-400 mt-2">Mã phòng:</p>
            <p className="text-4xl font-bold font-mono tracking-widest text-white">{roomCode}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Role Config */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">⚙️ Cấu hình vai</h3>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Số người:</span>
              <button onClick={() => setPlayerCount(p => Math.max(4, p - 1))}
                className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg text-white cursor-pointer">-</button>
              <span className="text-xl font-bold w-8 text-center">{playerCount}</span>
              <button onClick={() => setPlayerCount(p => p + 1)}
                className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg text-white cursor-pointer">+</button>
            </div>
          </div>

          {/* Core roles (always enabled) */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Vai cơ bản</p>
            {CORE_ROLES.map(role => (
              <div key={role} className="flex items-center justify-between py-1">
                <span className="text-gray-300 flex items-center gap-2">
                  <RoleIcon role={role} size={22} /> {ROLE_NAMES[role]}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateRole(role, -1)}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm cursor-pointer">-</button>
                  <span className="text-lg font-bold w-6 text-center">{roles[role] || 0}</span>
                  <button onClick={() => updateRole(role, 1)}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm cursor-pointer">+</button>
                </div>
              </div>
            ))}
          </div>

          {/* Special roles (toggle + count) */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Vai đặc biệt</p>
            {SPECIAL_ROLES.map(role => {
              const enabled = enabledRoles.has(role)
              return (
                <div key={role} className={`flex items-center justify-between py-1 transition-opacity ${!enabled ? 'opacity-50' : ''}`}>
                  <label className="flex items-center gap-2 cursor-pointer select-none" title={ROLE_DESCRIPTIONS[role]}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                    />
                    <RoleIcon role={role} size={22} />
                    <span className="text-gray-300">{ROLE_NAMES[role]}</span>
                  </label>
                  {enabled && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateRole(role, -1)}
                        className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm cursor-pointer">-</button>
                      <span className="text-lg font-bold w-6 text-center">{roles[role] || 0}</span>
                      <button onClick={() => updateRole(role, 1)}
                        className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm cursor-pointer">+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Role descriptions tooltip area */}
          <div className="text-xs text-gray-600 space-y-0.5">
            {SPECIAL_ROLES.filter(r => enabledRoles.has(r)).map(role => (
              <p key={role}><RoleIcon role={role} size={14} /> {ROLE_DESCRIPTIONS[role]}</p>
            ))}
          </div>

          <div className={`text-sm text-center py-2 rounded-lg ${isValid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            Tổng vai: {totalRoles} / {playerCount}
            {!isValid && totalRoles !== playerCount && ' — Chưa khớp!'}
          </div>
        </div>

        {/* Player List */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4">
          <h3 className="font-semibold text-lg">
            👥 Người chơi ({players.length}/{playerCount})
          </h3>

          {/* Add guest player */}
          <div className="flex gap-2">
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && guestName.trim()) {
                  const conn = getConnection()
                  conn.invoke('AddGuestPlayer', roomCode, guestName.trim())
                  setGuestName('')
                }
              }}
              placeholder="Thêm người chơi (không có ĐT)..."
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={() => {
                if (!guestName.trim()) return
                const conn = getConnection()
                conn.invoke('AddGuestPlayer', roomCode, guestName.trim())
                setGuestName('')
              }}
              disabled={!guestName.trim()}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded-lg cursor-pointer"
            >
              + Thêm
            </button>
          </div>

          {players.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Chờ người chơi tham gia...</p>
          ) : (
            <div className="space-y-2">
              {players.map((p: Player, i: number) => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2">
                  <span className="text-gray-500 w-6 text-center">{i + 1}</span>
                  <span className="text-white font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors cursor-pointer text-lg"
          >
            🎮 Bắt đầu ván ({players.length}/{playerCount})
          </button>
        </div>
      </div>
    </div>
  )
}
