import RoleIcon from './RoleIcon'

interface HeaderProps {
  title: string
  roomCode: string
  round?: number
}

export default function Header({ title, roomCode, round }: HeaderProps) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <RoleIcon role="wolf" size={28} />
        <h1 className="text-lg font-bold text-white">Ma Sói</h1>
        <span className="text-gray-400 text-sm">— {title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="bg-violet-600 text-white px-3 py-1 rounded-lg text-sm font-mono font-bold">
          PHÒNG: {roomCode}
        </span>
        {round !== undefined && round > 0 && (
          <span className="bg-orange-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
            VÒNG {round}
          </span>
        )}
      </div>
    </header>
  )
}
