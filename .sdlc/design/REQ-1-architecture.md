# REQ-1: Ma Sói Web App — Host & Player Real-time Support — architecture output
**Phase:** architecture | **Generated:** 2026-03-08 17:45 UTC

Đây là greenfield project — không có codebase nào tồn tại. Tôi sẽ thiết kế kiến trúc từ đầu dựa trên toàn bộ yêu cầu. Để viết plan file ngay.
Tôi không có Write tool trong bộ công cụ hiện tại, nên tôi sẽ trình bày plan đầy đủ trong response này và gọi ExitPlanMode khi hoàn tất.

---

# 🐺 Ma Sói Web App — Kiến trúc Hệ thống

## Context

Ma Sói là trò chơi nhập vai nhóm chơi trực tiếp (in-person), cần một ứng dụng hỗ trợ quản trò điều phối pha đêm/ngày và đồng bộ trạng thái tới điện thoại của từng người chơi real-time. Không cần đăng nhập, không cần lưu lịch sử — dữ liệu chỉ tồn tại trong RAM trong thời gian ván chơi.

---

## Tech Stack

| Layer | Công nghệ | Lý do |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) | SSR + API routes + routing, 1 repo duy nhất |
| Real-time | **Socket.io** (via custom server) | WebSocket với graceful fallback, room abstraction sẵn có |
| Styling | **Tailwind CSS + shadcn/ui** | Mobile-first nhanh, accessible |
| QR Code | **qrcode.react** | Generate phía client, không cần server |
| State (client) | **Zustand** | Lightweight, phù hợp game state đơn giản |
| Server state | **In-memory (Node.js Map)** | Không cần DB, room tự expire |
| Runtime | **Node.js custom server** (server.ts) | Gắn Socket.io vào Next.js handler |

### Deployment Target
- **Single service**: Railway / Render / VPS — Next.js custom server (không dùng Vercel vì cần persistent WebSocket)

---

## Cấu trúc Dự án

```
masoi-app/
├── server/
│   ├── index.ts              # Entry: HTTP + Socket.io + Next.js handler
│   ├── room-manager.ts       # In-memory RoomStore (Map<roomCode, GameRoom>)
│   ├── game-engine.ts        # Pure logic: assign roles, check win, night order
│   └── socket-handlers.ts    # Tất cả event handlers
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Landing: Tạo phòng / Join phòng
│   │   ├── host/[roomCode]/page.tsx     # Host dashboard
│   │   └── play/[roomCode]/page.tsx     # Player mobile interface
│   ├── components/
│   │   ├── host/
│   │   │   ├── RoomSetup.tsx            # Cấu hình số người + vai
│   │   │   ├── PlayerList.tsx           # Danh sách đã join (real-time)
│   │   │   ├── RoleAssignmentList.tsx   # Tên + vai (sau khi bắt đầu)
│   │   │   ├── NightPhase.tsx           # Step-by-step đêm
│   │   │   ├── DayPhase.tsx             # Quản lý ngày + alive/dead
│   │   │   └── VotePanel.tsx            # Mở vote, xem kết quả, xác nhận
│   │   ├── player/
│   │   │   ├── WaitingRoom.tsx          # Chờ host bắt đầu
│   │   │   ├── RoleCard.tsx             # Hiển thị vai (bấm để xem)
│   │   │   ├── DayView.tsx              # Thông báo kết quả đêm
│   │   │   ├── VoteUI.tsx               # Bỏ phiếu treo cổ
│   │   │   └── SpectatorView.tsx        # Người chết xem diễn biến
│   │   └── shared/
│   │       ├── QRCodeDisplay.tsx
│   │       └── WinScreen.tsx
│   ├── lib/
│   │   ├── socket-client.ts             # Socket.io client singleton
│   │   └── room-code.ts                 # Generate 6-char alphanumeric code
│   └── types/
│       └── game.ts                      # Tất cả TypeScript interfaces
├── server.ts                            # Custom server entry point
└── package.json
```

---

## Data Model (Server In-Memory)

```typescript
// types/game.ts

type Role = 'wolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter' | 'guardian'

type GamePhase = 'lobby' | 'role-reveal' | 'night' | 'day' | 'voting' | 'ended'

interface RoleConfig {
  [role: string]: number  // { wolf: 2, seer: 1, doctor: 1, villager: 5 }
}

interface Player {
  socketId: string
  name: string
  role?: Role
  isAlive: boolean
}

interface NightActions {
  wolfVictim?: string          // playerId
  seerTarget?: string
  seerResult?: 'wolf' | 'not-wolf'
  doctorSave?: string
  witchPoison?: string
  witchHeal?: string
  hunterShoot?: string
}

interface GameRoom {
  code: string
  hostSocketId: string
  status: GamePhase
  config: {
    playerCount: number
    roles: RoleConfig
  }
  players: Map<string, Player>   // socketId → Player
  round: number
  nightActions: NightActions
  nightStepIndex: number         // index vào NIGHT_ORDER
  pendingAnnouncement?: string[] // mảng thông báo chờ công bố
  votes: Map<string, string>     // voterId → targetId
  winner?: 'village' | 'wolves'
  lastActivity: number           // timestamp để auto-cleanup
}
```

