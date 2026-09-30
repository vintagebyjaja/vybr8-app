-- VYBR8 · UPDATE: run this ONCE after file 11. Lets the VYBR8 Team import real places (OpenStreetMap) for each city.

-- ═════ 20261011000100_osm_import.sql ═════
-- VYBR8 · Real places from OpenStreetMap
--
-- The VYBR8 Team imports real restaurants, bars, cafes and more for each city from OpenStreetMap
-- (open data, © OpenStreetMap contributors, ODbL). Imported places are listed right away but aren't
-- "VYBR8 Approved" until the owner claims them. Places already on VYBR8 are matched, never duplicated.
-- (Google Places data can't be stored or shown on a non-Google map under Google's terms, so it isn't used here.)

alter table public.businesses drop constraint businesses_source_check;
alter table public.businesses add constraint businesses_source_check
  check (source in ('vybr8', 'community', 'owner', 'google', 'foursquare', 'osm'));
alter table public.businesses add column cuisines text[] not null default '{}' check (cardinality(cuisines) <= 8);

alter table public.place_external_ids drop constraint place_external_ids_provider_check;
alter table public.place_external_ids add constraint place_external_ids_provider_check
  check (provider in ('google', 'foursquare', 'mapbox', 'osm'));

-- Name matching ignores "and" / "&" too: "Mert's Heart and Soul" = "Merts Heart & Soul".
create or replace function private.norm_name(p text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '^the\s+', ''), '(\mand\M|&)', '', 'g'), '[^a-z0-9]', '', 'g'); $$;

create index business_locations_city_lat_idx on public.business_locations (city_slug, latitude);
create index if not exists posts_business_idx on public.posts (business_id) where business_id is not null;

-- Import one batch of places for a city. Admin only. Rows come from the server, already cleaned:
-- [{ "ext": "node/123", "name": "...", "kind": "restaurant", "lat": 35.2, "lng": -80.8, "address": "1200 South Blvd",
--    "postal": "28203", "website": "https://...", "phone": "...", "brand": "Chick-fil-A", "cuisines": ["chicken"],
--    "hours": [{ "weekday": 1, "opens": "11:00", "closes": "22:00" }] }]
create or replace function public.import_places(p_city text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cities;
  r jsonb;
  h jsonb;
  v_name text; v_kind public.business_kind; v_lat numeric; v_lng numeric; v_addr text; v_brand text; v_web text;
  biz uuid; loc uuid; brand uuid; branch text; new_slug text;
  added int := 0; matched int := 0; known int := 0; skipped int := 0;
  errs text[] := '{}';
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select * into c from public.cities where slug = p_city;
  if not found then raise exception 'unknown city' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'send up to 500 places at a time' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_name := left(trim(coalesce(r ->> 'name', '')), 120);
      v_lat := (r ->> 'lat')::numeric; v_lng := (r ->> 'lng')::numeric;
      v_addr := nullif(left(trim(coalesce(r ->> 'address', '')), 160), '');
      v_brand := nullif(left(trim(coalesce(r ->> 'brand', '')), 120), '');
      v_web := case when r ->> 'website' ~ '^https://[^\s]+\.[^\s]+$' and char_length(r ->> 'website') <= 300 then r ->> 'website' end;
      if char_length(v_name) < 2 or v_lat is null or v_lng is null or coalesce(r ->> 'ext', '') = ''
         or v_lat not between c.south - 0.05 and c.north + 0.05 or v_lng not between c.west - 0.05 and c.east + 0.05 then
        skipped := skipped + 1; continue;
      end if;
      v_kind := (r ->> 'kind')::public.business_kind;

      -- Already imported?
      if exists (select 1 from public.place_external_ids where provider = 'osm' and external_id = r ->> 'ext') then
        known := known + 1; continue;
      end if;

      -- Already on VYBR8 (added by someone, claimed, or the same place imported under another id)?
      select b.id, l.id into biz, loc
        from public.business_locations l join public.businesses b on b.id = l.business_id
       where l.city_slug = c.slug and b.deleted_at is null
         and l.latitude between v_lat - 0.0015 and v_lat + 0.0015
         and l.longitude between v_lng - 0.002 and v_lng + 0.002
         and (private.norm_name(b.name) = private.norm_name(v_name)
              or (length(private.norm_name(v_name)) >= 4 and private.norm_name(b.name) like '%' || private.norm_name(v_name) || '%')
              or (length(private.norm_name(b.name)) >= 4 and private.norm_name(v_name) like '%' || private.norm_name(b.name) || '%'))
       limit 1;
      if biz is not null then
        insert into public.place_external_ids (provider, external_id, business_id, location_id) values ('osm', r ->> 'ext', biz, loc)
        on conflict do nothing;
        matched := matched + 1; biz := null; loc := null; continue;
      end if;

      -- Franchise brand: shared across locations, each location told apart by its street.
      brand := null;
      if v_brand is not null then
        select id into brand from public.brands where private.norm_name(name) = private.norm_name(v_brand) limit 1;
        if brand is null then
          insert into public.brands (slug, name) values (private.unique_brand_slug(v_brand)::extensions.citext, v_brand) returning id into brand;
        end if;
      end if;
      branch := case when brand is not null or exists (select 1 from public.businesses x where private.norm_name(x.name) = private.norm_name(v_name) and x.deleted_at is null)
                     then private.street_name(v_addr) end;
      new_slug := private.unique_business_slug(v_name || ' ' || coalesce(branch, '') || ' ' || c.slug);

      insert into public.businesses (slug, name, kind, website, phone, status, source, branch_name, brand_id, cuisines)
      values (new_slug::extensions.citext, v_name, v_kind, v_web, nullif(left(r ->> 'phone', 40), ''), 'active', 'osm', branch, brand,
              coalesce((select array_agg(left(x, 30)) from (select jsonb_array_elements_text(coalesce(r -> 'cuisines', '[]')) x limit 8) s), '{}'))
      returning id into biz;

      insert into public.business_locations (business_id, label, address_line1, city, region, postal_code, latitude, longitude, timezone, city_slug, is_primary)
      values (biz, branch, v_addr, split_part(c.name, ',', 1), c.region, nullif(left(r ->> 'postal', 10), ''), round(v_lat, 6), round(v_lng, 6), c.timezone, c.slug, true)
      returning id into loc;

      insert into public.place_external_ids (provider, external_id, business_id, location_id) values ('osm', r ->> 'ext', biz, loc);

      for h in select * from jsonb_array_elements(coalesce(r -> 'hours', '[]')) loop
        insert into public.business_hours (location_id, weekday, opens_at, closes_at)
        values (loc, (h ->> 'weekday')::smallint, (h ->> 'opens')::time, (h ->> 'closes')::time)
        on conflict do nothing;
      end loop;

      added := added + 1; biz := null; loc := null;
    exception when others then
      skipped := skipped + 1; biz := null; loc := null;
      if cardinality(errs) < 5 then errs := errs || left(coalesce(r ->> 'name', '?') || ': ' || sqlerrm, 200); end if;
    end;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, metadata)
  values ((select auth.uid()), 'places.imported', 'city', jsonb_build_object('city', c.slug, 'added', added, 'matched', matched, 'known', known, 'skipped', skipped));

  return jsonb_build_object('added', added, 'matched', matched, 'known', known, 'skipped', skipped, 'errors', to_jsonb(errs));
