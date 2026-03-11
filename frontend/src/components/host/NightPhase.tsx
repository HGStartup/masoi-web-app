import { useState } from 'react'
import { getConnection } from '../../lib/signalr'
import { useStore } from '../../lib/store'
import { ROLE_NAMES, isWolfTeam } from '../../types/game'
import RoleIcon from '../shared/RoleIcon'

export default function NightPhase() {
  const { roomCode, round, nightStep, nightStepExtra, players } = useStore()
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [witchAction, setWitchAction] = useState<'heal' | 'poison' | null>(null)
  const conn = getConnection()

  if (!nightStep) return <div className="p-6 text-center text-gray-400">Đang tải...</div>

  const currentRole = nightStep.role
  const extra = nightStepExtra || {}

  const handleSubmitAndAdvance = () => {
    if (currentRole === 'witch') {
      if (witchAction === 'heal' && selectedTarget) {
        conn.invoke('SubmitNightAction', roomCode, currentRole, `heal:${selectedTarget}`)
      } else if (witchAction === 'poison' && selectedTarget) {
        conn.invoke('SubmitNightAction', roomCode, currentRole, `poison:${selectedTarget}`)
      } else {
        conn.invoke('SubmitNightAction', roomCode, currentRole, null)
      }
    } else {
      conn.invoke('SubmitNightAction', roomCode, currentRole, selectedTarget)
    }
    setSelectedTarget(null)
    setWitchAction(null)
    conn.invoke('AdvanceNight', roomCode)
  }

  const handleSkip = () => {
    conn.invoke('SubmitNightAction', roomCode, currentRole, null)
    setSelectedTarget(null)
    setWitchAction(null)
    conn.invoke('AdvanceNight', roomCode)
  }

  const handleGoBack = () => {
    setSelectedTarget(null)
    setWitchAction(null)
    conn.invoke('GoBackNight', roomCode)
  }

  const handleEndNight = () => {
    conn.invoke('EndNight', roomCode)
  }

  // Get role-specific players
  const getRolePlayers = (role: string) => {
    return players.filter(p => p.role === role && p.isAlive).map(p => p.name)
  }

  const rolePlayerNames = getRolePlayers(currentRole)

  // Filter targets based on role constraints
  const getFilteredTargets = () => {
    let targets = nightStep.alivePlayers

    if (currentRole === 'wolf') {
      const wolfIds: string[] = extra.wolfPlayerIds || []
      targets = targets.filter(p => !wolfIds.includes(p.id))
    }

    if (currentRole === 'alphawolf') {
      const wolfIds: string[] = extra.wolfPlayerIds || []
      targets = targets.filter(p => !wolfIds.includes(p.id))
    }

    if (currentRole === 'guard') {
      const lastGuard = extra.lastGuardProtect
      if (lastGuard) {
        targets = targets.map(p => ({
          ...p,
          _disabled: p.id === lastGuard
        }))
      }
    }

    if (currentRole === 'doctor') {
      const lastSave = extra.lastDoctorSave
      if (lastSave) {
        targets = targets.map(p => ({
          ...p,
          _disabled: p.id === lastSave
        }))
      }
    }

    return targets
  }

  const filteredTargets = getFilteredTargets()
  const healUsed = extra.healUsed ?? false
  const poisonUsed = extra.poisonUsed ?? false
  const convertUsed = extra.convertUsed ?? false

  // Can skip: witch, hunter, alphawolf
  const canSkip = currentRole === 'witch' || currentRole === 'hunter' || currentRole === 'alphawolf'
  // Must select: wolf, seer, doctor, guard
  const mustSelect = currentRole === 'wolf' || currentRole === 'seer' || currentRole === 'doctor' || currentRole === 'guard'

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Night Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          🌙 Ban đêm – Vòng {round}
        </h2>
        <button
          onClick={handleEndNight}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-colors cursor-pointer"
        >
          🌅 Kết thúc đêm
        </button>
      </div>

      <div className="flex gap-4">
        {/* Step Sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <p className="text-gray-400 text-sm mb-2">Thứ tự thức dậy</p>
          {Array.from({ length: nightStep.totalSteps }).map((_, i) => {
            const isActive = i === nightStep.stepIndex
            const isDone = i < nightStep.stepIndex
            return (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-600/30 border-2 border-violet-500 text-white'
                    : isDone
                    ? 'bg-gray-800 text-gray-500'
                    : 'bg-gray-800/50 text-gray-400'
                }`}
              >
                {isActive && <><RoleIcon role={currentRole} size={20} /> {ROLE_NAMES[currentRole] || currentRole}</>}
                {!isActive && `Bước ${i + 1}`}
                {isDone && ' ✓'}
              </div>
            )
          })}
        </div>

        {/* Main Action Area */}
        <div className="flex-1 space-y-4">
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4">
            <div>
              <h3 className="text-xl font-bold">
                <RoleIcon role={currentRole} size={24} /> {nightStep.label}
              </h3>
              {currentRole === 'wolf' && (
                <p className="text-gray-400 text-sm mt-1">
                  Sói ({rolePlayerNames.join(', ')}) chọn nạn nhân:
                  <span className="text-red-400 ml-1">(không thể chọn sói)</span>
                </p>
              )}
              {currentRole === 'alphawolf' && (
                <div className="mt-2 space-y-1">
                  <p className="text-gray-400 text-sm">
                    Sói Đầu Đàn ({getRolePlayers('alphawolf').join(', ')}) chọn người để biến thành sói:
                  </p>
                  {convertUsed ? (
                    <p className="text-amber-400 text-xs">Đã dùng năng lực biến hình. Có thể bỏ qua.</p>
                  ) : (
                    <p className="text-green-400 text-xs">Chọn 1 người để biến thành sói (thay vì giết). Dùng 1 lần duy nhất!</p>
                  )}
                </div>
              )}
              {currentRole === 'seer' && (
                <p className="text-gray-400 text-sm mt-1">
                  Tiên tri ({rolePlayerNames.join(', ')}) chọn người để soi:
                </p>
              )}
              {currentRole === 'guard' && (
                <p className="text-gray-400 text-sm mt-1">
                  Bảo vệ ({rolePlayerNames.join(', ')}) chọn người bảo vệ:
                  {extra.lastGuardProtect && (
                    <span className="text-amber-400 ml-1">
                      (không thể bảo vệ cùng người đêm trước)
                    </span>
                  )}
                </p>
              )}
              {currentRole === 'doctor' && (
                <p className="text-gray-400 text-sm mt-1">
                  Thầy thuốc ({rolePlayerNames.join(', ')}) chọn người cứu:
                  {extra.lastDoctorSave && (
                    <span className="text-amber-400 ml-1">
                      (không thể cứu cùng người đêm trước)
                    </span>
                  )}
                </p>
              )}
              {currentRole === 'witch' && (
                <div className="mt-2 space-y-2">
                  <p className="text-gray-400 text-sm">{nightStep.instruction}</p>
                  <p className="text-gray-500 text-xs">Phù thủy không biết ai bị sói cắn. Chọn người để cứu hoặc giết.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setWitchAction('heal'); setSelectedTarget(null) }}
                      disabled={healUsed}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                        witchAction === 'heal'
                          ? 'bg-green-600 text-white'
                          : healUsed
                          ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          : 'bg-gray-700 text-green-400 hover:bg-gray-600'
                      }`}
                    >
                      💊 Cứu {healUsed ? '(đã dùng)' : ''}
                    </button>
                    <button
                      onClick={() => { setWitchAction('poison'); setSelectedTarget(null) }}
                      disabled={poisonUsed}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                        witchAction === 'poison'
                          ? 'bg-purple-600 text-white'
                          : poisonUsed
                          ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          : 'bg-gray-700 text-purple-400 hover:bg-gray-600'
                      }`}
                    >
                      ☠️ Giết {poisonUsed ? '(đã dùng)' : ''}
                    </button>
                  </div>
                </div>
              )}
              {currentRole === 'hunter' && (
                <p className="text-gray-400 text-sm mt-1">
                  Thợ săn không cần hành động ban đêm (bắn khi chết)
                </p>
              )}
              {/* Generic fallback for unknown roles */}
              {!['wolf', 'alphawolf', 'seer', 'guard', 'doctor', 'witch', 'hunter'].includes(currentRole) && (
                <p className="text-gray-400 text-sm mt-1">{nightStep.instruction}</p>
              )}
              {mustSelect && (
                <p className="text-amber-400 text-xs mt-1">⚠️ Bắt buộc phải chọn</p>
              )}
            </div>

            {/* Player Selection — hide for hunter (no night action) and alphawolf if already used */}
            {currentRole !== 'hunter' && !(currentRole === 'alphawolf' && convertUsed) && (
              <div className="space-y-1">
                {(currentRole === 'witch' && witchAction
                  ? nightStep.alivePlayers
                  : filteredTargets
                ).map(p => {
                  const isSelected = selectedTarget === p.id
                  const isDisabled = (p as any)._disabled
                  return (
                    <button
                      key={p.id}
                      onClick={() => !isDisabled && setSelectedTarget(isSelected ? null : p.id)}
                      disabled={isDisabled}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600/40 border-2 border-violet-500'
                          : isDisabled
                          ? 'bg-gray-900/30 border border-gray-800 opacity-40 cursor-not-allowed'
                          : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <span className="text-white font-medium">
                        {p.name}
                        {isDisabled && <span className="text-amber-400 text-xs ml-2">(đêm trước)</span>}
                      </span>
                      <span className="text-sm">
                        {p.role && (
                          <span className={isWolfTeam(p.role) ? 'text-red-400' : 'text-gray-400'}>
                            <RoleIcon role={p.role || 'villager'} size={20} />
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Seer result */}
            {currentRole === 'seer' && selectedTarget && (() => {
              const target = players.find(p => p.id === selectedTarget)
              if (target) {
                const isWolf = isWolfTeam(target.role)
                return (
                  <div className={`p-3 rounded-lg text-center font-semibold ${
                    isWolf ? 'bg-red-900/40 text-red-400 border border-red-800' : 'bg-green-900/40 text-green-400 border border-green-800'
                  }`}>
                    {target.name}: {isWolf ? <><RoleIcon role="wolf" size={20} /> Là Sói!</> : '✅ Không phải Sói'}
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGoBack}
              disabled={nightStep.stepIndex === 0}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white rounded-xl transition-colors cursor-pointer"
            >
              ← Bước trước
            </button>
            {canSkip && (
              <button
                onClick={handleSkip}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors cursor-pointer"
              >
                Bỏ qua
              </button>
            )}
            <button
              onClick={handleSubmitAndAdvance}
              disabled={mustSelect && !selectedTarget}
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Bước tiếp →
            </button>
          </div>
        </div>
      </div>

      {/* Player List Table */}
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
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-800/50">
                <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                <td className="px-4 py-2 font-semibold">{p.name}</td>
                <td className="px-4 py-2">
                  <span className={isWolfTeam(p.role) ? 'text-red-400' : p.role === 'seer' ? 'text-purple-400' : p.role === 'doctor' ? 'text-amber-400' : p.role === 'witch' ? 'text-green-400' : p.role === 'hunter' ? 'text-orange-400' : p.role === 'guard' ? 'text-blue-400' : p.role === 'elder' ? 'text-yellow-600' : 'text-gray-300'}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
