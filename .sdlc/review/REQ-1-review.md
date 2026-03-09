# REQ-1: Ma Sói Web App — Host & Player Real-time Support — Review Output
**Phase:** review | **Generated:** 2026-03-09 UTC

---

## Overall Assessment

The three prior documents (requirements, research, architecture/plan) collectively define a well-scoped greenfield project. The core game logic, real-time communication protocol, data model, and security posture are sound. However, there are **several gaps, inconsistencies between documents, and unresolved edge cases** that must be addressed before implementation begins.

**Verdict: ⚠️ CONDITIONAL PASS** — Proceed to implementation after resolving the Critical and High-priority issues below.

---

## 1. Cross-Document Consistency Issues

### 1.1 Tech Stack Divergence (Research vs. Plan) — ✅ Resolved
- **Research** proposed pnpm monorepo (3 packages: shared, server, client).
- **Architecture/Plan** settled on a single Next.js 15 repo with a custom server.
- The **Plan** is the authoritative document and this is resolved. However, ensure the Plan is treated as the canonical source for all implementation — not Research.

### 1.2 `GamePhase` Type Inconsistency — ⚠️ MUST FIX
The three documents define `GamePhase` differently:

| Document | Phases |
|---|---|
| Research | `LOBBY \| NIGHT \| DAY_ANNOUNCE \| DAY_DISCUSS \| VOTE \| GAME_OVER` |
| Architecture | `lobby \| role-reveal \| night \| day \| voting \| ended` |
| Plan (data model) | `lobby \| night \| day \| voting \| ended` |

**Issue**: The Plan's data model drops `role-reveal`, but the Plan's own routing section for `/host/[roomCode]` references it as a distinct display state. The Architecture explicitly includes it to handle the transition from game start → night (the host sees the full assignment table before night begins).

**Recommendation**: Add `role-reveal` back to `GamePhase` in the canonical Plan data model:
```typescript
type GamePhase = 'lobby' | 'role-reveal' | 'night' | 'day' | 'voting' | 'ended'
```

### 1.3 `guardian` Role — ⚠️ MUST FIX
- **Architecture** includes `guardian` in `NIGHT_ORDER` and in the `Role` type.
- **Plan** drops `guardian` from the `Role` type (`'wolf' | 'villager' | 'seer' | 'doctor' | 'witch' | 'hunter'`).
- **Requirements** mention "Vệ binh" (Guardian) in the list of supported roles.

**Recommendation**: Add `'guardian'` back to the `Role` type and include it in the `NIGHT_ORDER` in the Plan.

---

## 2. Missing Requirements / Gaps

### 2.1 Inactivity Timeout Value — ⚠️ SHOULD FIX
Requirements state "Phòng tự động giải phóng sau một khoảng thời gian không hoạt động" but do not specify the duration. The Plan defaults to 2 hours. This should be confirmed and documented in the requirements as an explicit acceptance criterion.

**Recommendation**: Add to requirements: "Phòng tự động xóa sau 2 giờ không có hoạt động."

### 2.2 Localhost vs. LAN QR Code — ⚠️ MUST FIX (Deployment)
The Plan generates the QR code from `window.location.host`. During local development, this will be `localhost:3000`, which is unreachable from player phones on the same LAN.

**Recommendation**: Document that for local development/testing, the server must be run on the machine's LAN IP (e.g., `192.168.x.x:3000`), or a tunnel tool like `ngrok` / `localtunnel` should be used. Add an env var `NEXT_PUBLIC_BASE_URL` that overrides `window.location.host` for QR generation.

### 2.3 Host Reconnection — ⚠️ SHOULD FIX
The Plan mentions "host preserved 60s for reconnect" but the mechanism is incomplete. If the host's browser refreshes, a new `socket.id` is assigned. The Plan uses `socket.id === room.hostSocketId` as the sole authority check, so after reconnect the host would lose all privileges.

**Recommendation**: Assign a persistent `hostToken` (e.g., UUID stored in `sessionStorage`) when the host creates a room. Include this token in all host actions. The server validates token, not socket ID. Update `room.hostSocketId` on reconnect when token matches.

