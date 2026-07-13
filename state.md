# STATE.md

## Current position
M1 complete, awaiting review. Full stack scaffolded and live-demonstrated: FastAPI backend (localhost:8000), Next.js frontend (localhost:3001), hosted Supabase project `debate-night` (ref `asltlpcwarasoinjjngd`, org "Mays OS", us-east-1) with the initial RLS migration applied and anonymous sign-in enabled via `supabase config push`.

## Current milestone
M1 — Rooms & realtime skeleton: **DONE, pending review. Do not start M2 without explicit go.**

M1 Done condition demonstrated (2026-07-13): 4 browser tabs — 1 Main Screen + 3 phones (Alice, Bob, Carol) — created room FJGQ, lobbied live via RLS-scoped Supabase Realtime, host started game, server assigned topic ("Napoleon was unusually short") + debaters + sides; each phone received its role (Bob PRO, Carol CON, Alice judge).

Security checks run and passing (9/9): stranger JWT cannot INSERT players / UPDATE rooms / SELECT other rooms' players / SELECT topics; unauthenticated create → 401; non-host start → 403; oversized name → 422; extra field → 422; create-room rate limit → 429 after 5/hour. Plus: app refuses to boot with missing env vars (exit 1, clear message); real key values appear nowhere in tracked files. Backend pytest 13/13, ruff clean; frontend tsc + eslint clean.

## Next action
M2 — Debate loop (after review sign-off):
1. Migration: `turns` (room_id, player_id, round_number, content ≤500 chars, created_at) and `votes` tables, RLS select-for-members only, writes via service role.
2. Backend: submit-turn endpoint — server-enforced turn order + round count + 500-char cap + 60s timer expiry (server-side timestamps), profanity filter on turns before broadcast (§8); vote endpoint with hidden-until-all-vote-or-20s reveal; 3-round flow → winner. pytest for turn-order, char cap, round cap.
3. Host topic re-roll (once per game) — deferred from M1, belongs to game-start flow.
4. Frontend: debater turn input with timer, turns rendering on Main Screen, judge voting UI, winner screen.
5. Verify M2 Done: full game start-to-finish with multiple tabs.

## Blockers
None.

## Assumptions made (M1)
- **Host = the Main Screen session** and is not a player; min 3 players counts phones only. Smaller scope; host can also join from a phone if they want to play.
- **Max 8 players enforced server-side** (PROJECT.md "designed for 4–8"); joins beyond 8 → 409.
- **PostHog key treated as optional public config**, not a secret: if `NEXT_PUBLIC_POSTHOG_KEY` is unset, analytics is disabled with a loud console warning instead of blocking boot (SECURITY.md §1 hard-fail governs secrets). Events `room_created`/`player_joined`/`game_started` are wired. Add a real key to `frontend/.env.local` to activate.
- **Display names also pass the §8 wordlist filter** (the section formally covers turns, but names broadcast to the shared screen).
- **Frontend dev runs on port 3001** — port 3000 on this machine is occupied by another Next.js project. Backend CORS (`FRONTEND_ORIGIN` in `backend/.env`) points at 3001 locally.
- Room codes are recycled: uniqueness enforced only among rooms with status `lobby` (partial unique index).

## Deferred / debt
- CSP allows `'unsafe-inline'`/`'unsafe-eval'` scripts (Next.js hydration + dev). Tighten (nonce-based) at M4 alongside the §10 checklist; `frame-ancestors 'none'`, nosniff, X-Frame-Options DENY already set.
- slowapi rate-limit state is in-memory — resets on restart, per-instance only. Acceptable for single Render instance MVP; revisit if scaled.
- Supabase CLI locally is v2.90.0 (v2.109.1 available) — works fine, update when convenient.
- Realtime updates refetch room+players on every change event (simple, correct under RLS). Optimize only if lobby feels sluggish with 8 players.

## Credentials / infra notes (no secret values in this file)
- `backend/.env` holds SUPABASE_URL + service-role key + a commented copy of the DB password (all gitignored). `frontend/.env.local` holds the anon key. Rotate/reset any of these from the Supabase dashboard if ever exposed.
- Supabase migrations apply via `supabase db push` from `backend/` (needs `SUPABASE_DB_PASSWORD` env or the commented password).

## Milestone log
- 2026-07-13 — M1 complete: rooms/join/start API with env hard-fail + rate limits, RLS default-deny migration (rooms/players/topics + 40 seeded topics), realtime lobby, role push to phones. Demonstrated with 4 tabs; 9/9 security spot checks passed.
