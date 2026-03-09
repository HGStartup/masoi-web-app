import type { GameRoom, Player, RoleConfig, GamePhase } from '../types/game'
import { generateRoomCode, getDefaultNightActions } from './game-engine'

const rooms = new Map<string, GameRoom>()

// Cleanup rooms inactive > 2 hours
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
const ROOM_TTL = 2 * 60 * 60 * 1000   // 2 hours

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      rooms.delete(code)
      console.log(`[RoomManager] Cleaned up inactive room: ${code}`)
    }
  }
}, CLEANUP_INTERVAL)

export function createRoom(hostSocketId: string): GameRoom {
  let code: string
  do {
    code = generateRoomCode()
  } while (rooms.has(code))

  const room: GameRoom = {
    code,
    hostSocketId,
    phase: 'lobby',
    config: { playerCount: 0, roles: {} },
    players: {},
    round: 0,
    nightStepOrder: [],
    nightStepIndex: 0,
    nightActions: getDefaultNightActions(),
    voteSession: { isOpen: false, votes: {} },
    pendingAnnouncements: [],
    lastActivity: Date.now(),
  }

  rooms.set(code, room)
  return room
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code)
}

export function updateRoom(code: string, updates: Partial<GameRoom>): GameRoom | null {
  const room = rooms.get(code)
  if (!room) return null
  const updated = { ...room, ...updates, lastActivity: Date.now() }
  rooms.set(code, updated)
  return updated
}

export function deleteRoom(code: string): void {
  rooms.delete(code)
}

export function getRoomCount(): number {
  return rooms.size
}

export function addPlayerToRoom(code: string, player: Player): GameRoom | null {
  const room = rooms.get(code)
  if (!room) return null
  const updated = {
    ...room,
    players: { ...room.players, [player.id]: player },
    lastActivity: Date.now(),
  }
  rooms.set(code, updated)
  return updated
}

export function removePlayerFromRoom(code: string, playerId: string): GameRoom | null {
  const room = rooms.get(code)
  if (!room) return null
  const players = { ...room.players }
  delete players[playerId]
  const updated = { ...room, players, lastActivity: Date.now() }
  rooms.set(code, updated)
  return updated
}
