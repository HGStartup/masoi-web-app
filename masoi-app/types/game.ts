export type Role = 'wolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter'
export type GamePhase = 'lobby' | 'night' | 'day' | 'voting' | 'ended'

export interface RoleConfig {
  [role: string]: number
}

export interface Player {
  id: string
  socketId: string | null
  name: string
  role?: Role
  isAlive: boolean
}

export interface NightActions {
  wolfVictim?: string
  seerTarget?: string
  seerResult?: 'wolf' | 'not-wolf'
  doctorSave?: string
  witchHeal?: string
  witchPoison?: string
  witchHealUsed: boolean
  witchPoisonUsed: boolean
}

export interface VoteSession {
  isOpen: boolean
  votes: Record<string, string>
}

export interface GameRoom {
  code: string
  hostSocketId: string
  phase: GamePhase
  config: { playerCount: number; roles: RoleConfig }
  players: Record<string, Player>
  round: number
  nightStepOrder: Role[]
  nightStepIndex: number
  nightActions: NightActions
  voteSession: VoteSession
  pendingAnnouncements: string[]
  winner?: 'village' | 'wolves'
  lastActivity: number
}

export interface NightResolutionResult {
  deaths: string[]
  announcements: string[]
}

export type WinCondition = 'village' | 'wolves' | null
