import RoleCard from './RoleCard'

export default function NightWait() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-950 space-y-8">
      <div className="text-center space-y-3">
        <div className="text-6xl">🌙</div>
        <h2 className="text-2xl font-bold text-gray-200">Đêm đang diễn ra...</h2>
        <p className="text-gray-500">Hãy nhắm mắt và chờ quản trò</p>
      </div>
      <RoleCard />
    </div>
  )
}
