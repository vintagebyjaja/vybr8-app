-- VYBR8 · Places, franchises and claims
--
-- • Anyone signed in can add a place. It waits for a quick VYBR8 Team check before it goes public.
-- • Every physical location is its own listing with its own ratings, menu and claim. Franchise locations
--   share a brand but are told apart by branch name and street address ("Chick-fil-A · South Blvd").
-- • Owners claim their location by proving it's theirs. Chefs claim their chef profile the same way.
--   An approved claim gives the place the "VYBR8 Approved" badge.
-- • Places pulled from Google or Foursquare later keep their provider id here, so imports never duplicate.

-- ── Brands (franchise groups) ─────────────────────────────────────────
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  slug        extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name        text not null check (char_length(trim(name)) between 1 and 120),
  logo_url    text check (logo_url is null or logo_url ~ '^(https://|/)'),
  website     text check (website is null or website ~ '^https://'),
  created_at  timestamptz not null default now()
);
alter table public.brands enable row level security;
create policy "brands: public" on public.brands for select to anon, authenticated using (true);
create policy "brands: team writes" on public.brands for all to authenticated using (private.is_staff()) with check (private.is_staff());

alter table public.businesses
  add column brand_id    uuid references public.brands (id) on delete set null,
  add column branch_name text check (branch_name is null or char_length(trim(branch_name)) between 1 and 80),
  add column source      text not null default 'vybr8' check (source in ('vybr8', 'community', 'owner', 'google', 'foursquare')),
  add column approved_at timestamptz;   -- set when an owner's claim is approved: the VYBR8 Approved badge
create index businesses_brand_idx on public.businesses (brand_id) where brand_id is not null;
update public.businesses set approved_at = updated_at where is_claimed and approved_at is null;

-- Provider ids (Google place_id, Foursquare fsq_id) so a place is only ever listed once.
create table public.place_external_ids (
  provider     text not null check (provider in ('google', 'foursquare', 'mapbox')),
  external_id  text not null check (char_length(external_id) between 1 and 300),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  location_id  uuid references public.business_locations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (provider, external_id)
);
create index place_external_ids_business_idx on public.place_external_ids (business_id);
alter table public.place_external_ids enable row level security;
create policy "place_external_ids: follow the place" on public.place_external_ids for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "place_external_ids: team writes" on public.place_external_ids for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- People who added a place can see it while it waits for review.
create policy "businesses: submitters see their pending places" on public.businesses for select to authenticated
  using (created_by = (select auth.uid()) and deleted_at is null);

-- Privileged columns. Admins change anything; the team (moderators) can publish places and link brands.
create or replace function private.businesses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if new.is_claimed  is distinct from old.is_claimed
  or new.is_demo     is distinct from old.is_demo
  or new.slug        is distinct from old.slug
  or new.deleted_at  is distinct from old.deleted_at
  or new.created_by  is distinct from old.created_by
  or new.source      is distinct from old.source
  or new.approved_at is distinct from old.approved_at then
    raise exception 'claim, approval, demo, slug, source and deletion fields are admin-only' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status or new.brand_id is distinct from old.brand_id) and not private.is_staff() then
    raise exception 'publishing a place and linking brands is done by the VYBR8 Team' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Text helpers ──────────────────────────────────────────────────────
create or replace function private.slugify(p text)
returns text language sql immutable set search_path = ''
as $$ select left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 70); $$;

-- "The Ember & Oak!" → "emberoak"
create or replace function private.norm_name(p text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(regexp_replace(lower(coalesce(p, '')), '^the\s+', ''), '[^a-z0-9]', '', 'g'); $$;

-- "1200 South Boulevard, Suite 4" → "1200southblvd"  (suite/unit dropped, common words shortened)
create or replace function private.norm_address(p text)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             lower(split_part(coalesce(p, ''), ',', 1)),
             '(\m(suite|ste|unit|apt)\M|#)\s*\S+', '', 'g'),
             '\mstreet\M', 'st', 'g'), '\mavenue\M', 'ave', 'g'), '\mboulevard\M', 'blvd', 'g'), '\mroad\M', 'rd', 'g'),
             '\mdrive\M', 'dr', 'g'), '\mparkway\M', 'pkwy', 'g'), '\mhighway\M', 'hwy', 'g'),
           '[^a-z0-9]', '', 'g');
