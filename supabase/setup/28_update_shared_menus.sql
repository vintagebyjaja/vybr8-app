-- VYBR8 · UPDATE: run this ONCE after file 27. Shared chain menus (Brand → Shared Menu → Location), menu sources, repeatable menu imports, admin Menus page.

-- ═════ 20261018300100_shared_menus.sql ═════
-- VYBR8 · Shared chain menus, menu provenance and repeatable menu imports
--
-- Brand → Shared Menu → Location
--   brand_menu_items  one menu per chain (McDonald's, Chick-fil-A…), kept in one place
--   menu_items        each location's own copy, linked back with brand_item_id, so ratings, charts,
--                     CraveZone and "Ate out?" keep working per location (reviews stay with the location)
--   Location overrides: a location item can set its own price/availability (price_is_local, is_available);
--                       a brand refresh never overwrites those.
-- Every imported item keeps where it came from (source, source_url, last_verified).
-- Imports are idempotent: running the same file twice changes nothing; a newer file updates in place.
-- Items that drop off a refreshed menu are marked unavailable, never deleted (their ratings stay).

-- ── Provenance on location menu items ──
alter table public.menu_items
  add column source         text not null default 'owner' check (source in ('owner', 'team', 'brand', 'import')),
  add column source_url     text check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 400)),
  add column last_verified  date,
  add column import_key     text check (import_key is null or char_length(import_key) between 1 and 160),
  add column brand_item_id  uuid,
  add column price_is_local boolean not null default false;   -- true: this location's own confirmed price
create unique index menu_items_import_key_idx on public.menu_items (business_id, import_key) where import_key is not null;

-- ── One shared menu per brand ──
create table public.brand_menu_items (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brands (id) on delete cascade,
  import_key     text not null check (char_length(import_key) between 1 and 160),
  name           text not null check (char_length(trim(name)) between 1 and 120),
  description    text check (char_length(description) <= 600),
  category       public.item_category not null default 'food',
  section        text check (char_length(section) <= 60),
  dish_type      text check (dish_type ~ '^[a-z0-9-]{2,40}$'),
  is_alcoholic   boolean not null default false,
  price_cents    integer check (price_cents between 0 and 1000000),   -- a brand-wide reference price is never shown as a local price
  position       smallint not null default 100,
  is_active      boolean not null default true,
  source_url     text check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 400)),
  last_verified  date,
  updated_at     timestamptz not null default now(),
  unique (brand_id, import_key),
  check (category = 'drink' or not is_alcoholic)
);
alter table public.menu_items
  add constraint menu_items_brand_item_fk foreign key (brand_item_id) references public.brand_menu_items (id) on delete set null;
create index menu_items_brand_item_idx on public.menu_items (brand_item_id) where brand_item_id is not null;
alter table public.brand_menu_items enable row level security;
create policy "brand_menu_items: public" on public.brand_menu_items for select to anon, authenticated using (true);
create policy "brand_menu_items: team writes" on public.brand_menu_items for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

alter table public.brands
  add column menu_url      text check (menu_url is null or (menu_url ~ '^https://' and char_length(menu_url) <= 400)),
  add column menu_verified date;

-- ── Where each menu comes from (for the admin Menus page and future refreshes) ──
create table public.menu_sources (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses (id) on delete cascade,
  brand_id      uuid references public.brands (id) on delete cascade,
  url           text not null check (url ~ '^https://' and char_length(url) <= 400),
  kind          text not null default 'menu_page' check (kind in ('website', 'menu_page', 'pdf', 'image', 'ordering')),
  status        text not null default 'found' check (status in ('found', 'imported', 'needs_review', 'failed')),
  items         integer not null default 0,
  last_checked  date,
  notes         text check (char_length(notes) <= 500),
  created_at    timestamptz not null default now(),
  check ((business_id is null) <> (brand_id is null))
);
create unique index menu_sources_business_url_idx on public.menu_sources (business_id, url) where business_id is not null;
create unique index menu_sources_brand_url_idx on public.menu_sources (brand_id, url) where brand_id is not null;
alter table public.menu_sources enable row level security;
create policy "menu_sources: team" on public.menu_sources for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- "Chick-fil-A", "Chick fil A", "CHICK-FIL-A®" → "chickfila"
create or replace function private.name_key(p text)
returns text
language sql immutable
set search_path = ''
as $$ select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g') $$;