end;
$$;
revoke all on function public.import_places(text, jsonb) from public, anon;
grant execute on function public.import_places(text, jsonb) to authenticated;

create or replace function private.unique_brand_slug(p_base text)
returns text language plpgsql stable set search_path = ''
as $$
declare
  base text := coalesce(nullif(private.slugify(p_base), ''), 'brand');
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from public.brands where slug = candidate::extensions.citext) loop
    n := n + 1;
    candidate := left(base, 70) || '-' || n;
  end loop;
  return candidate;
end;
$$;
grant execute on function private.unique_brand_slug(text) to authenticated, service_role;

-- How many places each city has, for the import page.
create or replace function public.city_place_counts()
returns table (city_slug text, places bigint, imported bigint)
language sql stable security definer
set search_path = ''
as $$
  select l.city_slug, count(distinct b.id), count(distinct b.id) filter (where b.source = 'osm')
    from public.business_locations l join public.businesses b on b.id = l.business_id
   where b.deleted_at is null and b.status = 'active' and l.city_slug is not null and private.is_admin()
   group by l.city_slug;
$$;
grant execute on function public.city_place_counts() to authenticated;

-- The Vybe Map shows the places people care about first: claimed places, then the most posted-about.
create or replace function public.map_location_ids(p_city text, p_limit int default 250)
returns setof uuid
language sql stable
set search_path = ''
as $$
  select l.id
    from public.business_locations l
    join public.businesses b on b.id = l.business_id
   where l.city_slug = p_city and l.latitude is not null and b.deleted_at is null
   order by b.is_claimed desc,
            (select count(*) from public.posts p where p.business_id = b.id) desc,
            (b.source <> 'osm') desc,
            l.id
   limit least(greatest(p_limit, 1), 400);
$$;
grant execute on function public.map_location_ids(text, int) to anon, authenticated;
