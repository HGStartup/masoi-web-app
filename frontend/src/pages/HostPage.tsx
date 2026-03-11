import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { startConnection, getConnection } from '../lib/signalr'
import { useStore, subscribeToEvents } from '../lib/store'
import Header from '../components/shared/Header'
import Lobby from '../components/host/Lobby'
import NightPhase from '../components/host/NightPhase'
import DayPhase from '../components/host/DayPhase'
import VotePanel from '../components/host/VotePanel'
import GameOver from '../components/shared/GameOver'
import HunterShotModal from '../components/host/HunterShotModal'
import Toast from '../components/shared/Toast'

export default function HostPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const { phase, round, isConnected, error, winner, reveals, players } = useStore()

  useEffect(() => {
    if (!roomCode) return

    const init = async () => {
      try {
        const conn = await startConnection()
        subscribeToEvents()
        useStore.setState({ roomCode, isHost: true, isConnected: true })

        // Try to rejoin existing room first
        conn.on('RoomCreated', (code: string) => {
          if (code !== roomCode) {
            navigate(`/host/${code}`, { replace: true })
          }
        })

        // Rejoin the room as host (works after F5/reconnect)
        await conn.invoke('RejoinHost', roomCode)
      } catch {
        useStore.setState({ error: 'Không thể kết nối server' })
      }
    }

    init()
  }, [roomCode, navigate])

  if (!roomCode) return null

  const handleNewGame = () => {
    const conn = getConnection()
    conn.invoke('NewGame', roomCode)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header title="Quản trò" roomCode={roomCode} round={round} />

      <Toast message={error} onDismiss={() => useStore.setState({ error: null })} />
      <HunterShotModal />

      {!isConnected && (
        <div className="mx-4 mt-4 p-3 bg-yellow-900/40 border border-yellow-800 rounded-xl text-yellow-300 text-center">
          Đang kết nối...
        </div>
      )}

      {phase === 'lobby' && <Lobby />}
      {phase === 'night' && <NightPhase />}
      {phase === 'day' && <DayPhase />}
      {phase === 'voting' && <VotePanel />}
      {phase === 'ended' && (
        <GameOver
          winner={winner || 'village'}
          reveals={reveals.length > 0 ? reveals : players.map(p => ({
            id: p.id, name: p.name, role: p.role || 'villager', isAlive: p.isAlive
          }))}
          isHost={true}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  )
}
