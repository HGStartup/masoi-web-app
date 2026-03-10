interface RoleIconProps {
  role: string
  size?: number
  className?: string
}

const ROLE_ICON_PATHS: Record<string, string> = {
  wolf: '/icons/wolf.png',
  villager: '/icons/villager.png',
  seer: '/icons/seer.png',
  doctor: '/icons/doctor.png',
  witch: '/icons/witch.png',
  hunter: '/icons/hunter.png',
}

export default function RoleIcon({ role, size = 24, className = '' }: RoleIconProps) {
  const src = ROLE_ICON_PATHS[role]
  if (!src) return <span>❓</span>

  return (
    <img
      src={src}
      alt={role}
      width={size}
      height={size}
      className={`inline-block rounded-full ${className}`}
      draggable={false}
    />
  )
}
