-- M5: permanent, immutable per-game recaps.
-- A room now hosts MANY games. Each game has its own UUID (the recap URL) and
-- holds all per-game state; its turns/votes/checks are never deleted. "Play
-- again" creates a new game rather than clearing the old game's rows, so every
-- completed game's recap stays intact forever.
--
-- Data model:
--   rooms       — identity + lobby only (code, host, status, current_game_id)
--   players     — room membership (stable identity across games)
--   games       — one debate playthrough; owns status/topic/round/turn/deadline
--   game_players— per-game role assignment (reshuffled each game)
--   turns/votes/checks — keyed by game_id (room_id kept ONLY as a realtime filter)
--
-- All existing turns/votes/checks are disposable test data and are dropped.

-- ---- tear down policies/functions that reference columns we are changing ----
drop policy if exists "public read completed rooms" on public.rooms;
drop policy if exists "public read completed room players" on public.players;

drop table if exists public.checks cascade;
drop table if exists public.votes cascade;
drop table if exists public.turns cascade;

drop function if exists public.is_round_revealed(uuid, int);
drop function if exists public.is_room_public(uuid);

-- ---- rooms: strip per-game state, add pointer to the active game ----
-- Drop the old check before rewriting values, then re-add the narrowed one.
alter table public.rooms drop constraint rooms_status_check;
update public.rooms set status = 'active' where status <> 'lobby';
alter table public.rooms add constraint rooms_status_check
    check (status in ('lobby', 'active'));
alter table public.rooms
    drop column current_round,
    drop column current_turn,
    drop column phase_deadline,
    drop column reroll_used,
    drop column topic_text,
    add column current_game_id uuid;

-- ---- players: role is per-game now ----
alter table public.players drop column role;

-- ---- games ----
create table public.games (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms (id) on delete cascade,
    game_number int not null,
    status text not null default 'debating'
        check (status in ('debating', 'voting', 'complete')),
    topic_text text,
    current_round int not null default 1 check (current_round between 1 and 3),
    current_turn text check (current_turn in ('pro', 'con')),
    phase_deadline timestamptz,
    reroll_used boolean not null default false,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    unique (room_id, game_number)
);

alter table public.rooms
    add constraint rooms_current_game_fk
    foreign key (current_game_id) references public.games (id) on delete set null;

-- ---- game_players (per-game roles) ----
create table public.game_players (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.games (id) on delete cascade,
    player_id uuid not null references public.players (id) on delete cascade,
    role text not null check (role in ('debater_pro', 'debater_con', 'judge')),
    unique (game_id, player_id)
);

-- ---- turns / votes / checks, keyed by game_id ----
create table public.turns (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.games (id) on delete cascade,
    room_id uuid not null references public.rooms (id) on delete cascade,
    player_id uuid not null references public.players (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    side text not null check (side in ('pro', 'con')),
    content text not null check (char_length(content) between 1 and 500),
    created_at timestamptz not null default now(),
    unique (game_id, round_number, side)
);

create table public.votes (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.games (id) on delete cascade,
    room_id uuid not null references public.rooms (id) on delete cascade,
    judge_player_id uuid not null references public.players (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    vote text not null check (vote in ('pro', 'con')),
    created_at timestamptz not null default now(),
    unique (game_id, round_number, judge_player_id)
);

create table public.checks (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.games (id) on delete cascade,
    room_id uuid not null references public.rooms (id) on delete cascade,
    round_number int not null check (round_number between 1 and 3),
    judge_player_id uuid not null references public.players (id) on delete cascade,
    claim text not null check (char_length(claim) between 1 and 200),
    status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
    verdict text check (verdict in ('True', 'False', 'Misleading', 'Unverifiable')),
    explanation text,
    source_url text,
    created_at timestamptz not null default now(),
    unique (game_id, round_number, judge_player_id)
);

-- ---- helpers ----
create function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select public.is_room_member((select room_id from games where id = p_game_id));
$$;

create function public.is_game_public(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (select 1 from games where id = p_game_id and status = 'complete');
$$;

-- Votes stay hidden until their round closes (or the game completes).
create function public.is_game_round_revealed(p_game_id uuid, p_round int)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from games
        where id = p_game_id
          and (current_round > p_round or status = 'complete')
    );
$$;

-- ---- RLS ----
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.turns enable row level security;
alter table public.votes enable row level security;
alter table public.checks enable row level security;

-- games: members read any of their room's games; anyone reads completed games.
create policy "members read room games"
    on public.games for select to authenticated
    using (public.is_room_member(room_id));
create policy "public read completed games"
    on public.games for select to anon, authenticated
    using (status = 'complete');

create policy "members read game roles"
    on public.game_players for select to authenticated
    using (public.is_game_member(game_id));
create policy "public read completed game roles"
    on public.game_players for select to anon, authenticated
    using (public.is_game_public(game_id));

create policy "members read game turns"
    on public.turns for select to authenticated
    using (public.is_game_member(game_id));
create policy "public read completed game turns"
    on public.turns for select to anon, authenticated
    using (public.is_game_public(game_id));

create policy "members read revealed game votes"
    on public.votes for select to authenticated
    using (public.is_game_member(game_id)
           and public.is_game_round_revealed(game_id, round_number));
create policy "public read completed game votes"
    on public.votes for select to anon, authenticated
    using (public.is_game_public(game_id));

create policy "members read game checks"
    on public.checks for select to authenticated
    using (public.is_game_member(game_id));
create policy "public read completed game checks"
    on public.checks for select to anon, authenticated
    using (public.is_game_public(game_id));

-- players: recap needs display names of anyone who played in a completed game.
create policy "public read players in completed games"
    on public.players for select to anon, authenticated
    using (
        exists (
            select 1 from game_players gp
            join games g on g.id = gp.game_id
            where gp.player_id = players.id and g.status = 'complete'
        )
    );

-- ---- realtime ----
alter table public.games replica identity full;
alter table public.game_players replica identity full;
alter table public.turns replica identity full;
alter table public.votes replica identity full;
alter table public.checks replica identity full;
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.turns;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.checks;
