# STATE.md

## Current position
Project initialized. PROJECT.md, SECURITY.md, CLAUDE.md in place. No code yet.

## Current milestone
M1 — Rooms & realtime skeleton (not started)

## Next action
1. Scaffold repo layout: `frontend/` (Next.js + TS, strict) and `backend/` (FastAPI + Pydantic v2), each with startup env validation and `.env.example`.
2. Create Supabase project (NEW project — not TruthCore's) and write initial migration: `rooms`, `players` tables with RLS enabled + default deny, policies per SECURITY.md §4.
3. Room create/join flow: host creates room on Main Screen → 4-letter code; players join on phone view; lobby renders live via Supabase Realtime private channel.
4. Host "start game" → backend randomly assigns 2 debaters + topic + sides, pushes roles to phones.
5. Verify M1 Done condition: 4 browser tabs can lobby and receive roles. Demonstrate, then stop for review.

## Blockers
None.

## Assumptions made
None yet.

## Deferred / debt
- Stripe-style env hard-fail pattern is required from commit one (SECURITY.md §1) — no deferral permitted on this item.

## Milestone log
- (empty)