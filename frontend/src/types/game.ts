export type Role = 'wolf' | 'alphawolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter' | 'guard' | 'elder'
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
  alphawolf: 'Sói Đầu Đàn',
  villager: 'Dân thường',
  seer: 'Tiên tri',
  doctor: 'Thầy thuốc',
  witch: 'Phù thủy',
  hunter: 'Thợ săn',
  guard: 'Bảo vệ',
  elder: 'Già làng',
}

export const ROLE_ICON_PATHS: Record<string, string> = {
  wolf: '/icons/wolf.png',
  alphawolf: '/icons/alphawolf.png',
  villager: '/icons/villager.png',
  seer: '/icons/seer.png',
  doctor: '/icons/doctor.png',
  witch: '/icons/witch.png',
  hunter: '/icons/hunter.png',
  guard: '/icons/guard.png',
  elder: '/icons/elder.png',
}

/** @deprecated Use RoleIcon component instead */
export const ROLE_ICONS: Record<string, string> = {
  wolf: '🐺',
  alphawolf: '🐺',
  villager: '👤',
  seer: '🔮',
  doctor: '💊',
  witch: '🧪',
  hunter: '🏹',
  guard: '🛡️',
  elder: '👴',
}

/** Roles that are always available (core) */
export const CORE_ROLES: Role[] = ['wolf', 'villager']

/** Special roles that can be toggled on/off */
export const SPECIAL_ROLES: Role[] = ['alphawolf', 'seer', 'doctor', 'witch', 'hunter', 'guard', 'elder']

/** All roles */
export const ALL_ROLES: Role[] = ['wolf', 'alphawolf', 'villager', 'seer', 'doctor', 'witch', 'hunter', 'guard', 'elder']

/** Role descriptions for tooltip */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  wolf: 'Mỗi đêm chọn 1 người để giết',
  alphawolf: 'Sói + 1 lần biến nạn nhân thành sói thay vì giết',
  villager: 'Không có năng lực đặc biệt',
  seer: 'Mỗi đêm soi 1 người xem có phải sói không',
  doctor: 'Mỗi đêm cứu 1 người (không lặp lại)',
  witch: '1 bình cứu + 1 bình độc, dùng 1 lần cả game',
  hunter: 'Khi chết được bắn 1 người',
  guard: 'Mỗi đêm bảo vệ 1 người khỏi sói (không lặp lại)',
  elder: 'Chịu được 2 lần sói cắn. Bị dân treo cổ → dân mất năng lực',
}

export const isWolfTeam = (role?: string) => role === 'wolf' || role === 'alphawolf'
