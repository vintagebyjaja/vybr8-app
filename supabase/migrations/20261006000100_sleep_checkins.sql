-- VYBR8 · Sleep & activity check-ins
--
-- No health apps needed. Each day a person can:
-- • log sleep: when they went to bed, when they woke up, and how rested they feel;
-- • check in how the day went: very active, active, light, mostly sitting, gaming/screen day or rest day,
--   what they did, and roughly how many steps or miles (optional).
-- Private to the person, always. Wellness information, not medical advice.

create table public.sleep_logs (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null,                        -- the morning they woke up
  bed_time    time not null,
  wake_time   time not null,
  minutes     integer not null check (minutes between 30 and 1080),   -- 30 min to 18 h
  quality     smallint check (quality between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.activity_checkins (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null,
  level       text not null check (level in ('very_active', 'active', 'light', 'sitting', 'gaming', 'rest')),
  activities  text[] not null default '{}' check (cardinality(activities) <= 8),
  steps_band  text check (steps_band in ('under_3k', '3k_7k', '7k_12k', '12k_plus')),
  miles       numeric(4,1) check (miles between 0 and 100),
  note        text check (char_length(note) <= 200),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.activity_goals add column sleep_goal_minutes integer not null default 480 check (sleep_goal_minutes between 240 and 720);

alter table public.sleep_logs enable row level security;
alter table public.activity_checkins enable row level security;
create policy "sleep_logs: owner only" on public.sleep_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "activity_checkins: owner only" on public.activity_checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
