# REQ-1: Ma Sói Web App — Host & Player Real-time Support — research output
**Phase:** research | **Generated:** 2026-03-08 17:43 UTC

Now I have a complete understanding of the requirements. This is a brand-new project with no existing codebase. Let me write the comprehensive plan.
I now have a complete understanding of the requirements. This is a brand-new full-stack project. Let me write the comprehensive implementation plan.
I've completed the research phase. The project is a **brand-new full-stack web application** — no existing codebase. Below is my complete implementation plan, which I'll now write to the plan file.

---

## 📋 Plan: Ma Sói Web App

### Context
This is a greenfield real-time multiplayer web app supporting the social deduction game "Ma Sói" (Werewolf) for in-person play. Two distinct interfaces exist: a host (game master) dashboard on a tablet/laptop, and player phones accessed via QR code. Real-time sync is critical; no authentication or persistent storage is needed.

---

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast DX, strong typing, component model |
| Styling | Tailwind CSS | Mobile-first utilities, rapid UI |
| Backend | Node.js + Express + Socket.io | Reliable WebSocket with reconnection, rooms built-in |
| QR Code | `react-qr-code` (client-side) | Zero server overhead |
| State | In-memory (`Map<roomCode, Room>`) | No DB needed; rooms are ephemeral |
| Monorepo | pnpm workspaces | Shared types between client & server |

---

### Project Structure

```
masoi-app/
├── package.json                  # pnpm workspace root
├── packages/
│   ├── shared/                   # Shared TypeScript types
│   │   └── src/types/game.ts
│   ├── server/                   # Node.js + Socket.io backend
│   │   └── src/
│   │       ├── index.ts          # Express + Socket.io bootstrap
│   │       ├── roomManager.ts    # In-memory room store + cleanup
│   │       ├── gameEngine.ts     # Pure game logic functions
│   │       ├── socketHandlers.ts # All event handlers
│   │       └── types/
│   └── client/                   # React frontend
│       └── src/
│           ├── main.tsx
│           ├── App.tsx           # Router (React Router v6)
│           ├── socket.ts         # Socket.io client singleton
│           ├── pages/
│           │   ├── LandingPage.tsx
│           │   ├── HostPage.tsx
│           │   └── PlayerPage.tsx
│           ├── components/
│           │   ├── host/
│           │   │   ├── LobbyPanel.tsx    # QR, player list, role config
│           │   │   ├── RoleConfig.tsx    # Role count inputs + validation
│           │   │   ├── NightPanel.tsx    # Step-by-step night wizard
│           │   │   ├── DayPanel.tsx      # Announce results, alive list
│           │   │   ├── VotePanel.tsx     # Live vote tally
│           │   │   └── GameOverPanel.tsx # Winner + role reveal table
│           │   └── player/
│           │       ├── JoinForm.tsx
│           │       ├── LobbyWait.tsx
│           │       ├── RoleCard.tsx      # Tap to reveal role
│           │       ├── NightWait.tsx
│           │       ├── DayView.tsx
│           │       ├── VoteView.tsx      # Vote or spectate
│           │       └── GameOverView.tsx
│           └── hooks/
│               ├── useSocket.ts
│               └── useGameState.ts
```

---

### Data Models (`packages/shared/src/types/game.ts`)

```typescript
type RoleType = 'WOLF' | 'VILLAGER' | 'SEER' | 'DOCTOR' | 'WITCH' | 'HUNTER'
type GamePhase = 'LOBBY' | 'NIGHT' | 'DAY_ANNOUNCE' | 'DAY_DISCUSS' | 'VOTE' | 'GAME_OVER'
type NightStep = 'WOLF' | 'SEER' | 'DOCTOR' | 'WITCH'  // order of wake-up

interface Room {
  id: string            // 6-char alphanumeric code
  hostSocketId: string
  players: Player[]
  config: RoleConfig
  phase: GamePhase
  round: number
  nightSteps: NightStep[]    // computed from active roles
  currentStepIndex: number
  nightActions: NightActions
  voteSession?: VoteSession
  pendingDeaths: string[]    // computed but not yet announced
  lastActivity: Date
}

interface Player {
  id: string            // stable UUID
  socketId: string
  name: string
  role?: RoleType
  isAlive: boolean
}

interface RoleConfig {
  totalPlayers: number
  roles: Record<RoleType, number>
}

interface NightActions {
  wolfTarget?: string
  seerTarget?: string
  seerResult?: boolean
  doctorSave?: string
  witchSave?: string
  witchKill?: string
  witchSaveUsed: boolean  // per-game limit
  witchKillUsed: boolean
}

interface VoteSession {
  votes: Record<string, string>  // voterId → targetId
  isOpen: boolean
}
```

---

### Routes

| URL | Interface |
|---|---|
| `/` | Landing — create room OR enter room code to join |
| `/host/:roomCode` | Host dashboard |
| `/play/:roomCode` | Player interface (QR leads here) |

---

### Socket.io Event Protocol

**Client → Server:**
```
create_room                              → room_created
join_room { roomCode, playerName }       → room_state (to host), role_assigned (to player)
configure_roles { roles }                → room_state
start_game                              → game_started, role_assigned (per player)
advance_night_step                      → night_step
night_action { type, targetId, result } → night_action_recorded
announce_day_results                    → day_announced (broadcast)
start_vote                              → vote_started (broadcast)
cast_vote { targetId }                  → vote_updated (broadcast)
confirm_execution { targetId }          → execution_confirmed, [game_over]
mark_player_dead { playerId }           → room_state
hunter_shoot { targetId }              → hunter_result, [game_over]
new_game                                → room_state (LOBBY, reset)
```

