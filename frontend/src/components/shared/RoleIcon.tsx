import { useState } from 'react'

interface RoleIconProps {
  role: string
  size?: number
  className?: string
}

const ROLE_ICON_PATHS: Record<string, string> = {
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

const ROLE_EMOJI_FALLBACK: Record<string, string> = {
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

export default function RoleIcon({ role, size = 24, className = '' }: RoleIconProps) {
  const src = ROLE_ICON_PATHS[role]
  const [imgError, setImgError] = useState(false)
  const emoji = ROLE_EMOJI_FALLBACK[role] || '❓'

  if (!src || imgError) {
    return <span style={{ fontSize: size * 0.75 }}>{emoji}</span>
  }

  return (
    <img
      src={src}
      alt={role}
      width={size}
      height={size}
      className={`inline-block rounded-full ${className}`}
      draggable={false}
      onError={() => setImgError(true)}
    />
  )
}
