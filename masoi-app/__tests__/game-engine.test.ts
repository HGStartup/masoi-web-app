import {
  assignRoles,
  resolveNight,
  checkWinCondition,
  countAlive,
  getNightOrder,
  validateRoleConfig,
  generateRoomCode,
  getDefaultNightActions,
} from '../server/game-engine'
import type { Player, RoleConfig, NightActions } from '../types/game'

// Helper to create mock players
function makePlayers(names: string[]): Record<string, Player> {
  const players: Record<string, Player> = {}
  names.forEach((name, i) => {
    const id = `player-${i}`
    players[id] = {
      id,
      socketId: `socket-${i}`,
      name,
      isAlive: true,
    }
  })
  return players
}

// ============================================================
// assignRoles
// ============================================================
describe('assignRoles', () => {
  test('assigns exactly one role per player', () => {
    const players = makePlayers(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack'])
    const config: RoleConfig = { wolf: 2, seer: 1, doctor: 1, villager: 6 }
    const assigned = assignRoles(players, config)
    const roles = Object.values(assigned).map(p => p.role)
    expect(roles.every(r => r !== undefined)).toBe(true)
  })

  test('role counts match config exactly', () => {
    const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
    const config: RoleConfig = { wolf: 2, seer: 1, doctor: 1, villager: 6 }
    const assigned = assignRoles(players, config)
    const roleCounts: Record<string, number> = {}
    Object.values(assigned).forEach(p => {
      roleCounts[p.role!] = (roleCounts[p.role!] ?? 0) + 1
    })
    expect(roleCounts['wolf']).toBe(2)
    expect(roleCounts['seer']).toBe(1)
    expect(roleCounts['doctor']).toBe(1)
    expect(roleCounts['villager']).toBe(6)
  })

  test('no duplicate player IDs after assignment', () => {
    const players = makePlayers(['A', 'B', 'C', 'D', 'E'])
    const config: RoleConfig = { wolf: 1, villager: 4 }
    const assigned = assignRoles(players, config)
    expect(Object.keys(assigned).length).toBe(5)
  })

  test('throws if player count does not match role count', () => {
    const players = makePlayers(['A', 'B', 'C'])
    const config: RoleConfig = { wolf: 1, villager: 4 } // 5 roles, 3 players
    expect(() => assignRoles(players, config)).toThrow()
  })

  test('roles are distributed randomly (not always same order)', () => {
    const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F'])
    const config: RoleConfig = { wolf: 2, villager: 4 }
    const results = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const assigned = assignRoles(players, config)
      // Record which player is wolf
      const wolfIds = Object.values(assigned)
        .filter(p => p.role === 'wolf')
        .map(p => p.id)
        .sort()
        .join(',')
      results.add(wolfIds)
    }
    // With 30 runs and C(6,2)=15 possible wolf combinations, should see >1
    expect(results.size).toBeGreaterThan(1)
  })

  test('assigns roles for 15 players correctly', () => {
    const players = makePlayers(Array.from({ length: 15 }, (_, i) => `Player${i + 1}`))
    const config: RoleConfig = { wolf: 3, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 8 }
    const assigned = assignRoles(players, config)
    const roleCounts: Record<string, number> = {}
    Object.values(assigned).forEach(p => {
      roleCounts[p.role!] = (roleCounts[p.role!] ?? 0) + 1
    })
    expect(roleCounts['wolf']).toBe(3)
    expect(roleCounts['seer']).toBe(1)
    expect(roleCounts['doctor']).toBe(1)
    expect(roleCounts['witch']).toBe(1)
    expect(roleCounts['hunter']).toBe(1)
    expect(roleCounts['villager']).toBe(8)
  })
})

