-- VYBR8 · Chicago, Los Angeles & Philadelphia · nearby towns keep their real address
--
-- 11 launch cities. Places in nearby towns (Concord, NC) live under the closest VYBR8 city (Charlotte) for
-- maps, charts and search, but their page shows the real town and state.

insert into public.cities (slug, name, region, timezone, center_lat, center_lng, north, south, east, west, position) values
  ('chicago', 'Chicago',      'IL', 'America/Chicago',     41.878100,  -87.629800, 42.020000, 41.740000,  -87.520000,  -87.800000,  9),
  ('la',      'Los Angeles',  'CA', 'America/Los_Angeles', 34.052200, -118.243700, 34.200000, 33.930000, -118.100000, -118.500000, 10),
  ('philly',  'Philadelphia', 'PA', 'America/New_York',    39.952600,  -75.165200, 40.070000, 39.880000,  -75.050000,  -75.280000, 11)
on conflict (slug) do update set name = excluded.name, region = excluded.region, timezone = excluded.timezone,
  center_lat = excluded.center_lat, center_lng = excluded.center_lng, north = excluded.north, south = excluded.south,
  east = excluded.east, west = excluded.west, position = excluded.position, is_active = true;

-- Add a place: optional real town and state (defaults to the VYBR8 city), nearby pins allowed.
drop function if exists public.submit_place(text, public.business_kind, text, text, text, text, numeric, numeric, text, boolean, text, text);
create or replace function public.submit_place(
  p_name        text,
  p_kind        public.business_kind,
  p_city_slug   text,
  p_address     text,
  p_branch      text default null,
  p_postal      text default null,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_website     text default null,
  p_i_own_it    boolean default false,
  p_provider    text default null,
  p_external_id text default null,
  p_town        text default null,
  p_state       text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.cities;
  dup record;
  existing uuid;
  branch text;
  brand uuid;
  new_slug text;
  biz uuid;
  loc uuid;
begin
  if uid is null then raise exception 'sign in to add a place' using errcode = '42501'; end if;
  p_name := trim(coalesce(p_name, ''));
  p_address := trim(coalesce(p_address, ''));
  if char_length(p_name) not between 2 and 120 then raise exception 'Give the place its name.' using errcode = '22023'; end if;
  if char_length(p_address) not between 5 and 160 or p_address !~ '[0-9]' then
    raise exception 'Add the street address (number and street), so each location is its own listing.' using errcode = '22023';
  end if;
  if p_kind = 'food_truck' then raise exception 'Food trucks are added from the food truck page.' using errcode = '22023'; end if;
  if p_website is not null and p_website !~ '^https://' then raise exception 'Website must start with https://' using errcode = '22023'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Location needs both latitude and longitude.' using errcode = '22023'; end if;

  select * into c from public.cities where slug = p_city_slug and is_active;
  if not found then raise exception 'Pick one of the VYBR8 cities.' using errcode = '22023'; end if;
  -- Nearby towns count (Concord → Charlotte): about 40 km past the city's edge.
  if p_lat is not null and (p_lat not between c.south - 0.35 and c.north + 0.35 or p_lng not between c.west - 0.45 and c.east + 0.45) then
    raise exception 'That pin is too far from %. Pick the closest VYBR8 city.', c.name using errcode = '22023';
  end if;
  p_town := nullif(left(trim(coalesce(p_town, '')), 60), '');
  if p_town is not null and p_town !~ '^[[:alpha:]][[:alpha:] .''-]{1,59}$' then raise exception 'Town names use letters only (like Concord).' using errcode = '22023'; end if;
  p_state := upper(nullif(trim(coalesce(p_state, '')), ''));
  if p_state is not null and p_state !~ '^[A-Z]{2}$' then raise exception 'Use the 2-letter state (like NC).' using errcode = '22023'; end if;

  if p_provider is not null and p_external_id is not null then
    select business_id into existing from public.place_external_ids where provider = p_provider and external_id = p_external_id;
    if existing is not null then
      return jsonb_build_object('status', 'duplicate', 'slug', (select slug::text from public.businesses where id = existing));
    end if;
  end if;

  select * into dup from public.find_existing_place(p_name, p_city_slug, p_address, p_lat, p_lng) limit 1;
  if found then
    return jsonb_build_object('status', 'duplicate', 'slug', dup.slug, 'name', dup.name, 'address', dup.address);
  end if;

  if (select count(*) from public.businesses where created_by = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve added 10 places today. Thanks! Try again tomorrow.' using errcode = '22023';
  end if;

  branch := coalesce(nullif(trim(p_branch), ''), private.street_name(p_address));
  new_slug := private.unique_business_slug(p_name || ' ' || coalesce(branch, '') || ' ' || c.slug);

  -- Franchise: if this name already belongs to a brand, the new location joins it.
  select id into brand from public.brands where private.norm_name(name) = private.norm_name(p_name) limit 1;

  insert into public.businesses (slug, name, kind, website, status, source, branch_name, brand_id, created_by)
  values (new_slug::extensions.citext, p_name, p_kind, p_website, 'pending', case when p_i_own_it then 'owner' else 'community' end, branch, brand, uid)
  returning id into biz;

  insert into public.business_locations (business_id, label, address_line1, city, region, postal_code, latitude, longitude, timezone, city_slug, is_primary)
  values (biz, branch, p_address, coalesce(p_town, split_part(c.name, ',', 1)), coalesce(p_state, c.region), nullif(trim(p_postal), ''), p_lat, p_lng, c.timezone, c.slug, true)
  returning id into loc;

  if p_provider is not null and p_external_id is not null then
    insert into public.place_external_ids (provider, external_id, business_id, location_id) values (p_provider, p_external_id, biz, loc);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (uid, 'place.submitted', 'business', biz, jsonb_build_object('city', c.slug, 'owner', p_i_own_it));

  return jsonb_build_object('status', 'created', 'slug', new_slug, 'id', biz);
end;
$$;
grant execute on function public.submit_place(text, public.business_kind, text, text, text, text, numeric, numeric, text, boolean, text, text, text, text) to authenticated;

-- Import: OpenStreetMap's addr:city / addr:state become the shown town and state.
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
  v_name text; v_kind public.business_kind; v_lat numeric; v_lng numeric; v_addr text; v_brand text; v_web text; v_town text; v_state text;
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
      v_town := nullif(left(trim(coalesce(r ->> 'town', '')), 60), '');
      if v_town !~ '^[[:alpha:]][[:alpha:] .''-]{1,59}$' then v_town := null; end if;
      v_state := upper(nullif(trim(coalesce(r ->> 'state', '')), ''));
      if v_state !~ '^[A-Z]{2}$' then v_state := null; end if;
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
      values (biz, branch, v_addr, coalesce(v_town, split_part(c.name, ',', 1)), coalesce(v_state, c.region), nullif(left(r ->> 'postal', 10), ''), round(v_lat, 6), round(v_lng, 6), c.timezone, c.slug, true)
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
