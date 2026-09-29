-- VYBR8 · Cities, venue hours, logos, and "what's your vybe" statuses for the Vybe Map

-- ── Launch cities ──────────────────────────────────────────────────────
create table public.cities (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  region      text not null,
  timezone    text not null,
  center_lat  numeric(9,6) not null,
  center_lng  numeric(9,6) not null,
  -- Bounding box used to lay pins out on the Vybe Map.
  north       numeric(9,6) not null,
  south       numeric(9,6) not null,
  east        numeric(9,6) not null,
  west        numeric(9,6) not null,
  position    smallint not null default 100,
  is_active   boolean not null default true,
  check (north > south and east > west)
);

insert into public.cities (slug, name, region, timezone, center_lat, center_lng, north, south, east, west, position) values
  ('charlotte', 'Charlotte',      'NC', 'America/New_York',     35.227100,  -80.843100, 35.400000,  35.050000,  -80.650000,  -81.000000, 1),
  ('atlanta',   'Atlanta',        'GA', 'America/New_York',     33.749000,  -84.388000, 33.900000,  33.640000,  -84.250000,  -84.550000, 2),
  ('nashville', 'Nashville',      'TN', 'America/Chicago',      36.162700,  -86.781600, 36.300000,  36.020000,  -86.600000,  -86.950000, 3),
  ('houston',   'Houston',        'TX', 'America/Chicago',      29.760400,  -95.369800, 29.950000,  29.580000,  -95.150000,  -95.650000, 4),
  ('phoenix',   'Phoenix',        'AZ', 'America/Phoenix',      33.448400, -112.074000, 33.650000,  33.300000, -111.900000, -112.300000, 5),
  ('dc',        'Washington, DC', 'DC', 'America/New_York',     38.907200,  -77.036900, 38.995000,  38.800000,  -76.910000,  -77.120000, 6),
  ('brooklyn',  'Brooklyn',       'NY', 'America/New_York',     40.678200,  -73.944200, 40.740000,  40.570000,  -73.850000,  -74.040000, 7);

alter table public.cities enable row level security;
create policy "cities: everyone reads" on public.cities for select to anon, authenticated using (true);

-- Locations belong to a launch city (text city/region stay for addresses).
alter table public.business_locations add column city_slug text references public.cities (slug);
create index business_locations_city_slug_idx on public.business_locations (city_slug);
update public.business_locations set city_slug = 'charlotte' where city = 'Charlotte' and region = 'NC';

-- Business logo (storage path or absolute https URL set by the business).
alter table public.businesses add column logo_url text check (logo_url is null or logo_url ~ '^(https://|/)');

-- The city a user is browsing.
alter table public.user_settings add column city_slug text references public.cities (slug);

-- ── Opening hours ──────────────────────────────────────────────────────
create table public.business_hours (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.business_locations (id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  opens_at     time not null,
  closes_at    time not null,                                       -- <= opens_at means past midnight
  created_at   timestamptz not null default now(),
  unique (location_id, weekday, opens_at)
);
create index business_hours_location_idx on public.business_hours (location_id);

alter table public.business_hours enable row level security;
create policy "business_hours: follow location visibility"
  on public.business_hours for select to anon, authenticated
  using (exists (select 1 from public.business_locations l where l.id = location_id));
create policy "business_hours: editors write"
  on public.business_hours for all to authenticated
  using (private.can_edit_business((select l.business_id from public.business_locations l where l.id = location_id)))
  with check (private.can_edit_business((select l.business_id from public.business_locations l where l.id = location_id)));

-- ── "What's your vybe?" status (friends only, expires) ─────────────────
create type public.vybe_intent as enum ('eat', 'drink', 'link_up');

create table public.vybe_statuses (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  intent       public.vybe_intent not null,
  city_slug    text not null references public.cities (slug),
  business_id  uuid references public.businesses (id) on delete set null,   -- optional "headed to"
  note         text check (char_length(note) <= 140),
  expires_at   timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '12 hours'),
  created_at   timestamptz not null default now()
);

alter table public.vybe_statuses enable row level security;
create policy "vybe_statuses: owner and friends read while active"
  on public.vybe_statuses for select to authenticated
  using (user_id = (select auth.uid())
         or (expires_at > now() and private.are_friends(user_id, (select auth.uid()))));
create policy "vybe_statuses: owner sets"
  on public.vybe_statuses for insert to authenticated
  with check (user_id = (select auth.uid()) and (business_id is null or exists (select 1 from public.businesses b where b.id = business_id)));
create policy "vybe_statuses: owner updates"
  on public.vybe_statuses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "vybe_statuses: owner clears"
  on public.vybe_statuses for delete to authenticated
  using (user_id = (select auth.uid()));
