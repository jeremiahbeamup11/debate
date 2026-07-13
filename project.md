# PROJECT.md — TruthCore Debate Game (MVP)

**One-liner:** A party game for friends. Two get randomly picked to debate a topic; everyone else judges each round. TruthCore drops fact-check cards live when a debater says something false. Verdict at the end, shareable recap.

**Strategic purpose:** Distribution channel for TruthCore. Every fact-check card is TruthCore-branded and links out. The game must be fun standalone, but the tether to TruthCore is non-negotiable.

**Deadline:** Playable end-to-end by Wednesday night so it enters this week's distribution push. Cut features, not the deadline.

**Constraint:** SECURITY.md in this repo is a hard constraint on all milestones. The Definition of Done checklist there gates the final milestone.

---

## Stack

- Frontend: Next.js / TypeScript on Vercel (two views: **Main Screen** and **Phone Controller**)
- Backend: FastAPI on Render
- DB + Realtime: Supabase (rooms, players, turns, votes, cards) — use Supabase Realtime for live sync, no custom WebSocket server
- Fact-checking: Perplexity API (sonar) via backend, reusing TruthCore's claim-check prompt patterns
- Analytics: PostHog (event names below; full funnel design deferred, but emit these from day one)

## Game flow (MVP)

1. **Host creates a room** on the Main Screen → gets a 4-letter room code. Main Screen is meant for a laptop/TV; works fine as just another browser tab for remote groups.
2. **Players join** on phones via code + display name. Min 3 players (1v1 + 1 judge), designed for 4–8.
3. **Host starts game.** Server randomly picks 2 debaters and assigns a topic + sides (you don't choose your position). Everyone else is a judge.
4. **Debate:** 3 rounds. Each round = one typed statement per debater, 60-second timer, 500-char cap. Turns appear on the Main Screen as they're submitted.
5. **Fact-check cards:** after each turn is submitted, backend extracts checkable factual claims (if any) and runs them through Perplexity. Cards land on the Main Screen with verdict (True / False / Misleading / Unverifiable), a one-line explanation, and TruthCore branding + link. Cards may land during the opponent's turn — that's fine, it's good theater. Opinion-only turns produce no card; never force one.
6. **Judging:** after each round, judges vote on phones for who won the round. Simple majority; ties carry to final scoring. Votes are hidden until all judges vote or 20s expires, then revealed on Main Screen.
7. **Verdict:** best of 3 rounds wins. Final screen shows winner, round-by-round votes, and all fact-check cards. "Play again" reshuffles debaters from the same room.
8. **Recap page:** every finished game gets a public recap page at an unguessable UUID URL — topic, transcript, cards, votes. This is the shareable artifact. TruthCore branding and link prominent.

## Topics

- Ship with one hardcoded starter pack (~40 topics) in the DB: mix of dumb ("hot dogs are sandwiches"), pop-culture, and mildly spicy factual ones (factual topics generate more cards — bias toward those, they showcase TruthCore).
- No user-submitted topics in MVP (moderation surface). Random draw, host can re-roll once per game.

## Milestones

**M1 — Rooms & realtime skeleton.** Create room, join via code, lobby shows players on Main Screen live, host starts game, server picks debaters + topic + sides, roles pushed to phones. No debate yet. *Done when 4 browser tabs can lobby and get roles.*

**M2 — Debate loop.** Turn submission with server-enforced turn order, timer, char cap; turns render on Main Screen; round voting from judge phones with hidden-then-reveal; 3-round flow to a winner screen. No fact-checking yet. *Done when a full game plays start-to-finish with fake friends (multiple tabs).*

**M3 — TruthCore cards.** Claim extraction + Perplexity check pipeline (backend only, injection-hardened per SECURITY.md §2), card rendering on Main Screen, cards attached to the correct turn. Idempotent: one check per turn max. *Done when a turn containing "the Great Wall is visible from space" produces a False card and an opinion turn produces nothing.*

**M4 — Recap page + polish + security gate.** Public recap page at UUID URL with PostHog events wired; empty/edge states (player disconnects, judge doesn't vote → their vote is skipped); run the full SECURITY.md Definition of Done checklist. *Done when checklist passes and a recap link works in an incognito window.*

Stop after M4. Everything else is post-MVP.

## PostHog events (emit now, analyze Monday)

`room_created`, `player_joined`, `game_started`, `turn_submitted`, `card_shown` (with verdict type), `card_clicked` (→ TruthCore link), `game_completed`, `recap_viewed`, `recap_shared_click`

## Explicit cut list (do not build these)

- Voice/video, AssemblyAI transcription (fast-follow)
- Accounts, profiles, ELO, leaderboards
- User-submitted topics, topic packs, payments
- Stranger matchmaking of any kind
- AI judging of who won (humans vote; AI only fact-checks)
- Native apps — mobile web only
- Moderation tooling beyond SECURITY.md §8 minimums (friends-only product, unlisted)

## Cost guardrails

Per SECURITY.md §3: room creation rate-limited hard (this is the new main abuse vector), one fact-check per turn (idempotency key on turn ID), ~6 turns/game max → worst case a handful of sonar calls per game. Daily global circuit breaker stays on.

## Naming

Working title only — call it "Debate Night powered by TruthCore" in UI copy for now. Final name is a Monday decision; keep branding strings in one config file so renaming is a one-line change.