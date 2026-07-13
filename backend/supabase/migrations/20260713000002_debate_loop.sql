-- M2: debate loop — turns, votes, richer room state machine.
-- Backend remains the sole writer; clients read under RLS (SECURITY.md §4, §6).

-- Room state machine: lobby → debating ⇄ voting → complete (server-enforced).
alter table public.rooms drop constraint rooms_status_check;
update public.rooms set status = 'complete' where status = 'active';
alter table public.rooms add constraint rooms_status_check
    check (status in ('lobby', 'debating', 'voting', 'complete'));

alter table public.rooms
    add column current_round int not null default 0 check (current_round between 0 and 3),
    add column current_turn text check (current_turn in ('pro', 'con')),
    add column phase_deadline timestamptz,
    add column reroll_used boolean not null default false;

create table public.turns (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms (id) on delete cascade,
    player_id uuid not null references public.players (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    side text not null check (side in ('pro', 'con')),
    content text not null check (char_length(content) between 1 and 500),
    created_at timestamptz not null default now(),
    -- one statement per side per round, enforced at the DB even under races
    unique (room_id, round_number, side)
);

create table public.votes (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms (id) on delete cascade,
    judge_player_id uuid not null references public.players (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    vote text not null check (vote in ('pro', 'con')),
    created_at timestamptz not null default now(),
    unique (room_id, round_number, judge_player_id)
);

alter table public.turns enable row level security;
alter table public.votes enable row level security;

create policy "members read room turns"
    on public.turns for select
    to authenticated
    using (public.is_room_member(room_id));

-- Votes are hidden until the round closes: readable only once the room has
-- moved past that round (or the game is complete).
create function public.is_round_revealed(p_room_id uuid, p_round int)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from rooms
        where id = p_room_id
          and (current_round > p_round or status = 'complete')
    );
$$;

create policy "members read revealed votes"
    on public.votes for select
    to authenticated
    using (
        public.is_room_member(room_id)
        and public.is_round_revealed(room_id, round_number)
    );

alter table public.turns replica identity full;
alter table public.votes replica identity full;
alter publication supabase_realtime add table public.turns;
alter publication supabase_realtime add table public.votes;
