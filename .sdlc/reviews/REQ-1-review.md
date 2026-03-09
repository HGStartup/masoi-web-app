# REQ-1: Ma Sói Web App — Host & Player Real-time Support — review output
**Phase:** review | **Generated:** 2026-03-08 18:08 UTC

---

## Review Phase Complete — REQ-1: Ma Sói Web App

Review output saved to `.sdlc/review/REQ-1-review.md`.

**Verdict: ⚠️ CONDITIONAL PASS** — The foundation is solid, but 6 critical issues must be resolved before implementation begins.

---

### 🔴 Critical (block implementation)

| # | Issue | Fix |
|---|---|---|
| 1 | **`GamePhase` inconsistency** — `role-reveal` exists in routing section but missing from Plan's type definition | Add `'role-reveal'` to `GamePhase` in `src/types/game.ts` |
| 2 | **`guardian` role dropped** — Requirements mention "Vệ binh", Architecture includes it in NIGHT_ORDER, but Plan's `Role` type omits it | Add `'guardian'` to `Role` type and `nightStepOrder` |
| 3 | **`hunter:shoot` event missing** — Plan mentions Hunter special case in game engine but has no corresponding socket event in protocol | Add `hunter:shoot { targetId }` (C→S) and `hunter:fired { killed }` (S→C) |
| 4 | **`Map` serialization bug** — `GameRoom.players` uses `Map<string, Player>`, which serializes to `{}` under `JSON.stringify` — players will silently vanish on emit | Change to `Record<string, Player>` or explicitly convert with `Array.from()` before every emit |
| 5 | **Host reconnection breaks auth** — `socket.id === room.hostSocketId` check fails after browser refresh; host loses all privileges | Introduce a persistent `hostToken` (UUID in `sessionStorage`) validated server-side |
| 6 | **QR code URL broken on LAN** — `window.location.host` gives `localhost:3000`, unreachable from player phones | Add `NEXT_PUBLIC_BASE_URL` env var to override base URL for QR generation |

---

### 🟡 High Priority (address in Phase 1–3)

- **Vote tie-breaking**: No rule defined — two equal-vote players → what happens? (Recommend: no execution on tie, or host decides)
- **Self-vote prevention**: Server needs to reject `vote:cast` where `targetId === voterId`
- **Room-full / game-in-progress guards**: `room:join` should emit `room:error` with a clear message
- **Player reconnection**: Need `playerId` in `sessionStorage` + a `room:rejoin` socket event to reattach after phone sleep/disconnect

### 🟢 What's Already Well-Designed

- ✅ Security posture is excellent — private role delivery, host-only action guards, dead-player vote guard, no night data in broadcasts
- ✅ Night resolution logic (wolf kill + doctor save + witch interactions) is correctly modeled
- ✅ Win condition formula is correct (`wolves === 0` → village; `wolves >= others` → wolves)
- ✅ Tech stack choices are appropriate (Next.js custom server on Railway/Render, not Vercel; Socket.io for rooms; in-memory state; Zustand client store)
- ✅ All 5 Acceptance Criteria are covered by the implementation plan
- ✅ Fisher-Yates shuffle + unit tests address the "no duplicate roles" AC
