import { create } from 'zustand'

export interface ZaloUser {
  id: string
  name: string
  picture: string
}

interface AuthStore {
  user: ZaloUser | null
  isLoading: boolean
  setUser: (user: ZaloUser | null) => void
  setLoading: (v: boolean) => void
  logout: () => void
}

const STORAGE_KEY = 'masoi_zalo_user'

function loadUser(): ZaloUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: loadUser(),
  isLoading: false,
  setUser: (user) => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ user })
  },
  setLoading: (v) => set({ isLoading: v }),
  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('masoi_zalo_code_verifier')
    set({ user: null })
  },
}))

// PKCE helpers for Zalo OAuth2
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join('')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  return crypto.subtle.digest('SHA-256', encoder.encode(plain))
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function startZaloLogin() {
  const res = await fetch('/api/auth/zalo/config')
  if (!res.ok) {
    throw new Error('Không thể kết nối server')
  }
  const text = await res.text()
  if (!text) {
    throw new Error('Server trả về dữ liệu rỗng')
  }
  const config = JSON.parse(text)
  if (!config.appId) {
    throw new Error('Zalo App chưa được cấu hình trên server')
  }

  const codeVerifier = generateRandomString(43)
  localStorage.setItem('masoi_zalo_code_verifier', codeVerifier)

  const challengeBuffer = await sha256(codeVerifier)
  const codeChallenge = base64UrlEncode(challengeBuffer)

  const state = generateRandomString(16)
  localStorage.setItem('masoi_zalo_state', state)

  const url =
    'https://oauth.zaloapp.com/v4/permission' +
    `?app_id=${config.appId}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&code_challenge=${codeChallenge}` +
    `&state=${state}`

  window.location.href = url
}

export async function handleZaloCallback(code: string, state: string): Promise<ZaloUser> {
  const savedState = localStorage.getItem('masoi_zalo_state')
  if (state !== savedState) {
    throw new Error('State mismatch - có thể bị tấn công CSRF')
  }

  const codeVerifier = localStorage.getItem('masoi_zalo_code_verifier') || ''

  const res = await fetch('/api/auth/zalo/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier }),
  })

  const data = await res.json()

  if (!data.success || !data.user) {
    throw new Error(data.error || 'Đăng nhập Zalo thất bại')
  }

  // Cleanup
  localStorage.removeItem('masoi_zalo_code_verifier')
  localStorage.removeItem('masoi_zalo_state')

  return data.user
}
