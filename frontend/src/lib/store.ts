import { create } from 'zustand'
import type { GameState, GamePhase, Player, NightStepInfo, RevealInfo } from '../types/game'
import { getConnection } from './signalr'

interface Store {
  // Connection
  isConnected: boolean
  error: string | null

  // Room
  roomCode: string | null
  isHost: boolean

  // Player identity
  myPlayerId: string | null
  myRole: string | null

  // Game state
  phase: GamePhase
  players: Player[]
  round: number
  config: { playerCount: number; roles: Record<string, number> }
  nightStep: NightStepInfo | null
  announcements: string[]
  voteCounts: Record<string, number>
  voteOpen: boolean
  winner: string | null
  reveals: RevealInfo[]

  // Actions
  setConnected: (v: boolean) => void
  setError: (v: string | null) => void
  setRoomCode: (v: string) => void
  setIsHost: (v: boolean) => void
  setMyPlayerId: (v: string) => void
  reset: () => void
}

const initialState = {
  isConnected: false,
  error: null,
  roomCode: null,
  isHost: false,
  myPlayerId: null,
  myRole: null,
  phase: 'lobby' as GamePhase,
  players: [],
  round: 0,
  config: { playerCount: 0, roles: {} },
  nightStep: null,
  announcements: [],
  voteCounts: {},
  voteOpen: false,
  winner: null,
  reveals: [],
}

export const useStore = create<Store>((set) => ({
  ...initialState,
  setConnected: (v) => set({ isConnected: v }),
  setError: (v) => set({ error: v }),
  setRoomCode: (v) => set({ roomCode: v }),
  setIsHost: (v) => set({ isHost: v }),
  setMyPlayerId: (v) => set({ myPlayerId: v }),
  reset: () => set(initialState),
}))

export function subscribeToEvents() {
  const conn = getConnection()

  conn.on('RoomState', (state: GameState) => {
    // Host receives HostState (with roles) — skip RoomState to avoid overwriting
    if (useStore.getState().isHost) return

    useStore.setState({
      phase: state.phase,
      players: state.players,
      round: state.round,
      config: state.config,
      voteOpen: state.voteSession.isOpen,
      voteCounts: state.voteSession.counts,
      winner: state.winner ?? null,
    })
  })

  conn.on('HostState', (state: GameState) => {
    useStore.setState({
      phase: state.phase,
      players: state.players,
      round: state.round,
      config: state.config,
      voteOpen: state.voteSession.isOpen,
      voteCounts: state.voteSession.counts,
      announcements: state.pendingAnnouncements,
      winner: state.winner ?? null,
    })
  })

  conn.on('RoomCreated', (roomCode: string) => {
    useStore.setState({ roomCode })
  })

  conn.on('JoinedRoom', (_roomCode: string, playerId: string) => {
    useStore.setState({ myPlayerId: playerId })
  })

  conn.on('RoleAssigned', (role: string) => {
    useStore.setState({ myRole: role })
  })

  conn.on('NightStep', (step: NightStepInfo) => {
    useStore.setState({ nightStep: step })
  })

  conn.on('DayAnnouncements', (announcements: string[]) => {
    useStore.setState({ announcements })
  })

  conn.on('VoteOpened', () => {
    useStore.setState({ voteOpen: true, voteCounts: {} })
  })

  conn.on('VoteUpdated', (counts: Record<string, number>) => {
    useStore.setState({ voteCounts: counts })
  })

  conn.on('VoteExecuted', () => {
    useStore.setState({ voteOpen: false, voteCounts: {} })
  })

  conn.on('GameEnded', (winner: string, reveals: RevealInfo[]) => {
    useStore.setState({ winner, reveals, phase: 'ended' })
  })

  conn.on('Error', (message: string) => {
    useStore.setState({ error: message })
    setTimeout(() => useStore.setState({ error: null }), 4000)
  })

  conn.onreconnected(() => {
    useStore.setState({ isConnected: true })
  })

  conn.onclose(() => {
    useStore.setState({ isConnected: false })
  })
}