$$;

-- "1200 South Blvd" → "South Blvd" (the branch name when the owner doesn't give one)
create or replace function private.street_name(p text)
returns text language sql immutable set search_path = ''
as $$ select nullif(trim(regexp_replace(split_part(coalesce(p, ''), ',', 1), '^\s*[0-9][0-9A-Za-z-]*\s+', '')), ''); $$;

-- Meters between two points.
create or replace function private.meters_between(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns double precision language sql immutable set search_path = ''
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)));
$$;

create or replace function private.unique_business_slug(p_base text)
returns text language plpgsql stable set search_path = ''
as $$
declare
  base text := coalesce(nullif(private.slugify(p_base), ''), 'place');
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from public.businesses where slug = candidate::extensions.citext) loop
    n := n + 1;
    candidate := left(base, 70) || '-' || n;
  end loop;
  return candidate;
end;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Is this place already on VYBR8? ───────────────────────────────────
-- Same city + same name (or one name inside the other) + same street address or within 150 m.
-- Different addresses are different locations, so franchise spots never collide.
create or replace function public.find_existing_place(p_name text, p_city_slug text, p_address text, p_lat numeric default null, p_lng numeric default null)
returns table (slug text, name text, branch_name text, address text, status public.business_status)
language sql stable security definer
set search_path = ''
as $$
  select b.slug::text, b.name, b.branch_name, l.address_line1, b.status
    from public.businesses b
    join public.business_locations l on l.business_id = b.id
   where l.city_slug = p_city_slug
     and b.deleted_at is null
     and (b.status = 'active' or b.created_by = (select auth.uid()) or private.is_staff())
     and length(private.norm_name(p_name)) >= 2
     and (private.norm_name(b.name) = private.norm_name(p_name)
          or (length(private.norm_name(p_name)) >= 4 and private.norm_name(b.name) like '%' || private.norm_name(p_name) || '%')
          or (length(private.norm_name(b.name)) >= 4 and private.norm_name(p_name) like '%' || private.norm_name(b.name) || '%'))
     and ((l.address_line1 is not null and private.norm_address(l.address_line1) = private.norm_address(p_address))
          or (p_lat is not null and p_lng is not null and l.latitude is not null
              and private.meters_between(l.latitude, l.longitude, p_lat, p_lng) < 150))
   limit 5;
$$;
grant execute on function public.find_existing_place(text, text, text, numeric, numeric) to authenticated;

-- ── Add a place ───────────────────────────────────────────────────────
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
  p_external_id text default null
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
  if p_lat is not null and (p_lat not between c.south - 0.35 and c.north + 0.35 or p_lng not between c.west - 0.35 and c.east + 0.35) then
    raise exception 'That pin is outside %.', c.name using errcode = '22023';
  end if;

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
  values (biz, branch, p_address, split_part(c.name, ',', 1), c.region, nullif(trim(p_postal), ''), p_lat, p_lng, c.timezone, c.slug, true)
  returning id into loc;

  if p_provider is not null and p_external_id is not null then
    insert into public.place_external_ids (provider, external_id, business_id, location_id) values (p_provider, p_external_id, biz, loc);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (uid, 'place.submitted', 'business', biz, jsonb_build_object('city', c.slug, 'owner', p_i_own_it));

  return jsonb_build_object('status', 'created', 'slug', new_slug, 'id', biz);
end;
$$;
grant execute on function public.submit_place(text, public.business_kind, text, text, text, text, numeric, numeric, text, boolean, text, text) to authenticated;