---

## Socket.io Event Protocol

### Client → Server

| Event | Payload | Ai gửi |
|---|---|---|
| `room:create` | `{ playerCount, roles: RoleConfig }` | Host |
| `room:join` | `{ roomCode, playerName }` | Player |
| `room:leave` | — | Player |
| `game:start` | — | Host |
| `night:submit-action` | `{ step: NightStep, targetId?, result? }` | Host |
| `night:advance` | — | Host |
| `day:announce` | — | Host |
| `vote:open` | — | Host |
| `vote:cast` | `{ targetId: string }` | Player (alive) |
| `vote:confirm-execute` | `{ targetId: string }` | Host |
| `player:mark-dead` | `{ playerId: string }` | Host |
| `game:new` | — | Host |

### Server → Client

| Event | Payload | Ai nhận |
|---|---|---|
| `room:created` | `{ roomCode, joinUrl }` | Host only |
| `room:state` | `{ players[], status }` | All in room |
| `room:error` | `{ message }` | Requester |
| `role:assigned` | `{ role: Role }` | Player only (private) |
| `host:game-started` | `{ players: PlayerWithRole[] }` | Host only |
| `phase:night-step` | `{ step, roleLabel, instructions }` | Host only |
| `phase:day` | `{ announcement: string[] }` | All |
| `vote:opened` | `{ candidates: Player[] }` | All |
| `vote:updated` | `{ counts: Record<string,number> }` | All |
| `vote:result` | `{ executed: Player, counts }` | All |
| `game:ended` | `{ winner, reveals: PlayerWithRole[] }` | All |

---

## Game Engine Logic (server/game-engine.ts)

### Night Phase Order
```typescript
const NIGHT_ORDER: NightStep[] = [
  { role: 'wolf',     label: 'Sói thức',    instruction: 'Sói mở mắt, chọn nạn nhân' },
  { role: 'seer',     label: 'Tiên tri thức', instruction: 'Tiên tri chỉ 1 người để soi' },
  { role: 'doctor',   label: 'Thầy thuốc thức', instruction: 'Thầy thuốc chọn người cứu' },
  { role: 'witch',    label: 'Phù thủy thức', instruction: 'Phù thủy dùng thuốc độc/cứu' },
  { role: 'guardian', label: 'Vệ binh thức', instruction: 'Vệ binh bảo vệ 1 người' },
]
// Chỉ include các bước có role tương ứng trong config của phòng
```

### Role Assignment
```typescript
function assignRoles(players: Player[], config: RoleConfig): Map<string, Role> {
  // Expand config thành array: ['wolf','wolf','seer','villager',...]
  // Fisher-Yates shuffle
  // Map player.socketId → role
}
```

### Night Resolution
```typescript
function resolveNight(actions: NightActions): {
  killed: string | null,  // wolfVictim trừ nếu được cứu
  announcements: string[]
}
```

### Win Condition (check sau mỗi elimination)
```typescript
function checkWinCondition(players: Map<string, Player>): 'village' | 'wolves' | null {
  const aliveWolves = countAlive(players, 'wolf')
  const aliveVillagers = countAlive(players, /* all non-wolf */)
  if (aliveWolves === 0) return 'village'
  if (aliveWolves >= aliveVillagers) return 'wolves'
  return null
}
```

---

## Room Lifecycle & Cleanup

```
Tạo phòng → Lobby → [Đủ người] → Role Assign → Night ↔ Day loop → Ended
                                                                        ↓
                                                              New Game / Phòng đóng
```

- **Auto-cleanup**: `setInterval` mỗi 5 phút, xóa phòng có `lastActivity > 2 giờ`
- Mỗi action cập nhật `room.lastActivity = Date.now()`
- Khi host disconnect: phòng không bị xóa ngay, chờ timeout (host có thể reconnect trong 60s)

---

## Routing & Page Logic

### `/` — Landing Page
- Tab "Tạo phòng" (→ `/host/[code]`): chỉ bấm nút, server tạo phòng trống
- Tab "Tham gia" (→ `/play/[code]`): nhập mã phòng hoặc quét QR

### `/host/[roomCode]` — Host Dashboard
State machine dựa trên `room.status`:
- `lobby`: RoomSetup (config vai) + QRCode + PlayerList + nút "Bắt đầu"
- `role-reveal`: RoleAssignmentList (tên + vai đầy đủ)
- `night`: NightPhase (step-by-step, submit actions)
- `day`: DayPhase (alive/dead list, nút Công bố)
- `voting`: VotePanel (live counts, confirm execute)
- `ended`: WinScreen

### `/play/[roomCode]` — Player Page
State machine:
- `lobby`: WaitingRoom + tên phòng
- `role-reveal` / `night` / `day`: RoleCard (bấm để hiện/ẩn) + trạng thái game
- `voting` (alive): VoteUI — chọn 1 người + submit
- `voting` (dead): SpectatorView — xem vote counts
- `ended`: WinScreen

---

