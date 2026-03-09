# REQ-1: Ma Sói Web App — Host & Player Real-time Support — plan output
**Phase:** plan | **Generated:** 2026-03-08 17:48 UTC

I now have a complete picture of this greenfield project. Two prior design documents exist with detailed plans. Let me synthesize these into the final plan file.
Now I have everything I need. Let me write the final consolidated plan file.
I have all the information I need. Let me write the final plan file now.
I have enough context from the existing design documents. Let me write the final plan now.

The plan tool available to me is the Write tool for the plan file. Since I'm in plan mode, I can only write to `C:\Windows\system32\config\systemprofile\.claude\plans\goofy-swimming-nova.md`. Let me create that file with the comprehensive plan.

Based on my analysis of the two prior design documents (`REQ-1-research.md` and `REQ-1-architecture.md`), I'll consolidate them into the final definitive plan:
I don't have a Write tool or ExitPlanMode tool in my current tool set, so I'll present the final consolidated plan directly in my response. Based on my thorough reading of the two existing design documents, here is the complete implementation plan:

---

## 📋 Final Plan: Ma Sói Web App — Host & Player Real-time Support

### Context

This is a **greenfield real-time multiplayer web application** supporting the social deduction game "Ma Sói" (Werewolf) for in-person play sessions. Two prior design documents exist (`REQ-1-research.md` and `REQ-1-architecture.md`) with complementary designs. This plan synthesizes them into the definitive implementation approach.

**Problem**: Players and the game host (quản trò) need synchronized real-time interfaces — the host controls all game phases from a tablet/laptop, while players use their phones. No backend persistence is required; all state lives in memory during the session.

---

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) + TypeScript | Single repo, SSR + file-based routing, dynamic segments for `/host/[roomCode]` and `/play/[roomCode]` |
| **Real-time** | Socket.io v4 (via custom server) | Native room abstraction, reliable WebSocket + polling fallback, battle-tested |
| **Custom Server** | `server.ts` wrapping Next.js handler | Required to mount Socket.io on same port; incompatible with Vercel — deploy to Railway/Render/VPS |
| **Styling** | Tailwind CSS + shadcn/ui | Mobile-first utilities, accessible components, fast to prototype |
| **Client State** | Zustand | Lightweight reactive store for game state derived from socket events |
| **Server State** | In-memory `Map<roomCode, GameRoom>` | No DB needed; rooms are ephemeral; zero latency |
| **QR Code** | `qrcode.react` (client-side) | No server roundtrip; renders inline on host page |
| **Language** | Vietnamese throughout UI | Per requirements |

---

### Project Structure

```
masoi-app/
├── server/
│   ├── index.ts              # HTTP + Socket.io + Next.js handler bootstrap
│   ├── room-manager.ts       # In-memory RoomStore (Map<code, GameRoom>) + cleanup
│   ├── game-engine.ts        # Pure logic: assignRoles, resolveNight, checkWin, nightOrder
│   └── socket-handlers.ts    # All Socket.io event registrations
├── src/
│   ├── types/
│   │   └── game.ts           # All shared TypeScript interfaces
│   ├── app/
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Landing: Tạo phòng / Tham gia phòng
│   │   ├── host/[roomCode]/
│   │   │   └── page.tsx      # Host dashboard (state machine)
│   │   └── play/[roomCode]/
│   │       └── page.tsx      # Player mobile interface (state machine)
│   ├── components/
│   │   ├── host/
│   │   │   ├── RoomSetup.tsx         # Role config inputs + validation
│   │   │   ├── PlayerList.tsx        # Live join list + QR code
│   │   │   ├── RoleAssignmentList.tsx # Name → role table (host only)
│   │   │   ├── NightPhase.tsx        # Step-by-step night wizard
│   │   │   ├── DayPhase.tsx          # Announce results, alive/dead list
│   │   │   └── VotePanel.tsx         # Open vote, live tally, confirm execute
│   │   ├── player/
│   │   │   ├── JoinForm.tsx          # Name input on /play/[roomCode]
│   │   │   ├── WaitingRoom.tsx       # Lobby wait screen
│   │   │   ├── RoleCard.tsx          # Tap-to-reveal role card
│   │   │   ├── NightWait.tsx         # "Đêm đang diễn ra…" dark screen
│   │   │   ├── DayView.tsx           # Night result announcement
│   │   │   ├── VoteUI.tsx            # Alive: cast vote; Dead: spectator view
│   │   │   └── GameOverView.tsx      # Winner + role reveal
│   │   └── shared/
│   │       ├── QRCodeDisplay.tsx     # qrcode.react wrapper
│   │       └── WinScreen.tsx         # Shared end-game screen
│   └── lib/
│       ├── socket-client.ts          # Socket.io client singleton (lazy init)
│       └── use-game-store.ts         # Zustand store + socket event subscriptions
├── server.ts                         # Custom server entry point
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

### Data Model (`src/types/game.ts`)

```typescript
type Role = 'wolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter'
type GamePhase = 'lobby' | 'night' | 'day' | 'voting' | 'ended'

