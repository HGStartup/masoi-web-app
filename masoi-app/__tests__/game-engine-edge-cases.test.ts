import {
  assignRoles,
  resolveNight,
  checkWinCondition,
  getNightOrder,
  validateRoleConfig,
  getDefaultNightActions,
} from '../server/game-engine'
import type { Player, RoleConfig, NightActions } from '../types/game'

function makePlayers(names: string[]): Record<string, Player> {
  const players: Record<string, Player> = {}
  names.forEach((name, i) => {
    const id = `player-${i}`
    players[id] = { id, socketId: `s-${i}`, name, isAlive: true }
  })
  return players
}

describe('Edge Cases: assignRoles', () => {
  test('minimum viable game: 1 wolf + 1 villager', () => {
    const players = makePlayers(['Wolf', 'Villager'])
    const config: RoleConfig = { wolf: 1, villager: 1 }
    const assigned = assignRoles(players, config)
    const roles = Object.values(assigned).map(p => p.role)
    expect(roles).toContain('wolf')
    expect(roles).toContain('villager')
  })

  test('large game: 15 players, all roles', () => {
    const players = makePlayers(Array.from({ length: 15 }, (_, i) => `P${i}`))
    const config: RoleConfig = { wolf: 3, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 8 }
    const assigned = assignRoles(players, config)
    expect(Object.keys(assigned).length).toBe(15)
  })

  test('preserves player names and IDs after assignment', () => {
    const players = makePlayers(['Alice', 'Bob', 'Carol'])
    const config: RoleConfig = { wolf: 1, villager: 2 }
    const assigned = assignRoles(players, config)
    expect(assigned['player-0'].name).toBe('Alice')
    expect(assigned['player-1'].name).toBe('Bob')
    expect(assigned['player-2'].name).toBe('Carol')
  })

  test('does not mutate original players object', () => {
    const players = makePlayers(['A', 'B', 'C'])
    const config: RoleConfig = { wolf: 1, villager: 2 }
    const original = JSON.stringify(players)
    assignRoles(players, config)
    expect(JSON.stringify(players)).toBe(original)
  })
})

describe('Edge Cases: resolveNight', () => {
  const basePlayers: Record<string, Player> = {
    wolf: { id: 'wolf', socketId: 's1', name: 'Wolf', role: 'wolf', isAlive: true },
    seer: { id: 'seer', socketId: 's2', name: 'Seer', role: 'seer', isAlive: true },
    doctor: { id: 'doctor', socketId: 's3', name: 'Doctor', role: 'doctor', isAlive: true },
    witch: { id: 'witch', socketId: 's4', name: 'Witch', role: 'witch', isAlive: true },
    v1: { id: 'v1', socketId: 's5', name: 'V1', role: 'villager', isAlive: true },
    v2: { id: 'v2', socketId: 's6', name: 'V2', role: 'villager', isAlive: true },
  }

  test('wolf kills the seer', () => {
    const actions: NightActions = { ...getDefaultNightActions(), wolfVictim: 'seer' }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths).toContain('seer')
  })

  test('wolf kills the doctor', () => {
    const actions: NightActions = { ...getDefaultNightActions(), wolfVictim: 'doctor' }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths).toContain('doctor')
  })

  test('doctor self-saves from wolf', () => {
    const actions: NightActions = { ...getDefaultNightActions(), wolfVictim: 'doctor', doctorSave: 'doctor' }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths).not.toContain('doctor')
  })

  test('witch poisons wolf (wolf dies)', () => {
    const actions: NightActions = { ...getDefaultNightActions(), witchPoison: 'wolf' }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths).toContain('wolf')
  })

  test('all healing on same victim: no deaths', () => {
    const actions: NightActions = {
      ...getDefaultNightActions(),
      wolfVictim: 'v1',
      doctorSave: 'v1',
      witchHeal: 'v1',
    }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths.length).toBe(0)
  })

  test('two deaths in one night', () => {
    const actions: NightActions = {
      ...getDefaultNightActions(),
      wolfVictim: 'v1',
      witchPoison: 'v2',
    }
    const { deaths } = resolveNight(basePlayers, actions)
    expect(deaths.length).toBe(2)
    expect(deaths).toContain('v1')
    expect(deaths).toContain('v2')
  })
})

describe('Edge Cases: checkWinCondition', () => {
  test('returns village with empty room (no players)', () => {
    // Edge case: if everyone is dead for some reason
    const players: Record<string, Player> = {}
    // No alive players: no wolves alive → village wins
    expect(checkWinCondition(players)).toBe('village')
  })

  test('only dead wolves remain: village wins', () => {
    const players: Record<string, Player> = {
      wolf: { id: 'wolf', socketId: 's1', name: 'W', role: 'wolf', isAlive: false },
      v1: { id: 'v1', socketId: 's2', name: 'V1', role: 'villager', isAlive: true },
    }
    expect(checkWinCondition(players)).toBe('village')
  })

  test('multiple special roles count as non-wolves', () => {
    const players: Record<string, Player> = {
      wolf: { id: 'wolf', socketId: 's1', name: 'W', role: 'wolf', isAlive: true },
      seer: { id: 'seer', socketId: 's2', name: 'S', role: 'seer', isAlive: true },
      doctor: { id: 'doc', socketId: 's3', name: 'D', role: 'doctor', isAlive: true },
      hunter: { id: 'hunter', socketId: 's4', name: 'H', role: 'hunter', isAlive: true },
    }
    // 1 wolf vs 3 non-wolves → game continues
    expect(checkWinCondition(players)).toBeNull()
  })
})

describe('Edge Cases: validateRoleConfig', () => {
  test('allows single-wolf game', () => {
    const config: RoleConfig = { wolf: 1, villager: 2 }
    expect(validateRoleConfig(config, 3)).toBeNull()
  })

  test('rejects config with zero total players', () => {
    const config: RoleConfig = { wolf: 0, villager: 0 }
    // 0 roles for 0 players: no wolves → error
    const err = validateRoleConfig(config, 0)
    expect(err).not.toBeNull()
  })

  test('rejects negative count config', () => {
    // Negative counts in roles
    const config: RoleConfig = { wolf: -1, villager: 6 }
    // Total would be 5, matching playerCount=5, but wolf < 1 → error
    const err = validateRoleConfig(config, 5)
    expect(err).not.toBeNull()
  })
})

describe('Edge Cases: getNightOrder', () => {
  test('only wolves: only wolf in order', () => {
    const config: RoleConfig = { wolf: 3, villager: 5 }
    const order = getNightOrder(config)
    expect(order).toEqual(['wolf'])
  })

  test('all special roles included', () => {
    const config: RoleConfig = { wolf: 1, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 1 }
    const order = getNightOrder(config)
    expect(order.length).toBe(5)
    expect(order).toContain('wolf')
    expect(order).toContain('seer')
    expect(order).toContain('doctor')
    expect(order).toContain('witch')
    expect(order).toContain('hunter')
  })
})
