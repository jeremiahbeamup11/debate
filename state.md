# STATE.md

## Current position
M2 complete, awaiting review. Full debate loop live end-to-end: turn submission with server-enforced order/caps/timers, judge voting with hidden-then-reveal, 3-round flow to a winner screen. Stack: FastAPI backend (localhost:8000), Next.js frontend (localhost:3001), hosted Supabase project `debate-night` (ref `asltlpcwarasoinjjngd`, org "Mays OS", us-east-1) with migrations 0001+0002 applied.

## Current milestone
M3 — TruthCore cards (in progress). M2 **reviewed and approved 2026-07-13** (human QA: full game with real players, smooth throughout). M1 approved 2026-07-13.

M2 Done condition demonstrated (2026-07-13): full game start-to-finish with 4 tabs (Main Screen + Alice/Bob/Carol). Room NJFH, topic "Lightning never strikes the same place twice" (server-drawn), Bob PRO vs Alice CON, Carol judge. Round 1 both turns typed → Carol voted CON → reveal "PRO 0 — 1 CON"; Round 2 both turns → vote PRO → reveal; Round 3 exercised the timeout paths live: CON turn expired → advance driver skipped it server-side, vote window expired unvoted → round closed as tie → game complete. Winner screen shows "It's a tie!", round-by-round votes, full transcript; all 4 tabs converged. Topic re-roll (once per game) also demonstrated live in an earlier run.

M2 security verification: backend pytest 34/34 (21 new: turn order, out-of-turn 409, judge-can't-debate 403, deadline+grace expiry, 3-round cap, advance-refused-before-deadline, vote gating, 500-char cap, extra-field rejection), ruff clean, frontend tsc+eslint clean. Live checks: stranger turn submit → 403; oversized turn (600 chars) → 422. Turn/vote idempotency backed by DB unique indexes; room state writes are compare-and-swap. Turn author/vote author come only from the JWT. Profanity wordlist runs on turns before insert (§8). Votes RLS-hidden until their round closes (`is_round_revealed`).

## Next action
M3 — TruthCore cards (after review sign-off):
1. Migration: `cards` table (turn_id FK, verdict enum True/False/Misleading/Unverifiable, explanation, RLS select-for-members), plus `llm_calls` (or counter table) for the daily global circuit breaker (§3).
2. Backend: claim extraction + Perplexity sonar check pipeline — backend only, `PERPLEXITY_API_KEY` env (add to `.env.example` same commit), injection-hardened per §2: transcript inside `<debate_transcript>` delimiters, never in system prompt, strict JSON schema validated with Pydantic, retry once then fail gracefully. Idempotent: one check per turn max (idempotency key on turn id). Opinion-only turns produce no card.
3. Trigger after turn submit (fire-and-forget from the turn endpoint or background task); cards land on Main Screen via realtime, attached to the correct turn.
4. PostHog: `card_shown` (with verdict type), `card_clicked` (→ TruthCore link).
5. pytest: injection attempt ("ignore previous instructions...") doesn't alter schema/verdict shape; duplicate check requests don't trigger a second LLM call; circuit breaker trips at ceiling.
6. Verify M3 Done: "the Great Wall is visible from space" turn → False card; opinion turn → nothing.

## Blockers
None. (M3 will need a `PERPLEXITY_API_KEY` — not yet provided; backend will hard-fail at boot once the var becomes required, so it must be set before M3 testing.)

## Assumptions made
M2:
- **Turn order is PRO-first every round** (fixed, not alternating) — simplest server-enforced order.
- **A skipped turn leaves a gap** (no placeholder row); the round still goes to voting after both slots pass. PROJECT.md's disconnect/no-vote edge polish remains M4.
- **Round winners are computed from revealed votes** (deterministic majority rule, same code path everywhere); no separate server-written `round_winner` column for MVP. Server remains source of truth for state/rounds/votes themselves.
- **Re-roll window** = round 1, before any turn is submitted, once per game, host only.
- **"Play again" (reshuffle same room) deferred to M4 polish** — it's game-flow item 7, not part of the M2 Done condition.
- **Advance is member-poked, server-decided**: any room member may POST /advance; the server only acts if its own clock says the deadline passed. Main Screen runs the poke loop.

M1 (carried):
- Host = the Main Screen session, not a player; min 3 players counts phones.
- Max 8 players server-side; joins beyond → 409.
- PostHog key optional public config (loud console warning when unset); events wired: room_created, player_joined, game_started, turn_submitted, game_completed.
- Display names pass the §8 wordlist too.
- Frontend dev on port 3001 (3000 occupied by another project on this machine); backend CORS follows via `FRONTEND_ORIGIN`.
- Room codes recycle (unique only among status='lobby').

## Deferred / debt
- **Re-roll doesn't reset the 60s turn deadline** — PRO keeps whatever time was left. Cheap fix; fold into M4 polish (or M3 if touching the endpoint anyway).
- Realtime channels can drop silently; mitigated with a 10s poll + focus refetch in `useRoom` (verified live). Proper channel-status reconnect handling = M4 polish.
- CSP allows `'unsafe-inline'`/`'unsafe-eval'` scripts (Next.js hydration + dev). Tighten (nonce-based) at M4 with the §10 checklist.
- slowapi rate-limit state is in-memory — per-instance, resets on restart. Fine for single Render instance MVP.
- Supabase CLI locally is v2.90.0 (v2.109.1 available).
- Refetch-everything-on-any-event realtime strategy — simple and correct; optimize only if sluggish.

## Credentials / infra notes (no secret values in this file)
- `backend/.env` holds SUPABASE_URL + service-role key + a commented copy of the DB password (all gitignored). `frontend/.env.local` holds the anon key. Rotate/reset from the Supabase dashboard if ever exposed.
- Migrations apply via `supabase db push` from `backend/` (needs `SUPABASE_DB_PASSWORD` env or the commented password).

## Milestone log
- 2026-07-13 — M1 complete: rooms/join/start API with env hard-fail + rate limits, RLS default-deny migration (rooms/players/topics + 40 seeded topics), realtime lobby, role push to phones. Demonstrated with 4 tabs; 9/9 security spot checks passed. **Reviewed & approved 2026-07-13.**
- 2026-07-13 — M2 complete: debate loop — turns/votes tables (RLS, unique-index idempotency, votes hidden until reveal), pure server state machine (PRO→CON→voting×3, 60s/20s deadlines, member-poked advance), turn composer + judge voting + winner screen, topic re-roll, realtime with poll fallback. Full game demonstrated across 4 tabs incl. timeout/skip paths; pytest 34/34.
