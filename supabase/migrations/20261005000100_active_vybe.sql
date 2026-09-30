-- VYBR8 · Active Vybe & Vybe Plan
--
-- • Activity per day (steps, active calories, distance, minutes). Private to the person, always.
--   Today it's entered by hand; phone health apps (Apple Health, Health Connect, Samsung Health) write here
--   once the VYBR8 phone app ships, and Garmin/Fitbit through their partner APIs. Each source keeps its own row.
-- • A step goal, and "connect" requests so we know which health apps people want first.
-- • Your Vybe Plan (MAX): meals planned per day from real menu items near you, with nutrition only where it's known.
--   Wellness information, not medical advice.

create table public.activity_days (
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day              date not null,
  source           text not null default 'manual' check (source in ('manual', 'apple_health', 'health_connect', 'samsung_health', 'garmin', 'fitbit')),
  steps            integer check (steps between 0 and 150000),
  active_calories  integer check (active_calories between 0 and 10000),
  distance_m       integer check (distance_m between 0 and 300000),
  active_minutes   integer check (active_minutes between 0 and 1440),
  updated_at       timestamptz not null default now(),
  primary key (user_id, day, source)
);
create index activity_days_user_day_idx on public.activity_days (user_id, day desc);

create table public.activity_goals (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  step_goal   integer not null default 10000 check (step_goal between 1000 and 50000),
  updated_at  timestamptz not null default now()
);