## Validation & Security

- **Role total check**: client-side + server-side validate `sum(roles) === playerCount`
- **Dead player vote guard**: server check `player.isAlive` trước khi process `vote:cast`
- **Host-only actions**: mọi action nhạy cảm (start game, night actions, confirm vote) đều check `socket.id === room.hostSocketId`
- **Private role delivery**: `server.to(player.socketId).emit('role:assigned', { role })` — không bao giờ broadcast

---

## Sensitive Info Protection

- Trong pha đêm: server **không emit** nightActions ra broadcast
- `phase:day` announcement chỉ nói "X đã bị giết" — không nói tại sao
- Seer result chỉ gửi về hostSocketId, không ra player
- Full reveal chỉ khi `game:ended`

---

## Files Cần Tạo (theo thứ tự implement)

1. `package.json` + `tsconfig.json` + `tailwind.config.ts` — setup
2. `src/types/game.ts` — tất cả types
3. `server/room-manager.ts` — RoomStore in-memory
4. `server/game-engine.ts` — pure functions: assignRoles, resolveNight, checkWin, nightOrder
5. `server/socket-handlers.ts` — đăng ký tất cả socket events
6. `server/index.ts` — bootstrap HTTP + Socket.io + Next.js
7. `src/lib/socket-client.ts` — singleton Socket.io client
8. `src/app/page.tsx` — landing
9. `src/app/host/[roomCode]/page.tsx` + host components
10. `src/app/play/[roomCode]/page.tsx` + player components
11. `src/components/shared/` — QRCodeDisplay, WinScreen

---

## Verification / Testing

### Manual E2E Flow
1. Mở host trên desktop → "Tạo phòng" → thấy QR + mã phòng
2. Mở 10 tab điện thoại (hoặc browser) → join với tên khác nhau
3. Host cấu hình 2 Sói + 1 Tiên tri + 1 Thầy thuốc + 6 Dân → bấm Bắt đầu
4. Kiểm tra mỗi player chỉ thấy đúng vai của mình (không ai thấy vai người khác)
5. Host điều hành đêm: chọn nạn nhân Sói, soi Tiên tri, cứu Thầy thuốc → công bố kết quả ngày
6. Mở vote → tất cả alive players thấy UI vote → người chết thấy spectator → kết quả đồng bộ real-time
7. Sau vài vòng: loại hết Sói → app hiển thị "Làng thắng" với reveal toàn bộ vai

### Unit Tests (game-engine.ts)
- `assignRoles`: đúng số lượng từng role, đủ players
- `resolveNight`: wolfVictim + doctorSave cùng người → killed = null
- `checkWinCondition`: 0 wolf → village; wolves >= villagers → wolves

### Acceptance Criteria Mapping
| AC | Test |
|---|---|
| Tạo phòng < 1 phút | Manual timing |
| 10-15 người join không trùng vai | Unit test assignRoles + manual |
| Đêm không lộ info | Network inspector: không thấy nightActions trong player socket |
| Vote real-time chính xác | 2 browser tabs, vote đồng bộ |
| Win condition đúng | Unit test + manual |

---

Kế hoạch này bao gồm toàn bộ kiến trúc greenfield cho Ma Sói Web App. Tôi sẵn sàng bắt đầu implement.
---

## ✅ Kiến trúc đã hoàn thiện

Tôi đã thiết kế toàn bộ kiến trúc cho **Ma Sói Web App**. Dưới đây là tóm tắt các quyết định quan trọng nhất:

### Quyết định kiến trúc chính

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| **Framework** | Next.js 15 + custom server | 1 repo, SSR + routing + API |
| **Real-time** | Socket.io | Room abstraction native, WebSocket fallback |
| **State server** | In-memory Map | Không cần DB, đơn giản, zero persistence |
| **Deployment** | Railway/Render (non-Vercel) | Cần persistent WebSocket connection |
| **Mobile UI** | Tailwind + shadcn/ui | Mobile-first nhanh, accessible |
| **QR Code** | qrcode.react (client-side) | Không cần server roundtrip |

### Điểm bảo mật quan trọng
- **Private role**: `socket.to(player.socketId).emit()` — không bao giờ broadcast role
- **Dead player guard**: Server check `isAlive` trước khi xử lý vote
- **Host-only**: Mọi action nhạy cảm kiểm tra `socket.id === room.hostSocketId`
- **Night info**: Không emit `nightActions` cho players, chỉ host nhận step instructions

### Thứ tự implement đề xuất
1. Types + Game Engine (pure logic, có thể unit test ngay)
2. Server (room-manager + socket-handlers)
3. Host pages (landing + host dashboard)
4. Player pages (join + mobile UI)
5. Shared components (QR, WinScreen)

Bạn có muốn điều chỉnh gì trước khi bắt đầu implement không? Ví dụ:
- Thêm role mới (Cupid, Thần chết, v.v.)
- Thay đổi deployment target
- Thêm tính năng timer cho pha đêm/ngày
- Yêu cầu về ngôn ngữ UI (chỉ tiếng Việt hay cần đa ngôn ngữ)?
