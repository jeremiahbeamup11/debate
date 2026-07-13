-- M4: public recap. A finished game is the shareable artifact (PROJECT.md item 8),
-- the "explicitly marked public/shared" case anticipated in SECURITY.md §4.
-- These policies grant READ-ONLY access to COMPLETED rooms and their children,
-- to anon + authenticated. No write policies are added; the backend service role
-- remains the only writer. In-progress rooms stay members-only.

create function public.is_room_public(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from rooms where id = p_room_id and status = 'complete'
    );
$$;

-- Rooms: a completed room is publicly readable.
create policy "public read completed rooms"
    on public.rooms for select
    to anon, authenticated
    using (status = 'complete');

create policy "public read completed room players"
    on public.players for select
    to anon, authenticated
    using (public.is_room_public(room_id));

create policy "public read completed room turns"
    on public.turns for select
    to anon, authenticated
    using (public.is_room_public(room_id));

-- All votes are revealed once the game is complete.
create policy "public read completed room votes"
    on public.votes for select
    to anon, authenticated
    using (public.is_room_public(room_id));

create policy "public read completed room checks"
    on public.checks for select
    to anon, authenticated
    using (public.is_room_public(room_id));