create or replace function private.menu_item_key(p_name text)
returns text
language sql immutable
set search_path = ''
as $$ select left(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 160) $$;

-- Copy a brand's shared menu onto every linked location (new items added, shared fields refreshed,
-- local prices and availability left alone, dropped items marked unavailable).
create or replace function private.sync_brand_menu(p_brand uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into public.menu_items (business_id, name, description, category, section, dish_type, is_alcoholic, position,
                                 source, source_url, last_verified, import_key, brand_item_id)
  select b.id, bi.name, bi.description, bi.category, bi.section, bi.dish_type, bi.is_alcoholic, bi.position,
         'brand', bi.source_url, bi.last_verified, 'brand:' || bi.import_key, bi.id
    from public.brand_menu_items bi
    join public.businesses b on b.brand_id = bi.brand_id and b.deleted_at is null
   where bi.brand_id = p_brand and bi.is_active
  on conflict (business_id, import_key) where import_key is not null do update
     set name = excluded.name, description = excluded.description, category = excluded.category, section = excluded.section,
         dish_type = excluded.dish_type, is_alcoholic = excluded.is_alcoholic, position = excluded.position,
         source_url = excluded.source_url, last_verified = excluded.last_verified, brand_item_id = excluded.brand_item_id,
         is_available = case when public.menu_items.price_is_local then public.menu_items.is_available else true end;
  get diagnostics n = row_count;

  update public.menu_items m set is_available = false
    from public.brand_menu_items bi
   where m.brand_item_id = bi.id and bi.brand_id = p_brand and not bi.is_active and m.is_available;
  return n;
end;
$$;

-- Load or refresh one chain's shared menu. p_items: [{ "section", "name", "category", "alcoholic", "dish_type", "description", "source" }]
-- p_name_keys: the chain's name spellings ("chickfila"); unlinked places with exactly that name join the brand.
create or replace function private.import_brand_menu(p_slug text, p_name text, p_website text, p_name_keys text[], p_items jsonb, p_verified date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  br uuid; it jsonb; pos integer := 0; keys text[] := '{}'; k text; linked integer; synced integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 400 then
    raise exception 'send 1 to 400 items' using errcode = '22023';
  end if;
  -- Reuse the chain's existing brand (the one with the most locations) before making a new one.
  select o.id into br from public.brands o
   where o.slug::text = p_slug or private.name_key(o.name) = any (p_name_keys)
   order by (select count(*) from public.businesses b where b.brand_id = o.id) desc, o.created_at
   limit 1;
  if br is null then
    insert into public.brands (slug, name, website, menu_url, menu_verified)
    values (p_slug, p_name, nullif(p_website, ''), nullif(p_website, ''), p_verified)
    returning id into br;
  else
    update public.brands set menu_url = coalesce(nullif(p_website, ''), menu_url), website = coalesce(website, nullif(p_website, '')),
                             menu_verified = p_verified where id = br;
  end if;

  -- Link this chain's locations: same brand name only (never a fuzzy match), and never a place already in another brand.
  update public.businesses b set brand_id = br
   where b.brand_id is null and b.deleted_at is null and private.name_key(b.name) = any (p_name_keys);
  update public.businesses b set brand_id = br
   from public.brands o
   where b.brand_id = o.id and o.id <> br and private.name_key(o.name) = any (p_name_keys) and b.deleted_at is null;
  select count(*) into linked from public.businesses where brand_id = br and deleted_at is null;

  for it in select * from jsonb_array_elements(p_items) loop
    pos := pos + 1;
    k := private.menu_item_key(it ->> 'name');
    continue when k = '' or k = any (keys);
    keys := keys || k;
    insert into public.brand_menu_items (brand_id, import_key, name, description, category, section, dish_type, is_alcoholic, position,
                                         is_active, source_url, last_verified, updated_at)
    values (br, k, left(trim(it ->> 'name'), 120), nullif(left(it ->> 'description', 600), ''),
            case when it ->> 'category' = 'drink' then 'drink'::public.item_category else 'food'::public.item_category end,
            nullif(left(it ->> 'section', 60), ''),
            case when coalesce(it ->> 'dish_type', '') ~ '^[a-z0-9-]{2,40}$' then it ->> 'dish_type' end,
            coalesce((it ->> 'alcoholic')::boolean, false) and it ->> 'category' = 'drink', pos, true,
            case when coalesce(it ->> 'source', '') ~ '^https://' then left(it ->> 'source', 400) else nullif(p_website, '') end,
            p_verified, now())
    on conflict (brand_id, import_key) do update
       set name = excluded.name, description = coalesce(excluded.description, public.brand_menu_items.description),
           category = excluded.category, section = excluded.section, dish_type = coalesce(excluded.dish_type, public.brand_menu_items.dish_type),
           is_alcoholic = excluded.is_alcoholic, position = excluded.position, is_active = true,
           source_url = excluded.source_url, last_verified = excluded.last_verified, updated_at = now();
  end loop;
  update public.brand_menu_items set is_active = false, updated_at = now() where brand_id = br and is_active and not (import_key = any (keys));

  insert into public.menu_sources (brand_id, url, kind, status, items, last_checked)
  select br, p_website, 'menu_page', 'imported', cardinality(keys), p_verified where coalesce(p_website, '') ~ '^https://'
  on conflict (brand_id, url) where brand_id is not null do update set status = 'imported', items = excluded.items, last_checked = excluded.last_checked;

  synced := private.sync_brand_menu(br);
  return jsonb_build_object('brand', p_name, 'items', cardinality(keys), 'locations', linked, 'location_items', synced);
end;
$$;

-- Load or refresh one restaurant's own menu (with its real, dated prices) on one or more locations.
-- p_items: [{ "section", "name", "description", "price", "category", "alcoholic", "dish_type" }]
create or replace function private.import_place_menu(p_business uuid, p_items jsonb, p_source_url text, p_verified date)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare it jsonb; pos integer := 0; keys text[] := '{}'; k text; price numeric;
begin
  if not exists (select 1 from public.businesses where id = p_business and deleted_at is null) then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pos := pos + 1;
    k := 'import:' || private.menu_item_key(it ->> 'name');
    continue when k = 'import:' or k = any (keys);
    keys := keys || k;
    price := case when coalesce(it ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$' then (it ->> 'price')::numeric end;
    insert into public.menu_items (business_id, name, description, category, section, dish_type, is_alcoholic, position, price_cents,
                                   source, source_url, last_verified, import_key, price_is_local)
    values (p_business, left(trim(it ->> 'name'), 120), nullif(left(it ->> 'description', 600), ''),
            case when it ->> 'category' = 'drink' then 'drink'::public.item_category else 'food'::public.item_category end,
            nullif(left(it ->> 'section', 60), ''),
            case when coalesce(it ->> 'dish_type', '') ~ '^[a-z0-9-]{2,40}$' then it ->> 'dish_type' end,
            coalesce((it ->> 'alcoholic')::boolean, false) and it ->> 'category' = 'drink', pos,
            case when price is not null and price < 10000 then round(price * 100)::integer end,
            'import', case when coalesce(p_source_url, '') ~ '^https://' then left(p_source_url, 400) end, p_verified, k, price is not null)
    on conflict (business_id, import_key) where import_key is not null do update
       set name = excluded.name, description = coalesce(excluded.description, public.menu_items.description), category = excluded.category,
           section = excluded.section, dish_type = coalesce(excluded.dish_type, public.menu_items.dish_type), is_alcoholic = excluded.is_alcoholic,
           position = excluded.position, price_cents = coalesce(excluded.price_cents, public.menu_items.price_cents),
           price_is_local = excluded.price_is_local or public.menu_items.price_is_local,
           source_url = excluded.source_url, last_verified = excluded.last_verified, is_available = true;
  end loop;
  update public.menu_items set is_available = false
   where business_id = p_business and import_key like 'import:%' and not (import_key = any (keys)) and is_available;
  if coalesce(p_source_url, '') ~ '^https://' then
    insert into public.menu_sources (business_id, url, kind, status, items, last_checked)
    values (p_business, left(p_source_url, 400), 'menu_page', 'imported', cardinality(keys), p_verified)
    on conflict (business_id, url) where business_id is not null do update set status = 'imported', items = excluded.items, last_checked = excluded.last_checked;
  end if;
  return cardinality(keys);
end;
$$;

-- Website and menu links found for existing places (never overwrites a website a place already has).
-- p_rows: [{ "business_id", "website", "menu_url" }]
create or replace function private.import_menu_links(p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare r jsonb; biz uuid; sites integer := 0; menus integer := 0; n integer;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    biz := case when coalesce(r ->> 'business_id', '') ~ '^[0-9a-f-]{36}$' then (r ->> 'business_id')::uuid end;
    continue when biz is null or not exists (select 1 from public.businesses where id = biz and deleted_at is null);
    if coalesce(r ->> 'website', '') ~ '^https://[^\s<>"]+\.[^\s<>"]+$' and char_length(r ->> 'website') <= 300 then
      update public.businesses set website = r ->> 'website' where id = biz and website is null;
      get diagnostics n = row_count; sites := sites + n;
    end if;
    if coalesce(r ->> 'menu_url', '') ~ '^https://[^\s<>"]+$' and char_length(r ->> 'menu_url') <= 400 then
      insert into public.place_links (business_id, kind, url, source) values (biz, 'menu', r ->> 'menu_url', 'team') on conflict do nothing;
      get diagnostics n = row_count; menus := menus + n;
      insert into public.menu_sources (business_id, url, kind, status) values (biz, r ->> 'menu_url', 'menu_page', 'found') on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('websites_added', sites, 'menu_links_added', menus);
end;
$$;

revoke all on function private.sync_brand_menu(uuid), private.import_brand_menu(text, text, text, text[], jsonb, date),
  private.import_place_menu(uuid, jsonb, text, date), private.import_menu_links(jsonb) from public, anon, authenticated;

-- Admins can refresh a chain menu from the app (the SQL Editor calls the private functions directly).
create or replace function public.admin_import_brand_menu(p_slug text, p_name text, p_website text, p_name_keys text[], p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return private.import_brand_menu(p_slug, p_name, p_website, p_name_keys, p_items, current_date);
end;
$$;
revoke execute on function public.admin_import_brand_menu(text, text, text, text[], jsonb) from public, anon;
grant execute on function public.admin_import_brand_menu(text, text, text, text[], jsonb) to authenticated;

-- Menu coverage for the admin Menus page: places with/without a menu, by city.
create or replace function public.admin_menu_coverage()
returns table (city_slug text, places integer, with_menu integer, with_brand_menu integer, with_own_menu integer, with_menu_link integer)
language sql stable security definer
set search_path = ''
as $$
  with p as (
    select b.id, (select l.city_slug from public.business_locations l where l.business_id = b.id order by l.is_primary desc nulls last limit 1) as city_slug
      from public.businesses b
     where b.deleted_at is null and not b.is_demo
  )
  select coalesce(p.city_slug, 'unknown'), count(*)::int,
         count(*) filter (where exists (select 1 from public.menu_items m where m.business_id = p.id and m.is_available))::int,
         count(*) filter (where exists (select 1 from public.menu_items m where m.business_id = p.id and m.brand_item_id is not null))::int,
         count(*) filter (where exists (select 1 from public.menu_items m where m.business_id = p.id and m.brand_item_id is null))::int,
         count(*) filter (where exists (select 1 from public.place_links k where k.business_id = p.id and k.kind = 'menu')
                           or exists (select 1 from public.businesses b2 where b2.id = p.id and b2.website is not null))::int
    from p
   where private.is_staff()
   group by 1 order by 2 desc;
$$;
revoke execute on function public.admin_menu_coverage() from public, anon;
grant execute on function public.admin_menu_coverage() to authenticated;
