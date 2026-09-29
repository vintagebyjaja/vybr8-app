-- VYBR8 · Expansion 4/4 · Food trucks
--
-- A food truck is a business (kind 'food_truck') so it shares menus, item ratings, place ratings,
-- claims and dashboards. What's different: it moves. Every location has a time window and a source,
-- and a manually reported "WE'RE HERE" always expires.

create type public.truck_stop_status as enum ('scheduled', 'open', 'delayed', 'cancelled', 'sold_out', 'closed');
create type public.location_source as enum ('operator', 'vybr8_team', 'community', 'provider');

create table public.food_truck_profiles (
  business_id        uuid primary key references public.businesses (id) on delete cascade,
  cuisine            text check (char_length(cuisine) <= 60),
  truck_photo_url    text check (truck_photo_url is null or truck_photo_url ~ '^(https://|/)'),
  ordering_url       text check (ordering_url is null or ordering_url ~ '^https://'),
  socials            jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 6),
  catering_available boolean not null default false,
  home_city_slug     text references public.cities (slug),
  updated_at         timestamptz not null default now()
);

create table public.food_truck_schedules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  location_name  text not null check (char_length(trim(location_name)) between 2 and 80),
  address        text check (char_length(address) <= 160),
  latitude       numeric(9,6) check (latitude between -90 and 90),
  longitude      numeric(9,6) check (longitude between -180 and 180),
  city_slug      text references public.cities (slug),
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  event_name     text check (char_length(event_name) <= 80),     -- "Friday Night Market" (food_truck_events live here)
  status         public.truck_stop_status not null default 'scheduled',
  source         public.location_source not null default 'operator',
  verified_at    timestamptz,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_at > start_at and end_at <= start_at + interval '18 hours')
);
create index food_truck_schedules_when_idx on public.food_truck_schedules (city_slug, start_at);
create index food_truck_schedules_truck_idx on public.food_truck_schedules (business_id, start_at);
create trigger food_truck_schedules_updated_at before update on public.food_truck_schedules for each row execute function private.set_updated_at();

-- "WE'RE HERE": a live pin set by a verified operator. Max 8 hours, then it disappears on its own.
create table public.food_truck_live_status (
  business_id  uuid primary key references public.businesses (id) on delete cascade,
  latitude     numeric(9,6) not null check (latitude between -90 and 90),
  longitude    numeric(9,6) not null check (longitude between -180 and 180),
  city_slug    text references public.cities (slug),
  note         text check (char_length(note) <= 120),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  set_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  check (expires_at > started_at and expires_at <= started_at + interval '8 hours')
);

create table public.food_truck_follows (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  notify       boolean not null default true,     -- "Notify me" when a new stop is posted
  created_at   timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- Only trucks get truck features.
create or replace function private.is_food_truck(p_business uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.businesses where id = p_business and kind = 'food_truck'); $$;

alter table public.food_truck_profiles enable row level security;
alter table public.food_truck_schedules enable row level security;
alter table public.food_truck_live_status enable row level security;
alter table public.food_truck_follows enable row level security;

create policy "food_truck_profiles: public" on public.food_truck_profiles for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_profiles: operators write" on public.food_truck_profiles for all to authenticated
  using (private.can_edit_business(business_id)) with check (private.can_edit_business(business_id) and private.is_food_truck(business_id));

create policy "food_truck_schedules: public" on public.food_truck_schedules for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_schedules: operators write" on public.food_truck_schedules for all to authenticated
  using (private.can_edit_business(business_id) or private.is_staff())
  with check ((private.can_edit_business(business_id) and source = 'operator' or private.is_staff()) and private.is_food_truck(business_id));

create policy "food_truck_live_status: public while live" on public.food_truck_live_status for select to anon, authenticated
  using (expires_at > now() and exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_live_status: operators set" on public.food_truck_live_status for all to authenticated
  using (private.can_edit_business(business_id))
  with check (private.can_edit_business(business_id) and private.is_food_truck(business_id));

create policy "food_truck_follows: own" on public.food_truck_follows for select to authenticated using (user_id = (select auth.uid()));
create policy "food_truck_follows: follow" on public.food_truck_follows for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_food_truck(business_id));
create policy "food_truck_follows: change" on public.food_truck_follows for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "food_truck_follows: unfollow" on public.food_truck_follows for delete to authenticated using (user_id = (select auth.uid()));

-- Follower counts for operators and profile pages (numbers only, never who).
create or replace function public.food_truck_follower_count(p_business uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.food_truck_follows where business_id = p_business; $$;
grant execute on function public.food_truck_follower_count(uuid) to anon, authenticated;

-- food_truck_notifications: a new or re-opened stop notifies followers who asked (in-app alerts).
create or replace function private.food_truck_notify_followers()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  truck text;
begin
  if new.status in ('cancelled', 'closed') or new.end_at < now() then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status and old.start_at = new.start_at and old.location_name = new.location_name then return new; end if;
  select name into truck from public.businesses where id = new.business_id;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select f.user_id, 'truck.stop',
         case when new.status = 'open' then truck || ' is open' when new.status = 'delayed' then truck || ' is running late' else truck || ' posted a stop' end,
         new.location_name || coalesce(' · ' || new.event_name, ''),
         '/food-trucks/' || (select slug from public.businesses where id = new.business_id),
         'truck.stop:' || new.id || ':' || new.status
    from public.food_truck_follows f
   where f.business_id = new.business_id and f.notify
  on conflict do nothing;
  return new;
end;
$$;
create trigger food_truck_schedules_notify after insert or update on public.food_truck_schedules
  for each row execute function private.food_truck_notify_followers();

-- What's where, right now or soon, in a city. A scheduled future stop is never shown as "here now".
create or replace function public.food_trucks_in_city(p_city text, p_from timestamptz default now(), p_to timestamptz default now() + interval '7 days')
returns table (business_id uuid, slug text, name text, cuisine text, stop_id uuid, location_name text, address text, event_name text,
               latitude numeric, longitude numeric, start_at timestamptz, end_at timestamptz, status public.truck_stop_status,
               is_live boolean, live_note text, live_until timestamptz)
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select * from public.food_truck_live_status where expires_at > now() and (city_slug = p_city or city_slug is null)
  )
  select b.id, b.slug::text, b.name, p.cuisine, s.id, s.location_name, s.address, s.event_name,
         coalesce(lv.latitude, s.latitude), coalesce(lv.longitude, s.longitude), s.start_at, s.end_at, s.status,
         lv.business_id is not null and (s.id is null or (s.start_at <= now() and s.end_at > now())), lv.note, lv.expires_at
    from public.businesses b
    left join public.food_truck_profiles p on p.business_id = b.id
    left join live lv on lv.business_id = b.id
    left join lateral (
      select * from public.food_truck_schedules x
       where x.business_id = b.id and x.end_at > p_from and x.start_at < p_to and x.status <> 'cancelled'
         and (x.city_slug = p_city or x.city_slug is null)
       order by x.start_at limit 1) s on true
   where b.kind = 'food_truck' and b.status = 'active' and b.deleted_at is null
     and (s.id is not null or lv.business_id is not null or p.home_city_slug = p_city);
$$;
grant execute on function public.food_trucks_in_city(text, timestamptz, timestamptz) to anon, authenticated;
