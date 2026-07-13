# CLAUDE.md — Operating instructions for this repo

You are building the MVP defined in PROJECT.md under the hard constraints of SECURITY.md. Read both fully before writing any code. Read STATE.md at the start of every session to know where we are; update it at the end of every work block.

## The loop

1. Read STATE.md → identify the current milestone and next action.
2. Work the milestone in small, verifiable increments. Prefer running/testing code over describing it.
3. When a milestone's "Done when" condition is met, demonstrate it (run the check, show the output), then update STATE.md and stop for review. Do NOT roll into the next milestone without an explicit go.
4. If blocked or if a PROJECT.md/SECURITY.md requirement seems infeasible, stop and surface it in STATE.md under BLOCKERS. Never silently descope, stub, or defer a SECURITY.md item.

## Hard rules

- SECURITY.md wins every conflict with convenience, speed, or feature scope.
- Milestones ship in order: M1 → M2 → M3 → M4. No parallel milestone work.
- Respect the PROJECT.md cut list absolutely. If a feature isn't in PROJECT.md, it doesn't exist. Do not add "nice to haves."
- Deadline pressure resolves toward cutting polish, never toward cutting security or the milestone Done conditions.
- The Wednesday target means: working and demonstrable beats elegant. Flag refactor debt in STATE.md instead of doing it.

## Repo layout

- `frontend/` — Next.js/TypeScript. Two route groups: main screen (room display) and phone controller. Deploys to Vercel with root dir `frontend/`.
- `backend/` — FastAPI. All Supabase service-role access and all Perplexity calls live here. Deploys to Render with root dir `backend/`.
- Supabase migrations/SQL live in `backend/supabase/` as versioned .sql files. RLS policies are part of the migration files, not applied by hand.

## Conventions

- Python: FastAPI + Pydantic v2, `extra="forbid"` on request models, type hints everywhere, ruff-clean.
- TypeScript: strict mode, no `any`, server/client component discipline (secrets and service calls never in client components).
- All branding strings (product name, TruthCore link URLs) in one config file per app.
- PostHog event names exactly as listed in PROJECT.md — no renaming, no extras without approval.
- Environment variables validated at startup (see SECURITY.md §1). Add every new var to `.env.example` in the same commit that introduces it.
- Commits: small, one concern each, imperative subject line, milestone tag prefix (e.g. `M2: enforce turn order server-side`).

## Testing bar (MVP-appropriate, not gold-plated)

- Backend: pytest for the security-critical paths only — turn-order enforcement, char caps, rate limits, idempotent fact-check trigger, injection handling in the judge prompt (assert a transcript containing "ignore previous instructions" doesn't alter the JSON schema/verdict shape).
- Frontend: no test suite for MVP; manual multi-tab verification per milestone Done conditions.
- Every milestone review includes running the SECURITY.md checks relevant to what was built.

## When uncertain

Choose the interpretation that is smaller in scope, safer per SECURITY.md, and faster to Wednesday — in that priority order. Note the assumption made in STATE.md.