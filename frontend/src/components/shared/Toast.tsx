import { useEffect, useState } from 'react'

interface ToastProps {
  message: string | null
  onDismiss?: () => void
}

export default function Toast({ message, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    if (message) {
      setCurrent(message)
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [message])

  if (!current) return null

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}
      onTransitionEnd={() => {
        if (!visible) {
          setCurrent(null)
          onDismiss?.()
        }
      }}
    >
      <div className="bg-red-900/90 border border-red-700 backdrop-blur-sm rounded-xl px-4 py-3 text-red-200 text-sm text-center shadow-lg">
        {current}
      </div>
    </div>
  )
}
