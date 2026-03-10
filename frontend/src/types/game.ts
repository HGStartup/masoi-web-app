export type Role = 'wolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter'
export type GamePhase = 'lobby' | 'night' | 'day' | 'voting' | 'ended'

export interface Player {
  id: string
  name: string
  role?: Role
  isAlive: boolean
}

export interface RoleConfig {
  [role: string]: number
}

export interface GameConfig {
  playerCount: number
  roles: RoleConfig
}

export interface VoteSessionDto {
  isOpen: boolean
  counts: Record<string, number>
}

export interface NightStepInfo {
  role: string
  label: string
  instruction: string
  stepIndex: number
  totalSteps: number
  alivePlayers: Player[]
}

export interface GameState {
  roomCode: string
  phase: GamePhase
  players: Player[]
  round: number
  config: GameConfig
  voteSession: VoteSessionDto
  pendingAnnouncements: string[]
  winner?: string
}

export interface RevealInfo {
  id: string
  name: string
  role: string
  isAlive: boolean
}

export const ROLE_NAMES: Record<string, string> = {
  wolf: 'Sói',
  villager: 'Dân thường',
  seer: 'Tiên tri',
  doctor: 'Thầy thuốc',
  witch: 'Phù thủy',
  hunter: 'Thợ săn',
}

export const ROLE_ICON_PATHS: Record<string, string> = {
  wolf: '/icons/wolf.png',
  villager: '/icons/villager.png',
  seer: '/icons/seer.png',
  doctor: '/icons/doctor.png',
  witch: '/icons/witch.png',
  hunter: '/icons/hunter.png',
}

/** @deprecated Use RoleIcon component instead */
export const ROLE_ICONS: Record<string, string> = {
  wolf: '🐺',
  villager: '👤',
  seer: '🔮',
  doctor: '💊',
  witch: '🧪',
  hunter: '🏹',
}

export const ALL_ROLES: Role[] = ['wolf', 'villager', 'seer', 'doctor', 'witch', 'hunter']