interface RoleConfig {
  [role: string]: number  // e.g. { wolf: 2, seer: 1, doctor: 1, villager: 5 }
}

interface Player {
  id: string          // stable UUID (assigned on join)
  socketId: string    // current socket (changes on reconnect)
  name: string
  role?: Role
  isAlive: boolean
}

interface NightActions {
  wolfVictim?: string       // player.id
  seerTarget?: string
  seerResult?: 'wolf' | 'not-wolf'
  doctorSave?: string
  witchHeal?: string
  witchPoison?: string
  witchHealUsed: boolean    // once per game
  witchPoisonUsed: boolean  // once per game
}

interface VoteSession {
  isOpen: boolean
  votes: Record<string, string>  // voterId → targetId
}

interface GameRoom {
  code: string
  hostSocketId: string
  phase: GamePhase
  config: { playerCount: number; roles: RoleConfig }
  players: Map<string, Player>    // id → Player
  round: number
  nightStepOrder: Role[]          // computed from active roles in config
  nightStepIndex: number
  nightActions: NightActions
  voteSession: VoteSession
  pendingAnnouncements: string[]  // queued until host presses "Công bố"
  winner?: 'village' | 'wolves'
  lastActivity: number            // Date.now() — for cleanup
}
```

---

### Socket.io Event Protocol

**Client → Server:**

| Event | Payload | Sender |
|---|---|---|
| `room:create` | — | Host |
| `room:configure` | `{ playerCount, roles }` | Host |
| `room:join` | `{ roomCode, playerName }` | Player |
| `game:start` | — | Host |
| `night:submit-action` | `{ step, targetId?, result? }` | Host |
| `night:advance` | — | Host |
| `day:announce` | — | Host |
| `player:mark-dead` | `{ playerId }` | Host |
| `vote:open` | — | Host |
| `vote:cast` | `{ targetId }` | Player (alive only) |
| `vote:confirm-execute` | `{ targetId }` | Host |
| `game:new` | — | Host |

**Server → Client:**

| Event | Payload | Recipients |
|---|---|---|
| `room:created` | `{ roomCode, joinUrl }` | Host only |
| `room:state` | `{ players[], phase, config }` | All (sanitized — no roles in player copy) |
| `role:assigned` | `{ role }` | **Individual player socket only** |
| `host:full-state` | `{ players[] with roles }` | Host only |
| `phase:night-step` | `{ step, roleLabel, instruction, stepIndex, totalSteps }` | Host only |
| `phase:day` | `{ announcements: string[] }` | All |
| `vote:opened` | `{ candidates: Player[] }` | All |
| `vote:updated` | `{ counts: Record<string,number> }` | All |
| `vote:executed` | `{ executed: Player }` | All |
| `game:ended` | `{ winner, reveals: Player[] }` | All |
| `room:error` | `{ message }` | Requester |

**Security invariants (enforced server-side):**
- `role:assigned` sent only via `socket.to(player.socketId).emit()` — never broadcast
- Night actions never emitted to room broadcast channel
- All host-only actions verify `socket.id === room.hostSocketId`
- `vote:cast` rejects if `player.isAlive === false`

---

### Game Engine Logic (`server/game-engine.ts`)

**Night order** (filtered to roles present in config):
```
wolf → seer → doctor → witch → hunter
```

**Role assignment:**
```
Expand RoleConfig → flat array → Fisher-Yates shuffle → zip with players → emit individually
```

**Night resolution** (called on `day:announce`):
```
candidate = wolfVictim
if doctorSave === candidate → candidate spared
if witchHeal === candidate → candidate spared (witchHealUsed = true)
if witchPoison alive → add to deaths (witchPoisonUsed = true)
→ apply isAlive=false for each death → trigger checkWin
```

**Win condition** (called after every elimination):
```
aliveWolves = count(isAlive && role==='wolf')
aliveOthers = count(isAlive && role!=='wolf')
aliveWolves === 0       → 'village' wins
aliveWolves >= aliveOthers → 'wolves' win
null                    → game continues
```

**Hunter special case:** When hunter dies (night or vote), host gets a prompt to designate hunter's target → additional death → re-run checkWin.

---

### Room Lifecycle & Cleanup (`server/room-manager.ts`)

- `lastActivity = Date.now()` updated on every mutation
- `setInterval` every 5 minutes: delete rooms where `Date.now() - lastActivity > 7_200_000` (2 hours)
- Host disconnect: room preserved for 60 seconds; `host_warning` event sent to players
- Player disconnect: player marked `socketId = null`; rejoining by same name reattaches

---

### Page State Machines

**`/host/[roomCode]`** — renders component based on `phase`:
- `lobby` → `RoomSetup` + `PlayerList` + `QRCodeDisplay` + "Bắt đầu ván" button
- `night` → `NightPhase` (wizard steps)
- `day` → `DayPhase` (announce button + alive/dead list)
- `voting` → `VotePanel` (live tally + confirm)
- `ended` → `WinScreen` + "Ván mới" button

**`/play/[roomCode]`** — renders component based on `phase` × `isAlive`:
- `lobby` → `JoinForm` → `WaitingRoom`
- `night` → `NightWait` (dark screen, role card accessible via button)
- `day` → `DayView` (announcements + role card)
- `voting` + alive → `VoteUI`
- `voting` + dead → `SpectatorView` (read-only vote counts)
- `ended` → `GameOverView`

---

### Implementation Phases

| Phase | Scope |
|---|---|
| 1 | Scaffold: Next.js 15 + Tailwind + shadcn/ui + custom server.ts + TypeScript config |
| 2 | Types (`game.ts`) + pure game engine (`game-engine.ts`) with unit tests |
| 3 | Room manager + all socket event handlers (`room-manager.ts`, `socket-handlers.ts`) |
| 4 | Client socket singleton + Zustand store (`socket-client.ts`, `use-game-store.ts`) |
| 5 | Landing page + room creation + join flow + QR code |
| 6 | Host lobby: player list real-time, role config UI + validation, "Bắt đầu" |
| 7 | Role assignment + host role table + player role cards |
| 8 | Night phase wizard (host) + dark wait screen (player) |
| 9 | Day phase: announce results, alive/dead management |
| 10 | Vote phase: open vote, real-time tally, spectator mode, confirm execute |
| 11 | Win condition + game-over screen + role reveal + new game flow |
| 12 | Polish: mobile responsiveness, Vietnamese copy, error states, reconnect handling |

---

### Critical Files Summary

| File | Role |
|---|---|
| `src/types/game.ts` | Single source of truth for all types (shared client + server) |
| `server/game-engine.ts` | Pure functions — assignRoles, nightOrder, resolveNight, checkWin |
| `server/room-manager.ts` | RoomStore CRUD + cleanup scheduler |
| `server/socket-handlers.ts` | All event registrations with security checks |
| `server/index.ts` | Bootstrap: `http.createServer` → attach Socket.io → attach Next.js handler |
| `src/lib/socket-client.ts` | `let socket; export getSocket()` singleton |
| `src/lib/use-game-store.ts` | Zustand store; subscribe to socket events in `useEffect` |
| `src/app/host/[roomCode]/page.tsx` | Host phase router — `'use client'` |
| `src/app/play/[roomCode]/page.tsx` | Player phase router — `'use client'` |
| `src/components/host/NightPhase.tsx` | Step-by-step wizard (most complex component) |
| `src/components/player/VoteUI.tsx` | Vote or spectate based on `isAlive` |

---

### Verification / Testing

**Unit tests (`game-engine.test.ts`):**
- `assignRoles`: every player gets exactly one role, counts match config, no duplicates
- `resolveNight`: wolfVictim + doctorSave same player → no death; witchPoison → extra death; one-use limits enforced
- `checkWin`: 0 wolves → 'village'; wolves ≥ others → 'wolves'; otherwise null

**Manual E2E flow:**
1. Open host on laptop → "Tạo phòng" → see 6-char code + QR
2. Open 10 browser tabs on phone (or different browsers) → scan QR → enter names → all appear in host list real-time
3. Configure roles (e.g. 2 Sói + 1 Tiên tri + 1 Thầy thuốc + 6 Dân) → "Bắt đầu ván"
4. Verify: each player sees only their own role; host sees full table
5. Night: host selects wolf victim → seer target (enter result) → doctor save → press advance
6. "Công bố kết quả" → all players see announcement simultaneously
7. "Mở bầu chọn" → alive players vote → dead players see spectator view → tally syncs real-time
8. Confirm execution → check alive/dead updates
9. Continue until one side wins → verify "Làng thắng" / "Sói thắng" + full role reveal on all devices

**Acceptance criteria checks:**
- Room creation + QR < 1 minute ✅
- 10–15 joins no duplicate roles ✅ (Fisher-Yates + unit tests)
- Night info not visible on player sockets ✅ (Network inspector — no nightActions in broadcast)
- Vote real-time, dead can't vote ✅ (server guard on `isAlive`)
- Win condition triggers correctly ✅ (unit tests + manual)

---

**Deployment note:** Must use Railway, Render, or a VPS — not Vercel — because the custom server with Socket.io requires persistent WebSocket connections. Set `PORT` env var; Next.js runs on the same port via the custom server handler.