### 2.4 Player Reconnection — ⚠️ SHOULD FIX
The Plan states "player can rejoin by same name" but the implementation detail is missing from the socket event protocol. There is no `room:rejoin` event or token-based reattachment mechanism specified.

**Recommendation**: Add a `playerId` (stable UUID) stored in `sessionStorage` when a player first joins. Add a `room:rejoin { roomCode, playerId, playerName }` event that reattaches the existing `Player` record to the new socket.

### 2.5 Vote Tie-breaking — ⚠️ SHOULD FIX
Requirements do not specify what happens when the vote results in a tie (two players receive equal maximum votes). The host UI says "Quản trò xác nhận treo cổ" — but which player is presented for confirmation?

**Recommendation**: Document the tie-breaking rule. Options:
  1. **No execution on tie** — safe, common in Werewolf variants.
  2. **Host decides** — host selects from tied players.
  3. **Revote** — tied players face a second vote round.

### 2.6 Self-Vote Prevention — ⚠️ SHOULD FIX
Requirements do not explicitly forbid players from voting for themselves. This is likely unintended.

**Recommendation**: Add server-side validation: `vote:cast` rejects if `targetId === voterId`.

### 2.7 Witch One-Use Limits Display — ℹ️ MINOR
The Plan's `NightActions` correctly tracks `witchHealUsed` and `witchPoisonUsed` server-side. However, the host UI (`NightPhase.tsx`) must receive these flags to render the correct wizard step (e.g., disable the heal option if already used).

**Recommendation**: Include `witchHealUsed` and `witchPoisonUsed` in the `phase:night-step` payload for the Witch step, so the host UI can grey out unavailable actions.

### 2.8 Missing: Room Full Handling — ℹ️ MINOR
No behavior is specified when a player tries to join a room that has already reached `playerCount` (e.g., room is in `lobby` but at capacity, or room is past `lobby`).