create table public.health_connections (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider    text not null check (provider in ('apple_health', 'health_connect', 'samsung_health', 'garmin', 'fitbit')),
  status      text not null default 'requested' check (status in ('requested', 'connected', 'disconnected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

-- One row per planned meal. MAX feature: meal_planning.
create table public.meal_plan_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day              date not null,
  slot             text not null check (slot in ('breakfast', 'lunch', 'pre_workout', 'snack', 'dinner')),
  at_time          time not null,
  menu_item_id     uuid references public.menu_items (id) on delete set null,
  name             text not null check (char_length(trim(name)) between 1 and 120),
  calories         integer check (calories between 0 and 10000),
  protein_g        numeric(6,1) check (protein_g >= 0),
  carbs_g          numeric(6,1) check (carbs_g >= 0),
  fat_g            numeric(6,1) check (fat_g >= 0),
  nutrition_source public.nutrition_source not null default 'unknown',
  eaten_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index meal_plan_items_user_day_idx on public.meal_plan_items (user_id, day, at_time);

create table public.day_plans (
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day       date not null,
  day_type  text not null default 'custom' check (day_type in ('high_energy', 'rest', 'custom')),
  primary key (user_id, day)
);

alter table public.activity_days enable row level security;
alter table public.activity_goals enable row level security;
alter table public.health_connections enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.day_plans enable row level security;

-- Health data is owner-only. Not friends, not businesses, not the VYBR8 Team.
create policy "activity_days: owner only" on public.activity_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "activity_goals: owner only" on public.activity_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "health_connections: owner only" on public.health_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status = 'requested');
create policy "meal_plan_items: owner reads and edits" on public.meal_plan_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy "meal_plan_items: MAX members add" on public.meal_plan_items for insert to authenticated
  with check (user_id = (select auth.uid()) and private.viewer_can('meal_planning'));
create policy "meal_plan_items: owner updates" on public.meal_plan_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_plan_items: owner deletes" on public.meal_plan_items for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "day_plans: owner only" on public.day_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Only the phone app / partner sync (service role) can write a non-manual source.
create or replace function private.activity_days_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.source <> 'manual' then
    raise exception 'only manual entries can be typed in' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger activity_days_guard before insert or update on public.activity_days
  for each row execute function private.activity_days_guard();

-- ── Suggest a day of meals ────────────────────────────────────────────
-- Picks real, available, non-alcoholic menu items in the city, with calories known, sized to the person's
-- calorie target (or 2,000 kcal) and the kind of day. Replaces the day's meals that haven't been eaten yet.
create or replace function public.suggest_meal_plan(p_city text, p_day date, p_day_type text default 'custom')
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  can_plus boolean := private.viewer_can('advanced_nutrition');
  target integer;
  mult numeric := case p_day_type when 'high_energy' then 1.15 when 'rest' then 0.9 else 1 end;
  s record;
  pick record;
  chosen uuid[] := '{}';
  n integer := 0;
begin
  if uid is null then raise exception 'sign in' using errcode = '42501'; end if;
  if not private.viewer_can('meal_planning') then raise exception 'Your Vybe Plan is part of VYBR8 MAX.' using errcode = '42501'; end if;
  if p_day < current_date - 1 or p_day > current_date + 14 then raise exception 'Plan up to two weeks ahead.' using errcode = '22023'; end if;
  if p_day_type not in ('high_energy', 'rest', 'custom') then raise exception 'unknown day type' using errcode = '22023'; end if;

  select coalesce((select calories from public.nutrition_targets where user_id = uid), 2000) into target;

  insert into public.day_plans (user_id, day, day_type) values (uid, p_day, p_day_type)
  on conflict (user_id, day) do update set day_type = excluded.day_type;
  delete from public.meal_plan_items where user_id = uid and day = p_day and eaten_at is null;

  for s in
    select * from (values ('breakfast', time '07:30', 0.25, false), ('lunch', time '12:30', 0.30, false),
                          ('pre_workout', time '16:30', 0.12, true), ('dinner', time '19:00', 0.33, false)) v(slot, at_time, share, light)
  loop
    select m.id, m.name, n2.calories, n2.protein_g, n2.carbs_g, n2.fat_g, n2.source into pick
      from public.menu_items m
      join public.businesses b on b.id = m.business_id and b.status = 'active' and b.deleted_at is null
      join public.menu_item_nutrition n2 on n2.menu_item_id = m.id and n2.calories is not null
      left join public.menu_item_intel i on i.menu_item_id = m.id
     where m.is_available and not m.is_alcoholic
       and (m.sold_out_until is null or m.sold_out_until < now())
       and not (m.id = any (chosen))
       and (n2.source in ('estimated', 'database_provided', 'unknown') or coalesce(i.disclose_nutrition, false))
       and exists (select 1 from public.business_locations l where l.business_id = b.id and l.city_slug = p_city)
       and (not s.light or n2.calories <= 400)
     order by abs(n2.calories - target * mult * s.share) / (target * mult * s.share)
              - least(coalesce(n2.protein_g, 0) / greatest(n2.calories, 1) * 4, 0.6)   -- more protein per calorie ranks higher
              + random() * 0.15
     limit 1;
    if pick.id is null then continue; end if;
    chosen := array_append(chosen, pick.id);
    insert into public.meal_plan_items (user_id, day, slot, at_time, menu_item_id, name, calories, protein_g, carbs_g, fat_g, nutrition_source)
    values (uid, p_day, s.slot, s.at_time, pick.id, pick.name, pick.calories, pick.protein_g,
            case when can_plus then pick.carbs_g end, case when can_plus then pick.fat_g end, pick.source);
    n := n + 1;
    pick := null;
  end loop;
  return n;
end;
$$;
grant execute on function public.suggest_meal_plan(text, date, text) to authenticated;

-- Mark a planned meal as eaten: it goes into the food log too.
create or replace function public.eat_planned_meal(p_item uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  it public.meal_plan_items;
begin
  select * into it from public.meal_plan_items where id = p_item and user_id = auth.uid() for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if it.eaten_at is not null then return; end if;
  update public.meal_plan_items set eaten_at = now() where id = it.id;
  insert into public.food_logs (user_id, menu_item_id, name, calories, protein_g, carbs_g, fat_g, nutrition_source)
  values (it.user_id, it.menu_item_id, it.name, it.calories, it.protein_g, it.carbs_g, it.fat_g, it.nutrition_source);
end;
$$;
grant execute on function public.eat_planned_meal(uuid) to authenticated;
