-- M1: rooms, players, topics.
-- RLS enabled on every table, default deny (SECURITY.md §4).
-- Clients are read-only; all writes go through the FastAPI service role.

create table public.rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null check (char_length(code) = 4),
    status text not null default 'lobby' check (status in ('lobby', 'active')),
    host_user_id uuid not null,
    topic_text text,
    created_at timestamptz not null default now()
);

-- Codes recycle: only one *open* lobby per code at a time.
create unique index rooms_open_code_idx on public.rooms (code) where status = 'lobby';

create table public.players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms (id) on delete cascade,
    auth_user_id uuid not null,
    display_name text not null check (char_length(display_name) between 1 and 24),
    role text check (role in ('debater_pro', 'debater_con', 'judge')),
    created_at timestamptz not null default now(),
    unique (room_id, auth_user_id)
);

create table public.topics (
    id bigint generated always as identity primary key,
    topic_text text not null
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.topics enable row level security;

-- security definer so the players policy can check membership without RLS recursion
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from players
        where room_id = p_room_id and auth_user_id = (select auth.uid())
    )
    or exists (
        select 1 from rooms
        where id = p_room_id and host_user_id = (select auth.uid())
    );
$$;

-- SELECT-only policies: participants (and the host screen) can read their room.
-- No INSERT/UPDATE/DELETE policies anywhere — clients can never write directly.
create policy "members read their room"
    on public.rooms for select
    to authenticated
    using (public.is_room_member(id));

create policy "members read room players"
    on public.players for select
    to authenticated
    using (public.is_room_member(room_id));

-- topics: no policies — service-role only.

-- Topic draw runs backend-side via service role; clients cannot execute it.
create function public.pick_random_topic()
returns table (topic_text text)
language sql
security definer
set search_path = public
as $$
    select topic_text from topics order by random() limit 1;
$$;

revoke execute on function public.pick_random_topic() from public, anon, authenticated;

-- Realtime: postgres_changes, RLS-authorized per subscriber (private per room).
alter table public.rooms replica identity full;
alter table public.players replica identity full;
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;

-- Starter topic pack (~40). Biased toward checkable factual topics — they
-- generate more fact-check cards and showcase TruthCore (PROJECT.md).
insert into public.topics (topic_text) values
    ('A hot dog is a sandwich'),
    ('Cereal is a soup'),
    ('A straw has one hole, not two'),
    ('Water is wet'),
    ('Pineapple belongs on pizza'),
    ('The best superhero movie is a Marvel movie'),
    ('Star Wars is better than Star Trek'),
    ('Video games are a better art form than film'),
    ('Streaming killed music quality'),
    ('The book is always better than the movie'),
    ('Remakes are ruining Hollywood'),
    ('Social media has made music worse'),
    ('Coffee is healthier than tea'),
    ('Breakfast is the most important meal of the day'),
    ('Organic food is worth the extra cost'),
    ('A vegetarian diet is better for the planet than eating meat'),
    ('Diet soda is worse for you than regular soda'),
    ('Cracking your knuckles causes arthritis'),
    ('Humans only use 10 percent of their brains'),
    ('Goldfish have three-second memories'),
    ('Lightning never strikes the same place twice'),
    ('Sugar makes kids hyperactive'),
    ('You need eight glasses of water a day'),
    ('Vitamin C prevents colds'),
    ('Napoleon was unusually short'),
    ('Vikings wore horned helmets'),
    ('The Great Wall of China is visible from space'),
    ('Einstein failed math in school'),
    ('Electric cars are worse for the environment than gas cars'),
    ('Nuclear power is the safest form of energy'),
    ('Space exploration is a waste of money'),
    ('Self-driving cars are already safer than human drivers'),
    ('Video games cause violent behavior'),
    ('Remote work makes people more productive'),
    ('College is no longer worth the cost'),
    ('Tipping should be abolished'),
    ('Daylight saving time should be permanent'),
    ('The five-second rule is real'),
    ('Cats are smarter than dogs'),
    ('Sharks are more dangerous to humans than vending machines');