**Server → Client:**
```
room_created { roomCode }
room_state { sanitizedRoom }            # host gets full info; players get filtered
role_assigned { role }                  # sent only to individual socket
game_started
night_step { step, index, total }
night_action_recorded
day_announced { killed: string[], saved: string[] }
vote_started { candidates: string[] }
vote_updated { tally: Record<string, number> }
execution_confirmed { executed: string }
game_over { winner, revealedPlayers }
error { message }
```

**Security:** Server never broadcasts role info globally. Each player's role is emitted only to their own socket. The `room_state` sent to players is sanitized (no roles, no night actions).

---

### Game Engine Logic (`server/src/gameEngine.ts`)

**Role Assignment:**
```
shuffle(rolePool) → assign to players in random order
```

**Night Step Order** (computed from `config.roles`):
```
activeRoles filter: [WOLF, SEER, DOCTOR, WITCH] (if count > 0)
```

**Night Resolution** (on `announce_day_results`):
```
wolfTarget alive? → candidate for death
doctorSave === wolfTarget? → saved
witchSave === wolfTarget? → saved (if save not used)
witchKill alive? → add to deaths (if kill not used)
→ pendingDeaths list
```

**Win Condition Check** (called after every death):
```
wolves_alive = players.filter(p => p.isAlive && p.role === 'WOLF').length
others_alive = players.filter(p => p.isAlive && p.role !== 'WOLF').length

if wolves_alive === 0 → VILLAGERS win
if wolves_alive >= others_alive → WOLVES win
```

**Hunter Trigger:** When Hunter is killed (night or execution), host gets a prompt to select Hunter's target → additional death → re-check win condition.

---

### Room Lifecycle & Cleanup

- Each room gets a `lastActivity` timestamp updated on every mutation.
- A periodic cleanup job (every 10 minutes via `setInterval`) removes rooms inactive for > 2 hours.
- On host disconnect: emit `host_disconnected` warning; room persists 5 min for reconnect.
- On player disconnect: mark as disconnected; game continues; player can rejoin by name.

---

### QR Code Flow

1. Host creates room → server returns `roomCode`.
2. Host page constructs URL: `https://{window.location.host}/play/{roomCode}`.
3. `react-qr-code` renders QR inline — no server call needed.
4. Players scan → land on `/play/:roomCode` → see name input form.

---

### UI/UX Notes

- **Host (desktop/tablet)**: Multi-step wizard UI. Night panel shows only the current role's action form (wizard steps). Day panel has a prominent "Công bố kết quả" button. Vote panel shows live bar chart of votes.
- **Player (mobile)**: Full-screen cards, large touch targets. Role card shows role name + icon + description. Night shows a dark "Đêm đang diễn ra…" screen. Dead players see a translucent "Spectator" overlay on vote screen — they can see vote counts but the vote form is disabled.
- Language: Vietnamese throughout the UI.

---

### Implementation Phases

| Phase | Scope |
|---|---|
| 1 | Project scaffold: pnpm monorepo, Vite+React client, Node+Express+Socket.io server, shared types |
| 2 | Room creation, join flow, QR code display, real-time player list in lobby |
| 3 | Role config UI + validation, start game, role assignment & role reveal |
| 4 | Night phase: step-by-step wizard, all 4 role action forms, night resolution logic |
| 5 | Day phase: announce results, alive/dead list, manual override |
| 6 | Vote phase: open vote, real-time tally, confirm execution, Hunter special case |
| 7 | Win condition detection, game-over screen with role reveal |
| 8 | Room cleanup, disconnect handling, new game flow |
| 9 | Polish: mobile responsiveness, Vietnamese copy, loading states, error handling |

---

### Key Files to Create

| File | Purpose |
|---|---|
| `packages/shared/src/types/game.ts` | All shared types |
| `packages/server/src/gameEngine.ts` | Pure game logic (assignment, resolution, win check) |
| `packages/server/src/roomManager.ts` | Room CRUD + cleanup scheduler |
| `packages/server/src/socketHandlers.ts` | All Socket.io event wiring |
| `packages/client/src/socket.ts` | Singleton Socket.io client |
| `packages/client/src/hooks/useGameState.ts` | React state from socket events |
| `packages/client/src/pages/HostPage.tsx` | Host phase router |
| `packages/client/src/pages/PlayerPage.tsx` | Player phase router |
| `packages/client/src/components/host/NightPanel.tsx` | Night wizard (most complex host component) |
| `packages/client/src/components/player/VoteView.tsx` | Vote or spectate based on alive status |

---

### Verification / Testing

1. **Unit tests** for `gameEngine.ts`: role assignment uniqueness, night resolution (wolf kill + doctor save interaction), win condition detection, witch one-use limits.
2. **Integration test**: Open 2 browser windows — one as host, one as player — verify real-time sync of player join, role reveal, night actions, vote tally.
3. **Acceptance criteria walk-through**:
   - Room creation + QR in < 1 min ✓
   - Simulate 10–15 player joins via multiple tabs, verify no duplicate roles ✓
   - Night action by host → verify player screens show nothing sensitive ✓
   - Open vote → all alive players can vote, dead player's vote button is disabled ✓
   - Eliminate all wolves → verify "Dân thắng" screen appears ✓

---

This is a complete greenfield implementation with no existing code to reuse. The plan above covers all requirements from the spec.

Sources:
- No external sources — plan based entirely on requirements document at `C:\Users\Public\Workspace\Untitled\.sdlc\requirements\REQ-1-ma-s-i-web-app-host-player-real-time-sup.md`
