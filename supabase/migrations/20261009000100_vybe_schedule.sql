-- VYBR8 · My Vybe Schedule, morning/midday/night check-ins, and check-in reminders
--
-- • A person's rhythm: when they usually wake up and go to bed. Night-shift workers get their own
--   "morning" (right after they wake), so the Health tab follows their day, not the clock on the wall.
-- • Repeating schedule blocks ("Work, Mon–Fri, 9–5, mostly sitting") count toward the day automatically.
-- • Check-ins happen up to three times a day: morning, midday and night.
-- • Reminders land in the Alerts bell for any check-in not done yet.
-- Private to the person, always. Wellness information, not medical advice.

alter table public.activity_goals
  add column usual_wake time not null default '07:00',
  add column usual_bed  time not null default '23:00',
  add column reminders  text[] not null default '{morning,midday,night}'
    check (reminders <@ array['morning', 'midday', 'night']::text[]);

create table public.vybe_schedule (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label       text not null check (char_length(trim(label)) between 1 and 40),
  level       text not null check (level in ('very_active', 'active', 'light', 'sitting', 'gaming', 'rest')),
  days        smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]::smallint[]),  -- 0 = Sunday
  start_time  time not null,
  end_time    time not null check (end_time <> start_time),   -- an earlier end time means it runs overnight
  created_at  timestamptz not null default now()
);
create index vybe_schedule_user_idx on public.vybe_schedule (user_id);

create or replace function private.vybe_schedule_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.vybe_schedule where user_id = new.user_id) >= 20 then
    raise exception 'up to 20 schedule blocks' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger vybe_schedule_limit before insert on public.vybe_schedule
  for each row execute function private.vybe_schedule_limit();

alter table public.vybe_schedule enable row level security;
create policy "vybe_schedule: owner only" on public.vybe_schedule for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Check-ins: one per part of the day instead of one per day. Earlier check-ins become "midday".
alter table public.activity_checkins
  add column part text not null default 'midday' check (part in ('morning', 'midday', 'night'));
alter table public.activity_checkins drop constraint activity_checkins_pkey;
alter table public.activity_checkins add primary key (user_id, day, part);

-- A check-in reminder for the signed-in person, when they use Active Vybe, have that reminder on,
-- and haven't checked in yet. Once per day and part.
create or replace function public.checkin_reminder(p_day date, p_part text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n  integer;
begin
  if me is null or p_part not in ('morning', 'midday', 'night') or abs(p_day - current_date) > 1 then return false; end if;
  if not exists (select 1 from public.activity_goals g where g.user_id = me and p_part = any (g.reminders)) then return false; end if;
  if exists (select 1 from public.activity_checkins c where c.user_id = me and c.day = p_day and c.part = p_part) then return false; end if;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (me, 'health.checkin',
    case p_part when 'morning' then 'Good Morning, Let''s Vybe' when 'midday' then 'How''s the Vybe Going?' else 'Time to Let the Vybes Rest' end,
    case p_part
      when 'morning' then 'Log how you slept and set up your day.'
      when 'midday'  then 'Check in: what have you been up to, and have you already ate?'
      else 'Wrap up your day: how active was it and what did you eat and drink?' end,
    '/health', 'health.checkin.' || p_day::text || '.' || p_part)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.checkin_reminder(date, text) from public, anon;
grant execute on function public.checkin_reminder(date, text) to authenticated;
