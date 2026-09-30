-- VYBR8 · UPDATE: run this ONCE after file 7. Adds Miami as the 8th city.

-- ═════ 20261007000100_miami.sql ═════
-- VYBR8 · Add Miami as the 8th launch city.
insert into public.cities (slug, name, region, timezone, center_lat, center_lng, north, south, east, west, position) values
  ('miami', 'Miami', 'FL', 'America/New_York', 25.761700, -80.191800, 25.870000, 25.700000, -80.120000, -80.320000, 8)
on conflict (slug) do update set name = excluded.name, region = excluded.region, timezone = excluded.timezone,
  center_lat = excluded.center_lat, center_lng = excluded.center_lng, north = excluded.north, south = excluded.south,
  east = excluded.east, west = excluded.west, position = excluded.position, is_active = true;
