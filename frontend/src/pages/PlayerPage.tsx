import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { startConnection, getConnection } from '../lib/signalr'
import { useStore, subscribeToEvents } from '../lib/store'
import Header from '../components/shared/Header'
import JoinForm from '../components/player/JoinForm'
import WaitingRoom from '../components/player/WaitingRoom'
import NightWait from '../components/player/NightWait'
import DayView from '../components/player/DayView'
import VoteUI from '../components/player/VoteUI'
import GameOver from '../components/shared/GameOver'
import Toast from '../components/shared/Toast'

export default function PlayerPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const { phase, round, myPlayerId, error, winner, reveals, players } = useStore()

  useEffect(() => {
    if (!roomCode) return

    const init = async () => {
      try {
        const conn = await startConnection()
        subscribeToEvents()
        useStore.setState({ roomCode, isConnected: true })

        // Try to rejoin if we have a saved playerId
        const savedPlayerId = sessionStorage.getItem(`player_${roomCode}`)
        if (savedPlayerId) {
          await conn.invoke('RejoinRoom', roomCode, savedPlayerId)
        }
      } catch {
        useStore.setState({ error: 'Không thể kết nối server' })
      }
    }

    init()
  }, [roomCode])

  // Save playerId to sessionStorage when it changes
  useEffect(() => {
    if (roomCode && myPlayerId) {
      sessionStorage.setItem(`player_${roomCode}`, myPlayerId)
    }
  }, [roomCode, myPlayerId])

  if (!roomCode) return null

  // Not joined yet
  if (!myPlayerId) {
    return <JoinForm roomCode={roomCode} />
  }

  const handleNewGame = () => {
    const conn = getConnection()
    conn.invoke('NewGame', roomCode)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header title="Người chơi" roomCode={roomCode} round={round} />

      <Toast message={error} onDismiss={() => useStore.setState({ error: null })} />

      {phase === 'lobby' && <WaitingRoom />}
      {phase === 'night' && <NightWait />}
      {phase === 'day' && <DayView />}
      {phase === 'voting' && <VoteUI />}
      {phase === 'ended' && (
        <GameOver
          winner={winner || 'village'}
          reveals={reveals.length > 0 ? reveals : players.map(p => ({
            id: p.id, name: p.name, role: p.role || 'villager', isAlive: p.isAlive
          }))}
          isHost={false}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  )
}