**Recommendation**: Server should emit `room:error` with appropriate messages:
  - "Phòng đã đủ người" (room at capacity)
  - "Ván đã bắt đầu" (game in progress, can't join)

---

## 3. Security Review

### 3.1 Host Authentication via `socket.id` — ⚠️ MUST FIX
See §2.3 above. Using `socket.id` alone is fragile for reconnect scenarios. Addressed by introducing a `hostToken`.

### 3.2 Role Information Leakage — ✅ Correctly Handled
- `role:assigned` sent only to individual socket via `socket.to(player.socketId).emit()`.
- `room:state` broadcast is explicitly noted as sanitized (no roles in player copy).
- Night action data never emitted to room broadcast channel.
- Seer result only to host.
- Full reveal only on `game:ended`.

**Note**: Implementation must ensure the `host:full-state` event containing full player+role data is always sent only to `room.hostSocketId`, never to the room channel. This must be enforced in `socket-handlers.ts`.

### 3.3 Input Validation — ⚠️ SHOULD FIX
No input validation is mentioned for:
- `playerName`: length limit, XSS/injection (though React escapes by default, server should also validate)
- `RoleConfig`: sum must equal `playerCount` (noted as validated, ✅), but also each role count must be `>= 0` and of type `number`
- `targetId` in night actions and votes: must be a valid player ID in the room

**Recommendation**: Add explicit server-side validation for all incoming payloads. Consider using `zod` for schema validation on socket event payloads.

### 3.4 Rate Limiting / Abuse Prevention — ℹ️ LOW RISK
No rate limiting on `room:create` or `room:join`. For a small-scale app this is acceptable, but worth documenting as a known limitation.

---

## 4. Technical Architecture Concerns

### 4.1 `Map` Serialization — ⚠️ MUST FIX
`GameRoom.players` is typed as `Map<string, Player>`. `Map` objects are not JSON-serializable by default (`JSON.stringify(new Map())` → `{}`).

The `room:state` and `host:full-state` events emit player data — if the Map is serialized naively, players will be lost.

**Recommendation**: Either:
  1. Convert to array before emitting: `Array.from(room.players.values())`.
  2. Use a plain `Record<string, Player>` in `GameRoom` instead of `Map`.

Option 2 is simpler and avoids this class of bug throughout the codebase.

### 4.2 Race Conditions on In-Memory State — ℹ️ LOW RISK
Node.js is single-threaded, so most concurrent write scenarios are safe. However, rapid sequential events (e.g., 15 players joining simultaneously) could cause issues if handlers are `async` and await I/O between reads and writes to the room state.

**Recommendation**: Keep all room mutation operations synchronous (no async between read and write). If async operations are needed (e.g., external calls), use a per-room mutex.

### 4.3 Socket.io and Next.js 15 App Router — ℹ️ IMPORTANT NOTE
The custom server approach (`server.ts`) is incompatible with Next.js 15's default `next dev` and `next start` commands. The dev/start scripts in `package.json` must be customized:
```json
"dev": "ts-node server.ts",
"start": "NODE_ENV=production ts-node server.ts"
```
This is not documented in the Plan. Ensure the scaffold phase (Phase 1) includes correct `package.json` scripts.

### 4.4 Zustand Store Cleanup — ℹ️ MINOR
The Plan specifies subscribing to socket events in a `useEffect` inside `use-game-store.ts`. Socket listeners must be properly cleaned up on component unmount to avoid memory leaks and duplicate event handlers (especially problematic when navigating between pages in Next.js).

**Recommendation**: Explicitly document that all `socket.on(...)` calls must be paired with `socket.off(...)` in the `useEffect` cleanup function.

### 4.5 Night Phase — Wolf Multiple Targets — ✅ Correctly Scoped
The game is in-person; wolves coordinate verbally. The host enters a single victim. This is correct for the use case — no need for wolves to digitally coordinate.

---

## 5. Game Logic Review

### 5.1 Win Condition — ✅ Correct
```
aliveWolves === 0  → 'village' wins
aliveWolves >= aliveOthers → 'wolves' win
```
This matches standard Werewolf win conditions.

### 5.2 Night Resolution Order — ✅ Correct
Doctor save overrides wolf kill. Witch heal also overrides. Both protections apply independently. Witch poison is an additional death. Logic is sound.

### 5.3 Hunter Special Case — ⚠️ SHOULD CLARIFY
The Plan mentions Hunter in the game engine section but `hunter` is absent from `nightStepOrder`. This is correct — Hunter does not act at night proactively. Hunter fires only upon death (night or vote).

**Issue**: The `night:submit-action` event does not have a clear handler for the Hunter trigger scenario. The Plan describes "host gets a prompt to designate hunter's target" but there is no corresponding socket event in the protocol (`hunter:shoot` is mentioned in the Research doc but absent from the Plan's event table).

**Recommendation**: Add to socket event protocol:
- Client → Server: `hunter:shoot { targetId }` — Host only, triggered after hunter death confirmation
- Server → Client: `hunter:fired { killed: Player }` — All, before re-running win check

### 5.4 Role-Reveal Phase Logic — ℹ️ MINOR
Between `game:start` and the first night, players need to see their roles. The architecture's `role-reveal` phase addresses this — players see their role card, the host sees the full assignment table, and the host manually advances when ready.

The Plan's routing section describes this but the data model doesn't include the phase. After fixing §1.2, the transition should be:
```
lobby → role-reveal → night (round 1) → day → voting → night (round N) → ... → ended
```

### 5.5 Round Counter Usage — ℹ️ MINOR
`GameRoom.round` is defined but its usage is not specified in the Plan. It should increment each time the game transitions from `day` (or `voting`) back to `night`.

---

## 6. UX / Requirements Gaps

### 6.1 Role Configuration Saves Before Start — ✅ Handled
The Plan describes `room:configure` as a separate event from `game:start`. Host can configure, see the player list fill up, then start. This is correct.

### 6.2 Manual Dead Marking — ✅ Handled
`player:mark-dead` event is present in the protocol. Used when host needs to correct game state (e.g., player eliminated outside the normal flow).

### 6.3 Dead Player Spectator View — ✅ Handled
`VoteUI.tsx` renders spectator mode based on `isAlive`. Server-side guard on `vote:cast` prevents dead votes.

### 6.4 "Xem lại vai" (Re-check Role) — ⚠️ SHOULD CONFIRM
Requirements state: "có thể bấm để xem lại bất cứ lúc nào trong ván" (can tap to see role at any time during the game). `RoleCard.tsx` handles this — but the role data must remain available in the client store throughout the game, not just at the `role-reveal` moment.

**Recommendation**: When `role:assigned` is received, store it in Zustand/sessionStorage persistently so it survives phase changes and reconnects.

### 6.5 "Công bố kết quả" Flow — ✅ Handled
Host explicitly presses to announce night results (`day:announce`). Server resolves night actions into `pendingAnnouncements`, which are then broadcast to all players. This design correctly prevents accidental information leakage.

---

## 7. Missing from Plan

| Item | Priority | Action |
|---|---|---|
| `role-reveal` in `GamePhase` type | MUST FIX | Add to data model |
| `guardian` in `Role` type | MUST FIX | Add to Role type + NIGHT_ORDER |
| `hunter:shoot` socket event | MUST FIX | Add to event protocol table |
| `hostToken` for reconnect auth | MUST FIX | Add mechanism to Plan |
| `NEXT_PUBLIC_BASE_URL` env var for QR | MUST FIX | Add to scaffold setup |
| `Map` → `Record` or Array serialization | MUST FIX | Update data model |
| Tie-breaking rule for votes | SHOULD FIX | Add to requirements + server logic |
| Self-vote prevention | SHOULD FIX | Add server guard |
| `room:rejoin` event for players | SHOULD FIX | Add to event protocol |
| `witchHealUsed`/`witchPoisonUsed` in `phase:night-step` | SHOULD FIX | Add to payload |
| Room full / game started join rejection | MINOR | Add error handling |
| `package.json` dev/start scripts | IMPORTANT | Document in Phase 1 |
| Socket listener cleanup in `useEffect` | MINOR | Document in Phase 4 |
| Inactivity timeout value in requirements | MINOR | Confirm 2h, add to AC |

---

## 8. Acceptance Criteria — Coverage Check

| AC (from requirements) | Covered in Plan? | Notes |
|---|---|---|
| Tạo phòng, cấu hình vai, sinh QR < 1 phút | ✅ | Phases 1, 5, 6 |
| 10–15 người join không bị lỗi, không trùng vai | ✅ | Fisher-Yates + unit test |
| Hành động ban đêm không lộ info | ✅ | Socket security invariants |
| Vote real-time, người chết không vote | ✅ | `isAlive` guard |
| App phát hiện đúng điều kiện thắng | ✅ | `checkWin` unit test |

---

## 9. Recommended Pre-Implementation Actions

### Critical (block implementation)
1. **Resolve `GamePhase` type** — add `role-reveal` to Plan's data model.
2. **Add `guardian` to `Role` type** in Plan's data model and `NIGHT_ORDER`.
3. **Add `hunter:shoot` event** to the socket protocol table.
4. **Fix `Map` serialization** — use `Record<string, Player>` or document explicit `Array.from()` conversion on all emits.
5. **Add `hostToken` mechanism** for host reconnection (or accept the limitation and document it).
6. **Add `NEXT_PUBLIC_BASE_URL` env var** for QR code base URL.

### High Priority (address in Phase 1–3)
7. **Define vote tie-breaking rule** and implement it.
8. **Add self-vote server guard** in `vote:cast` handler.
9. **Add `room:join` guards** for room-full and game-in-progress.
10. **Add `playerId` + `room:rejoin` mechanism** for player reconnection.

### Medium Priority (address during implementation)
11. **Add `witchHealUsed`/`witchPoisonUsed`** to `phase:night-step` payload.
12. **Document `package.json` dev/start scripts** with `ts-node server.ts`.
13. **Document socket listener cleanup** pattern in `use-game-store.ts`.
14. **Store role in sessionStorage** to survive page refreshes.

---

## 10. Summary

The Ma Sói Web App is well-conceived with a clear problem domain, appropriate tech choices, and solid security thinking. The main risks are:
- **Document inconsistencies** (GamePhase, Role type, missing Guardian/Hunter events) that will cause implementation confusion.
- **Reconnection handling** being underspecified — critical for a real session where phones lock/sleep.
- **Map serialization** being a silent bug waiting to happen.
- **QR code URL** not working in local dev/LAN environments without configuration.

After resolving the 6 critical items above, the project is ready for implementation following the 12-phase plan.