// ============================================================
// resolveNight
// ============================================================
describe('resolveNight', () => {
  let players: Record<string, Player>
  let defaultActions: NightActions

  beforeEach(() => {
    players = {
      wolf1: { id: 'wolf1', socketId: 's1', name: 'WolfPlayer', role: 'wolf', isAlive: true },
      v1: { id: 'v1', socketId: 's2', name: 'Victim1', role: 'villager', isAlive: true },
      v2: { id: 'v2', socketId: 's3', name: 'Victim2', role: 'villager', isAlive: true },
      doc1: { id: 'doc1', socketId: 's4', name: 'Doctor', role: 'doctor', isAlive: true },
    }
    defaultActions = getDefaultNightActions()
  })

  test('wolf kills a victim', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1' }
    const result = resolveNight(players, actions)
    expect(result.deaths).toContain('v1')
    expect(result.deaths).not.toContain('v2')
  })

  test('doctor save prevents wolf kill on same target', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', doctorSave: 'v1' }
    const result = resolveNight(players, actions)
    expect(result.deaths).not.toContain('v1')
    expect(result.deaths.length).toBe(0)
  })

  test('doctor saving a different player does not help wolf victim', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', doctorSave: 'v2' }
    const result = resolveNight(players, actions)
    expect(result.deaths).toContain('v1')
  })

  test('witch heal prevents wolf kill on same target', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', witchHeal: 'v1' }
    const result = resolveNight(players, actions)
    expect(result.deaths).not.toContain('v1')
  })

  test('witch poison causes additional death', () => {
    const actions: NightActions = { ...defaultActions, witchPoison: 'v2' }
    const result = resolveNight(players, actions)
    expect(result.deaths).toContain('v2')
  })

  test('witch poison + wolf kill both die', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', witchPoison: 'v2' }
    const result = resolveNight(players, actions)
    expect(result.deaths).toContain('v1')
    expect(result.deaths).toContain('v2')
  })

  test('witch poison on wolf victim does not double-count', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', witchPoison: 'v1' }
    const result = resolveNight(players, actions)
    // v1 is already dead from wolf; witch poison on same target should not double count
    const v1Count = result.deaths.filter(id => id === 'v1').length
    expect(v1Count).toBe(1)
  })

  test('no wolf action - peaceful night', () => {
    const actions: NightActions = { ...defaultActions }
    const result = resolveNight(players, actions)
    expect(result.deaths.length).toBe(0)
    expect(result.announcements.some(a => a.includes('bình an') || a.includes('không giết'))).toBe(true)
  })

  test('both doctor and witch heal same target: no death', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', doctorSave: 'v1', witchHeal: 'v1' }
    const result = resolveNight(players, actions)
    expect(result.deaths).not.toContain('v1')
  })

  test('returns announcements for each death', () => {
    const actions: NightActions = { ...defaultActions, wolfVictim: 'v1', witchPoison: 'v2' }
    const result = resolveNight(players, actions)
    expect(result.announcements.length).toBeGreaterThan(0)
  })
})

// ============================================================
// checkWinCondition
// ============================================================
describe('checkWinCondition', () => {
  function makeLivePlayers(wolfCount: number, villagerCount: number): Record<string, Player> {
    const players: Record<string, Player> = {}
    for (let i = 0; i < wolfCount; i++) {
      players[`wolf${i}`] = { id: `wolf${i}`, socketId: `s${i}`, name: `Wolf${i}`, role: 'wolf', isAlive: true }
    }
    for (let i = 0; i < villagerCount; i++) {
      players[`vill${i}`] = { id: `vill${i}`, socketId: `sv${i}`, name: `Villager${i}`, role: 'villager', isAlive: true }
    }
    return players
  }

  test('village wins when no wolves alive', () => {
    const players = makeLivePlayers(0, 5)
    expect(checkWinCondition(players)).toBe('village')
  })

  test('wolves win when wolves >= non-wolves', () => {
    const players = makeLivePlayers(2, 2)
    expect(checkWinCondition(players)).toBe('wolves')
  })

  test('wolves win when wolves > non-wolves', () => {
    const players = makeLivePlayers(3, 2)
    expect(checkWinCondition(players)).toBe('wolves')
  })

  test('game continues when wolves < non-wolves', () => {
    const players = makeLivePlayers(2, 5)
    expect(checkWinCondition(players)).toBeNull()
  })

  test('game continues with 1 wolf and 4 villagers', () => {
    const players = makeLivePlayers(1, 4)
    expect(checkWinCondition(players)).toBeNull()
  })

  test('wolves win exactly 1 vs 1', () => {
    const players = makeLivePlayers(1, 1)
    expect(checkWinCondition(players)).toBe('wolves')
  })

  test('dead players do not count', () => {
    const players: Record<string, Player> = {
      wolf1: { id: 'wolf1', socketId: 's1', name: 'W1', role: 'wolf', isAlive: false },
      wolf2: { id: 'wolf2', socketId: 's2', name: 'W2', role: 'wolf', isAlive: true },
      v1: { id: 'v1', socketId: 's3', name: 'V1', role: 'villager', isAlive: true },
      v2: { id: 'v2', socketId: 's4', name: 'V2', role: 'villager', isAlive: true },
      v3: { id: 'v3', socketId: 's5', name: 'V3', role: 'villager', isAlive: true },
    }
    // 1 alive wolf vs 3 alive villagers - game continues
    expect(checkWinCondition(players)).toBeNull()
  })
})

