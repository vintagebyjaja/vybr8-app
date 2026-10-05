-- VYBR8 · UPDATE: run this ONCE after file 26. Rate a dish again on every visit (one rating per dish per day); every rating counts.

-- ═════ 20261018200100_repeat_item_ratings.sql ═════
-- VYBR8 · Rate a dish again on every visit
--
-- People can rate the same dish or drink once per day (each visit), and every rating counts toward the
-- dish's score and the charts. Rating it again the same day just updates that day's score.
-- The day is the VYBR8 day (Eastern time) and is always set by the database, so nobody can backdate
-- ratings to stack a chart.

alter table public.item_ratings add column rated_on date;
update public.item_ratings set rated_on = (created_at at time zone 'America/New_York')::date;
alter table public.item_ratings alter column rated_on set not null;
alter table public.item_ratings drop constraint if exists item_ratings_menu_item_id_user_id_key;
alter table public.item_ratings add constraint item_ratings_one_per_day unique (menu_item_id, user_id, rated_on);
create index item_ratings_user_item_idx on public.item_ratings (user_id, menu_item_id, rated_on desc);

create or replace function private.item_rating_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.rated_on := (now() at time zone 'America/New_York')::date;   -- never taken from the client
  else
    new.rated_on := old.rated_on;                                      -- a rating stays on its day
  end if;
  return new;
end;
$$;
create trigger item_ratings_day before insert or update on public.item_ratings
  for each row execute function private.item_rating_day();
