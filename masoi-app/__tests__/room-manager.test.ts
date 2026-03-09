import {
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
  getRoomCount,
  addPlayerToRoom,
  removePlayerFromRoom,
} from '../server/room-manager'
import type { Player } from '../types/game'

// Helper to create a test player
function makePlayer(name: string, overrides: Partial<Player> = {}): Player {
  return {
    id: `id-${name}`,
    socketId: `socket-${name}`,
    name,
    isAlive: true,
    ...overrides,
  }
}

describe('RoomManager', () => {
  const createdCodes: string[] = []

  afterEach(() => {
    // Clean up rooms created during tests
    for (const code of createdCodes) {
      deleteRoom(code)
    }
    createdCodes.length = 0
  })

  describe('createRoom', () => {
    test('creates a room with unique code', () => {
      const room = createRoom('host-socket-1')
      createdCodes.push(room.code)
      expect(room.code).toBeDefined()
      expect(room.code.length).toBe(6)
      expect(room.hostSocketId).toBe('host-socket-1')
    })

    test('new room starts in lobby phase', () => {
      const room = createRoom('host-socket-2')
      createdCodes.push(room.code)
      expect(room.phase).toBe('lobby')
    })

    test('new room has empty players', () => {
      const room = createRoom('host-socket-3')
      createdCodes.push(room.code)
      expect(Object.keys(room.players).length).toBe(0)
    })

    test('new room has lastActivity set', () => {
      const before = Date.now()
      const room = createRoom('host-socket-4')
      createdCodes.push(room.code)
      const after = Date.now()
      expect(room.lastActivity).toBeGreaterThanOrEqual(before)
      expect(room.lastActivity).toBeLessThanOrEqual(after)
    })

    test('creates two rooms with different codes', () => {
      const room1 = createRoom('host-1')
      const room2 = createRoom('host-2')
      createdCodes.push(room1.code, room2.code)
      expect(room1.code).not.toBe(room2.code)
    })
  })

  describe('getRoom', () => {
    test('returns room after creation', () => {
      const room = createRoom('h1')
      createdCodes.push(room.code)
      const fetched = getRoom(room.code)
      expect(fetched).toBeDefined()
      expect(fetched?.code).toBe(room.code)
    })

    test('returns undefined for non-existent code', () => {
      expect(getRoom('XXXXXX')).toBeUndefined()
    })
  })

  describe('updateRoom', () => {
    test('updates room fields', () => {
      const room = createRoom('h2')
      createdCodes.push(room.code)
      const updated = updateRoom(room.code, { phase: 'night', round: 1 })
      expect(updated?.phase).toBe('night')
      expect(updated?.round).toBe(1)
    })

    test('returns null for non-existent code', () => {
      expect(updateRoom('XXXXXX', { phase: 'night' })).toBeNull()
    })

    test('updates lastActivity on every mutation', async () => {
      const room = createRoom('h3')
      createdCodes.push(room.code)
      const before = room.lastActivity
      await new Promise(r => setTimeout(r, 5))
      const updated = updateRoom(room.code, { round: 2 })
      expect(updated?.lastActivity).toBeGreaterThan(before)
    })
  })

  describe('addPlayerToRoom', () => {
    test('adds a player to the room', () => {
      const room = createRoom('h4')
      createdCodes.push(room.code)
      const player = makePlayer('Alice')
      const updated = addPlayerToRoom(room.code, player)
      expect(updated?.players['id-Alice']).toBeDefined()
      expect(updated?.players['id-Alice'].name).toBe('Alice')
    })

    test('adds multiple players', () => {
      const room = createRoom('h5')
      createdCodes.push(room.code)
      addPlayerToRoom(room.code, makePlayer('Alice'))
      addPlayerToRoom(room.code, makePlayer('Bob'))
      const fetched = getRoom(room.code)
      expect(Object.keys(fetched!.players).length).toBe(2)
    })

    test('returns null for non-existent room', () => {
      expect(addPlayerToRoom('XXXXXX', makePlayer('Alice'))).toBeNull()
    })
  })

  describe('removePlayerFromRoom', () => {
    test('removes a player', () => {
      const room = createRoom('h6')
      createdCodes.push(room.code)
      addPlayerToRoom(room.code, makePlayer('Alice'))
      const removed = removePlayerFromRoom(room.code, 'id-Alice')
      expect(removed?.players['id-Alice']).toBeUndefined()
    })

    test('removing non-existent player does not throw', () => {
      const room = createRoom('h7')
      createdCodes.push(room.code)
      expect(() => removePlayerFromRoom(room.code, 'nonexistent')).not.toThrow()
    })

    test('returns null for non-existent room', () => {
      expect(removePlayerFromRoom('XXXXXX', 'id')).toBeNull()
    })
  })

  describe('deleteRoom', () => {
    test('deletes a room', () => {
      const room = createRoom('h8')
      deleteRoom(room.code)
      expect(getRoom(room.code)).toBeUndefined()
    })

    test('deleting non-existent room does not throw', () => {
      expect(() => deleteRoom('XXXXXX')).not.toThrow()
    })
  })

  describe('getRoomCount', () => {
    test('returns correct count after creating rooms', () => {
      const initialCount = getRoomCount()
      const room1 = createRoom('h9')
      const room2 = createRoom('h10')
      createdCodes.push(room1.code, room2.code)
      expect(getRoomCount()).toBe(initialCount + 2)
    })

    test('decrements after deletion', () => {
      const initialCount = getRoomCount()
      const room = createRoom('h11')
      expect(getRoomCount()).toBe(initialCount + 1)
      deleteRoom(room.code)
      expect(getRoomCount()).toBe(initialCount)
    })
  })
})