// ============================================================
// countAlive
// ============================================================
describe('countAlive', () => {
  const players: Record<string, Player> = {
    wolf1: { id: 'wolf1', socketId: 's1', name: 'W1', role: 'wolf', isAlive: true },
    wolf2: { id: 'wolf2', socketId: 's2', name: 'W2', role: 'wolf', isAlive: false },
    v1: { id: 'v1', socketId: 's3', name: 'V1', role: 'villager', isAlive: true },
    v2: { id: 'v2', socketId: 's4', name: 'V2', role: 'villager', isAlive: true },
  }

  test('counts all alive players', () => {
    expect(countAlive(players)).toBe(3)
  })

  test('counts alive wolves only', () => {
    expect(countAlive(players, 'wolf')).toBe(1)
  })

  test('counts alive villagers only', () => {
    expect(countAlive(players, 'villager')).toBe(2)
  })
})

// ============================================================
// getNightOrder
// ============================================================
describe('getNightOrder', () => {
  test('includes only roles present in config', () => {
    const config: RoleConfig = { wolf: 2, seer: 1, villager: 5 }
    const order = getNightOrder(config)
    expect(order).toContain('wolf')
    expect(order).toContain('seer')
    expect(order).not.toContain('doctor')
    expect(order).not.toContain('witch')
  })

  test('maintains correct order wolf → seer → doctor → witch → hunter', () => {
    const config: RoleConfig = { wolf: 2, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 3 }
    const order = getNightOrder(config)
    expect(order[0]).toBe('wolf')
    expect(order[1]).toBe('seer')
    expect(order[2]).toBe('doctor')
    expect(order[3]).toBe('witch')
    expect(order[4]).toBe('hunter')
  })

  test('returns empty when no night roles', () => {
    const config: RoleConfig = { villager: 5 }
    const order = getNightOrder(config)
    expect(order.length).toBe(0)
  })
})

// ============================================================
// validateRoleConfig
// ============================================================
describe('validateRoleConfig', () => {
  test('returns null for valid config', () => {
    const config: RoleConfig = { wolf: 2, seer: 1, doctor: 1, villager: 6 }
    expect(validateRoleConfig(config, 10)).toBeNull()
  })

  test('returns error when total does not match player count', () => {
    const config: RoleConfig = { wolf: 2, villager: 5 }
    const error = validateRoleConfig(config, 10)
    expect(error).not.toBeNull()
    expect(error).toContain('10')
  })

  test('returns error when no wolves', () => {
    const config: RoleConfig = { seer: 1, villager: 9 }
    const error = validateRoleConfig(config, 10)
    expect(error).not.toBeNull()
    expect(error?.toLowerCase()).toContain('sói')
  })

  test('returns error when only wolves', () => {
    const config: RoleConfig = { wolf: 5 }
    const error = validateRoleConfig(config, 5)
    expect(error).not.toBeNull()
  })
})

