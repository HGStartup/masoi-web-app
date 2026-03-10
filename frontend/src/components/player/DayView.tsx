import { useStore } from '../../lib/store'
import RoleCard from './RoleCard'

export default function DayView() {
  const { announcements, round } = useStore()

  return (
    <div className="min-h-screen flex flex-col items-center p-4 space-y-6 pt-12">
      <div className="text-center space-y-2">
        <div className="text-5xl">☀️</div>
        <h2 className="text-2xl font-bold">Ban ngày – Vòng {round}</h2>
      </div>

      {announcements.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <h3 className="font-semibold text-gray-300">📢 Thông báo</h3>
          {announcements.map((msg, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-gray-200">
              {msg}
            </div>
          ))}
        </div>
      )}

      <RoleCard />
    </div>
  )
}
