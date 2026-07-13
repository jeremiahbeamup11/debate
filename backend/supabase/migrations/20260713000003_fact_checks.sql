-- M3: judge-triggered TruthCore fact-checks.
-- Judges request a check on a specific typed claim; the backend calls Perplexity
-- and writes a verdict card. Clients read under RLS; backend is the sole writer
-- (SECURITY.md §2, §3, §4).

create table public.checks (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    judge_player_id uuid not null references public.players (id) on delete cascade,
    -- Claim as typed by the judge (200-char cap, §2 untrusted input).
    claim text not null check (char_length(claim) between 1 and 200),
    status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
    verdict text check (verdict in ('True', 'False', 'Misleading', 'Unverifiable')),
    explanation text,
    source_url text,
    created_at timestamptz not null default now(),
    -- One check per judge per round (server also enforces the 3/round cap).
    unique (room_id, round_number, judge_player_id)
);

-- Global LLM-call ledger for the daily spend circuit breaker (§3). One row per
-- attempted Perplexity call; the breaker counts rows created today.
create table public.llm_calls (
    id uuid primary key default gen_random_uuid(),
    kind text not null,
    created_at timestamptz not null default now()
);

create index llm_calls_created_at_idx on public.llm_calls (created_at);

alter table public.checks enable row level security;
alter table public.llm_calls enable row level security;

-- Members can read checks/cards for their room. No client write policies.
create policy "members read room checks"
    on public.checks for select
    to authenticated
    using (public.is_room_member(room_id));

-- llm_calls: no policies — service-role only, never client-visible.

alter table public.checks replica identity full;
alter publication supabase_realtime add table public.checks;