// ============================================================
// generateRoomCode
// ============================================================
describe('generateRoomCode', () => {
  test('generates a 6-character code', () => {
    const code = generateRoomCode()
    expect(code.length).toBe(6)
  })

  test('generates unique codes across 100 calls', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode())
    }
    // Very unlikely to have collisions with 100 codes
    expect(codes.size).toBeGreaterThan(90)
  })

  test('only uses alphanumeric chars (no ambiguous chars)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode()
      expect(code).toMatch(/^[A-Z0-9]+$/)
      // No ambiguous chars: 0, O, I, 1
      expect(code).not.toMatch(/[01IO]/)
    }
  })
})

// ============================================================
// Integration: full game scenario
// ============================================================
describe('Full game scenario integration', () => {
  test('complete game round: assign → night action → resolve → check win', () => {
    // Setup: 5 players, 1 wolf, 4 villagers
    const players = makePlayers(['Alice', 'Bob', 'Carol', 'Dave', 'Eve'])
    const config: RoleConfig = { wolf: 1, villager: 4 }

    // Assign roles
    const assigned = assignRoles(players, config)
    const wolfPlayer = Object.values(assigned).find(p => p.role === 'wolf')!
    const villagers = Object.values(assigned).filter(p => p.role === 'villager')

    expect(wolfPlayer).toBeDefined()
    expect(villagers.length).toBe(4)

    // Night: wolf kills a villager
    const victim = villagers[0]
    const actions: NightActions = {
      ...getDefaultNightActions(),
      wolfVictim: victim.id,
    }
    const { deaths } = resolveNight(assigned, actions)
    expect(deaths).toContain(victim.id)

    // Apply deaths
    const afterNight = { ...assigned }
    for (const id of deaths) {
      afterNight[id] = { ...afterNight[id], isAlive: false }
    }

    // Check win (1 wolf vs 3 villagers - game continues)
    expect(checkWinCondition(afterNight)).toBeNull()

    // Continue until wolves win
    // Kill two more villagers
    const remaining = Object.values(afterNight).filter(p => p.isAlive && p.role !== 'wolf')
    const afterNight2 = { ...afterNight }
    afterNight2[remaining[0].id] = { ...remaining[0], isAlive: false }
    afterNight2[remaining[1].id] = { ...remaining[1], isAlive: false }

    // Now: 1 wolf vs 1 villager - wolves win
    expect(checkWinCondition(afterNight2)).toBe('wolves')
  })

  test('village wins when all wolves eliminated', () => {
    const players = makePlayers(['W1', 'W2', 'V1', 'V2', 'V3', 'V4'])
    const config: RoleConfig = { wolf: 2, villager: 4 }
    const assigned = assignRoles(players, config)
    const wolves = Object.values(assigned).filter(p => p.role === 'wolf')

    // Kill all wolves
    const afterKill = { ...assigned }
    for (const wolf of wolves) {
      afterKill[wolf.id] = { ...wolf, isAlive: false }
    }

    expect(checkWinCondition(afterKill)).toBe('village')
  })

  test('10-player game: no duplicate roles after assignment', () => {
    const players = makePlayers(Array.from({ length: 10 }, (_, i) => `P${i + 1}`))
    const config: RoleConfig = { wolf: 2, seer: 1, doctor: 1, villager: 6 }

    // Run multiple times to confirm determinism
    for (let trial = 0; trial < 10; trial++) {
      const assigned = assignRoles(players, config)
      const playerIds = Object.keys(assigned)
      const assignedRoles = playerIds.map(id => assigned[id].role)

      // Every player has a role
      expect(assignedRoles.every(r => r !== undefined)).toBe(true)

      // Role counts match
      const wolfCount = assignedRoles.filter(r => r === 'wolf').length
      const seerCount = assignedRoles.filter(r => r === 'seer').length
      const doctorCount = assignedRoles.filter(r => r === 'doctor').length
      const villagerCount = assignedRoles.filter(r => r === 'villager').length

      expect(wolfCount).toBe(2)
      expect(seerCount).toBe(1)
      expect(doctorCount).toBe(1)
      expect(villagerCount).toBe(6)
    }
  })
})