-- ── Team review of new places ─────────────────────────────────────────
create or replace function public.review_place(p_business uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.businesses;
begin
  if not private.is_staff() then raise exception 'VYBR8 Team only' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business for update;
  if not found then raise exception 'place not found' using errcode = 'P0002'; end if;
  if b.status <> 'pending' then raise exception 'place is already %', b.status using errcode = '22023'; end if;

  update public.businesses set status = case when p_approve then 'active' else 'hidden' end::public.business_status where id = b.id;

  if b.created_by is not null then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (b.created_by, 'place.reviewed',
            case when p_approve then b.name || ' is live on VYBR8' else b.name || ' wasn''t added' end,
            case when p_approve then 'Thanks for adding it. Post the first plate!' else coalesce(p_note, 'We couldn''t confirm this place.') end,
            '/venue/' || b.slug, 'place.reviewed:' || b.id)
    on conflict do nothing;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when p_approve then 'place.approved' else 'place.rejected' end, 'business', b.id, jsonb_build_object('note', p_note));
end;
$$;
grant execute on function public.review_place(uuid, boolean, text) to authenticated;

-- Team links a location to its franchise brand (creating the brand the first time).
create or replace function public.set_place_brand(p_business uuid, p_brand_name text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  br uuid;
begin
  if not private.is_staff() then raise exception 'VYBR8 Team only' using errcode = '42501'; end if;
  if coalesce(trim(p_brand_name), '') = '' then
    update public.businesses set brand_id = null where id = p_business;
    return null;
  end if;
  select id into br from public.brands where private.norm_name(name) = private.norm_name(p_brand_name) limit 1;
  if br is null then
    insert into public.brands (slug, name)
    values (coalesce(nullif(private.slugify(p_brand_name), ''), 'brand-' || left(gen_random_uuid()::text, 8))::extensions.citext, trim(p_brand_name))
    on conflict (slug) do update set name = public.brands.name
    returning id into br;
  end if;
  update public.businesses set brand_id = br where id = p_business;
  return (select slug::text from public.brands where id = br);
end;
$$;
grant execute on function public.set_place_brand(uuid, text) to authenticated;

-- ── Claiming a place ──────────────────────────────────────────────────
alter table public.business_claims
  add column proof_method  text check (proof_method in ('business_email', 'business_phone', 'document', 'google_profile', 'social')),
  add column proof_code    text,
  add column contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column contact_phone text check (contact_phone is null or char_length(contact_phone) between 7 and 30),
  add column document_path text check (document_path is null or char_length(document_path) <= 300);

-- Claimable: live and unclaimed, or a place you just added yourself (so owners can add + claim in one go).
create or replace function private.business_is_claimable(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = p_business_id and not is_claimed and deleted_at is null
      and (status = 'active' or (status = 'pending' and created_by = (select auth.uid())))
  );
$$;

-- Private proof documents (business license, food permit, utility bill). Only the claimant and admins can open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-docs', 'claim-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy "claim-docs: upload to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "claim-docs: you and admins read" on storage.objects for select to authenticated
  using (bucket_id = 'claim-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin()));

create or replace function private.proof_code()
returns text language sql volatile set search_path = ''
as $$ select 'VYBR8-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)); $$;

create or replace function private.email_domain_matches(p_email text, p_website text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_email is not null and p_website is not null
     and lower(split_part(p_email, '@', 2)) = regexp_replace(lower(split_part(regexp_replace(p_website, '^https?://', ''), '/', 1)), '^www\.', '');
$$;

create or replace function public.start_business_claim(
  p_business uuid, p_role text, p_method text, p_email text default null, p_phone text default null,
  p_document_path text default null, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.businesses;
  code text := private.proof_code();
  claim uuid;
  matches boolean;
begin
  if uid is null then raise exception 'sign in to claim a place' using errcode = '42501'; end if;
  if not private.business_is_claimable(p_business) then raise exception 'This place can''t be claimed right now.' using errcode = '22023'; end if;
  if p_method not in ('business_email', 'business_phone', 'document', 'google_profile', 'social') then raise exception 'Pick how you''ll prove it.' using errcode = '22023'; end if;
  if coalesce(trim(p_role), '') = '' then raise exception 'Tell us your role (owner, general manager…).' using errcode = '22023'; end if;
  if p_method = 'business_email' and coalesce(p_email, '') = '' then raise exception 'Add the business email we should write to.' using errcode = '22023'; end if;
  if p_method = 'business_phone' and coalesce(p_phone, '') = '' then raise exception 'Add the business phone number we should call.' using errcode = '22023'; end if;
  if p_method = 'document' and coalesce(p_document_path, '') = '' then raise exception 'Upload a document that shows the business name and address.' using errcode = '22023'; end if;
  if p_document_path is not null and split_part(p_document_path, '/', 1) <> uid::text then raise exception 'not your upload' using errcode = '42501'; end if;
  if exists (select 1 from public.business_claims where business_id = p_business and claimant_id = uid and status = 'pending') then
    raise exception 'Your claim for this place is already waiting for review.' using errcode = '22023';
  end if;

  select * into b from public.businesses where id = p_business;
  matches := private.email_domain_matches(p_email, b.website);

  insert into public.business_claims (business_id, claimant_id, claimant_role, proof_method, proof_code, contact_email, contact_phone, document_path, evidence)
  values (p_business, uid, left(trim(p_role), 80), p_method, code, nullif(trim(p_email), ''), nullif(trim(p_phone), ''), p_document_path,
          jsonb_build_object('note', left(coalesce(p_note, ''), 1000), 'email_matches_website', matches))
  returning id into claim;

  return jsonb_build_object('claim_id', claim, 'code', code, 'email_matches_website', matches);
end;
$$;
grant execute on function public.start_business_claim(uuid, text, text, text, text, text, text) to authenticated;

-- Approving a claim: the claimant becomes owner, the place goes live (if it was waiting) and gets the badge.
create or replace function public.approve_business_claim(p_claim_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.business_claims;
  b public.businesses;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into c from public.business_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'claim is %', c.status using errcode = '22023'; end if;

  update public.business_claims
     set status = 'approved', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = c.id;

  update public.business_claims
     set status = 'rejected', decision_note = 'Another claim for this business was approved',
         reviewed_by = auth.uid(), reviewed_at = now()
   where business_id = c.business_id and status = 'pending' and id <> c.id;

  insert into public.business_members (business_id, user_id, role, invited_by)
  values (c.business_id, c.claimant_id, 'owner', auth.uid())
  on conflict (business_id, user_id) do update set role = 'owner';

  update public.businesses
     set is_claimed = true, approved_at = now(), status = case when status = 'pending' then 'active'::public.business_status else status end
   where id = c.business_id
  returning * into b;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (c.claimant_id, 'claim.approved', b.name || ' is yours', 'Your place is VYBR8 Approved. Add your menu, hours and photos.', '/venue/' || b.slug, 'claim.approved:' || c.id)
  on conflict do nothing;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business_claim.approved', 'business', c.business_id,
          jsonb_build_object('claim_id', c.id, 'claimant_id', c.claimant_id, 'method', c.proof_method));
end;
$$;

-- ── Claiming a chef profile ───────────────────────────────────────────
-- Chef profiles the team (or a future import) creates start with no owner. The real chef proves it's them.
create table public.chef_claims (
  id             uuid primary key default gen_random_uuid(),
  chef_id        uuid not null references public.chef_profiles (id) on delete cascade,
  claimant_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status         public.claim_status not null default 'pending',
  proof_method   text not null check (proof_method in ('social', 'business_confirmation', 'license_or_certificate', 'document')),
  proof_code     text not null,
  links          text check (char_length(links) <= 600),
  document_path  text check (document_path is null or char_length(document_path) <= 300),
  note           text check (char_length(note) <= 1000),
  decision_note  text,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create unique index chef_claims_one_pending on public.chef_claims (chef_id, claimant_id) where status = 'pending';
alter table public.chef_claims enable row level security;
create policy "chef_claims: claimant and admins read" on public.chef_claims for select to authenticated
  using (claimant_id = (select auth.uid()) or private.is_admin());
-- Writes go through the RPCs below only.

create or replace function public.start_chef_claim(p_chef uuid, p_method text, p_links text default null, p_document_path text default null, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  code text := private.proof_code();
  claim uuid;
begin
  if uid is null then raise exception 'sign in to claim a profile' using errcode = '42501'; end if;
  if not exists (select 1 from public.chef_profiles where id = p_chef and user_id is null) then
    raise exception 'This chef profile already has an owner.' using errcode = '22023';
  end if;
  if exists (select 1 from public.chef_profiles where user_id = uid) then
    raise exception 'You already have a chef profile. Ask the VYBR8 Team to merge them.' using errcode = '22023';
  end if;
  if p_method not in ('social', 'business_confirmation', 'license_or_certificate', 'document') then raise exception 'Pick how you''ll prove it.' using errcode = '22023'; end if;
  if p_method = 'social' and coalesce(trim(p_links), '') = '' then raise exception 'Add your Instagram, TikTok or YouTube link.' using errcode = '22023'; end if;
  if p_document_path is not null and split_part(p_document_path, '/', 1) <> uid::text then raise exception 'not your upload' using errcode = '42501'; end if;
  if exists (select 1 from public.chef_claims where chef_id = p_chef and claimant_id = uid and status = 'pending') then
    raise exception 'Your claim is already waiting for review.' using errcode = '22023';
  end if;
  insert into public.chef_claims (chef_id, claimant_id, proof_method, proof_code, links, document_path, note)
  values (p_chef, uid, p_method, code, nullif(trim(p_links), ''), p_document_path, nullif(trim(p_note), ''))
  returning id into claim;
  return jsonb_build_object('claim_id', claim, 'code', code);
end;
$$;
grant execute on function public.start_chef_claim(uuid, text, text, text, text) to authenticated;

create or replace function public.decide_chef_claim(p_claim uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.chef_claims;
  chef public.chef_profiles;
begin
  if not private.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into c from public.chef_claims where id = p_claim for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'claim is %', c.status using errcode = '22023'; end if;
  select * into chef from public.chef_profiles where id = c.chef_id for update;

  if not p_approve then
    update public.chef_claims set status = 'rejected', decision_note = coalesce(p_note, 'Could not verify'), reviewed_by = auth.uid(), reviewed_at = now() where id = c.id;
    return;
  end if;
  if chef.user_id is not null then raise exception 'profile already has an owner' using errcode = '22023'; end if;
  if exists (select 1 from public.chef_profiles where user_id = c.claimant_id) then raise exception 'claimant already owns a chef profile' using errcode = '22023'; end if;

  update public.chef_claims set status = 'approved', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now() where id = c.id;
  update public.chef_claims set status = 'rejected', decision_note = 'Another claim was approved', reviewed_by = auth.uid(), reviewed_at = now()
   where chef_id = c.chef_id and status = 'pending' and id <> c.id;
  update public.chef_profiles set user_id = c.claimant_id, verification = 'verified' where id = c.chef_id;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (c.claimant_id, 'chef_claim.approved', 'Your chef profile is yours', 'You''re verified. Update your services, menus and booking link.', '/chef/dashboard', 'chef_claim.approved:' || c.id)
  on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'chef_claim.approved', 'chef_profile', c.chef_id, jsonb_build_object('claim_id', c.id, 'claimant_id', c.claimant_id));
end;
$$;
grant execute on function public.decide_chef_claim(uuid, boolean, text) to authenticated;
