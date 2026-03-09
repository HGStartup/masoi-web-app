import { v4 as uuidv4 } from 'uuid'
import type { Role, RoleConfig, Player, NightActions, NightResolutionResult, WinCondition } from '../types/game'

const NIGHT_ORDER: Role[] = ['wolf', 'seer', 'doctor', 'witch', 'hunter']

export function getNightOrder(config: RoleConfig): Role[] {
  return NIGHT_ORDER.filter(role => (config[role] ?? 0) > 0)
}

export function assignRoles(
  players: Record<string, Player>,
  config: RoleConfig
): Record<string, Player> {
  // Expand config to flat role array
  const roles: Role[] = []
  for (const [role, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) {
      roles.push(role as Role)
    }
  }

  const playerIds = Object.keys(players)

  if (playerIds.length !== roles.length) {
    throw new Error(`Player count (${playerIds.length}) does not match role count (${roles.length})`)
  }

  // Fisher-Yates shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }

  // Assign roles to players
  const updated: Record<string, Player> = { ...players }
  playerIds.forEach((id, index) => {
    updated[id] = { ...players[id], role: roles[index] }
  })

  return updated
}

export function resolveNight(
  players: Record<string, Player>,
  actions: NightActions
): NightResolutionResult {
  const deaths: string[] = []
  const announcements: string[] = []

  // Wolf kill
  let wolfVictimDies = false
  if (actions.wolfVictim) {
    wolfVictimDies = true

    // Doctor save overrides
    if (actions.doctorSave === actions.wolfVictim) {
      wolfVictimDies = false
    }

    // Witch heal overrides
    if (actions.witchHeal === actions.wolfVictim) {
      wolfVictimDies = false
    }

    if (wolfVictimDies) {
      deaths.push(actions.wolfVictim)
      const victim = players[actions.wolfVictim]
      announcements.push(`${victim?.name ?? 'Một người'} đã bị loại đêm qua.`)
    } else {
      announcements.push('Đêm qua, mọi người đều bình an.')
    }
  } else {
    announcements.push('Đêm qua, Sói không giết ai.')
  }

  // Witch poison (independent of wolf)
  if (actions.witchPoison && actions.witchPoison !== actions.wolfVictim) {
    deaths.push(actions.witchPoison)
    const poisoned = players[actions.witchPoison]
    announcements.push(`${poisoned?.name ?? 'Một người'} đã bị đầu độc.`)
  }

  return { deaths, announcements }
}

export function checkWinCondition(players: Record<string, Player>): WinCondition {
  const alivePlayers = Object.values(players).filter(p => p.isAlive)
  const aliveWolves = alivePlayers.filter(p => p.role === 'wolf').length
  const aliveOthers = alivePlayers.filter(p => p.role !== 'wolf').length

  if (aliveWolves === 0) return 'village'
  if (aliveWolves >= aliveOthers) return 'wolves'
  return null
}

export function countAlive(players: Record<string, Player>, role?: Role): number {
  const alive = Object.values(players).filter(p => p.isAlive)
  if (role) return alive.filter(p => p.role === role).length
  return alive.length
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function createPlayer(name: string, socketId: string): Player {
  return {
    id: uuidv4(),
    socketId,
    name,
    isAlive: true,
  }
}

export function getDefaultNightActions(): NightActions {
  return {
    witchHealUsed: false,
    witchPoisonUsed: false,
  }
}

export function validateRoleConfig(config: RoleConfig, playerCount: number): string | null {
  const total = Object.values(config).reduce((sum, count) => sum + count, 0)
  if (total !== playerCount) {
    return `Tổng số vai (${total}) phải bằng số người chơi (${playerCount})`
  }
  const wolfCount = config['wolf'] ?? 0
  if (wolfCount < 1) {
    return 'Phải có ít nhất 1 Sói'
  }
  const villagerCount = Object.entries(config)
    .filter(([role]) => role !== 'wolf')
    .reduce((sum, [, count]) => sum + count, 0)
  if (villagerCount === 0) {
    return 'Phải có ít nhất 1 người làng'
  }
  return null
}
