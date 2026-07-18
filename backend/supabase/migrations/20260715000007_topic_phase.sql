-- Launch polish: topic-reveal phase + host custom topics.
-- Games now open in a 'topic' status (1m45s reveal window) before 'debating';
-- the host may set a custom topic during it. topic_text gets a DB-level length
-- cap since it is now user input (SECURITY.md §5). Additive: old rows/statuses
-- remain valid, so this can apply before the new backend deploys.

alter table public.games drop constraint games_status_check;
alter table public.games add constraint games_status_check
    check (status in ('topic', 'debating', 'voting', 'complete'));

alter table public.games add constraint games_topic_text_len
    check (topic_text is null or char_length(topic_text) between 1 and 200);
