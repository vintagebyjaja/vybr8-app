-- VYBR8 · Phase 1 · Businesses, locations, membership, claims, audit log

-- ── Tables ─────────────────────────────────────────────────────────────

create table public.businesses (
  id           uuid primary key default gen_random_uuid(),
  slug         extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name         text not null check (char_length(name) between 1 and 120),
  kind         public.business_kind not null,
  description  text check (char_length(description) <= 2000),
  price_level  smallint check (price_level between 1 and 4),
  website      text,
  phone        text,
  status       public.business_status not null default 'pending',
  is_claimed   boolean not null default false,
  is_demo      boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index businesses_status_idx on public.businesses (status) where deleted_at is null;

create table public.business_locations (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  label          text,
  address_line1  text,
  address_line2  text,
  city           text not null,
  region         text not null,           -- state / province code, e.g. NC
  postal_code    text,
  country        text not null default 'US' check (char_length(country) = 2),
  latitude       numeric(9,6) check (latitude between -90 and 90),
  longitude      numeric(9,6) check (longitude between -180 and 180),
  timezone       text not null default 'America/New_York',
  is_primary     boolean not null default false,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index business_locations_business_idx on public.business_locations (business_id);
create index business_locations_city_idx on public.business_locations (country, region, city);
create unique index business_locations_one_primary on public.business_locations (business_id) where is_primary;

create table public.business_members (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.business_member_role not null,
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.business_claims (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  claimant_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status          public.claim_status not null default 'pending',
  claimant_role   text check (char_length(claimant_role) <= 80),   -- "Owner", "General manager"
  evidence        jsonb not null default '{}'::jsonb,               -- private: storage paths, contact info
  decision_note   text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index business_claims_one_pending
  on public.business_claims (business_id, claimant_id) where status = 'pending';
create index business_claims_status_idx on public.business_claims (status, created_at);

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create trigger businesses_updated_at          before update on public.businesses          for each row execute function private.set_updated_at();
create trigger business_locations_updated_at  before update on public.business_locations  for each row execute function private.set_updated_at();
create trigger business_claims_updated_at     before update on public.business_claims     for each row execute function private.set_updated_at();

-- ── Helpers ────────────────────────────────────────────────────────────

create or replace function private.business_role(p_business_id uuid)
returns public.business_member_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.business_members
  where business_id = p_business_id and user_id = (select auth.uid());
$$;

create or replace function private.is_business_member(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.business_role(p_business_id) is not null; $$;

create or replace function private.can_edit_business(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.is_admin() or private.business_role(p_business_id) in ('owner', 'manager'); $$;

create or replace function private.business_is_claimable(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = p_business_id and status = 'active' and not is_claimed and deleted_at is null
  );
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Guards: privileged columns ─────────────────────────────────────────

create or replace function private.businesses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if new.status     is distinct from old.status
  or new.is_claimed is distinct from old.is_claimed
  or new.is_demo    is distinct from old.is_demo
  or new.slug       is distinct from old.slug
  or new.deleted_at is distinct from old.deleted_at
  or new.created_by is distinct from old.created_by then
    raise exception 'status, claim, demo, slug and deletion fields are admin-only' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger businesses_guard before update on public.businesses
  for each row execute function private.businesses_guard();

create or replace function private.business_locations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if tg_op = 'UPDATE' and (new.business_id <> old.business_id or new.is_demo is distinct from old.is_demo) then
    raise exception 'locations cannot move between businesses or change demo status' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.is_demo then
    raise exception 'only admins create demo records' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger business_locations_guard before insert or update on public.business_locations
  for each row execute function private.business_locations_guard();

-- Claimants may only withdraw their own pending claim. Decisions go through admin RPCs.
create or replace function private.business_claims_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if old.status = 'pending' and new.status = 'withdrawn'
     and new.business_id = old.business_id and new.claimant_id = old.claimant_id
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.decision_note is not distinct from old.decision_note then
    return new;
  end if;
  if new.status = old.status and old.status = 'pending'
     and new.business_id = old.business_id and new.claimant_id = old.claimant_id
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.decision_note is not distinct from old.decision_note then
    return new;  -- editing evidence / role while pending
  end if;
  raise exception 'claims can only be edited or withdrawn while pending' using errcode = '42501';
end;
$$;
create trigger business_claims_guard before update on public.business_claims
  for each row execute function private.business_claims_guard();

-- ── Row Level Security ─────────────────────────────────────────────────

alter table public.businesses          enable row level security;
alter table public.business_locations  enable row level security;
alter table public.business_members    enable row level security;
alter table public.business_claims     enable row level security;
alter table public.audit_logs          enable row level security;

-- businesses
create policy "businesses: public reads active"
  on public.businesses for select to anon, authenticated
  using ((status = 'active' and deleted_at is null)
         or private.is_business_member(id)
         or private.is_admin());
create policy "businesses: admins create"
  on public.businesses for insert to authenticated
  with check (private.is_admin());
create policy "businesses: owners and managers edit"
  on public.businesses for update to authenticated
  using (private.can_edit_business(id)) with check (private.can_edit_business(id));
create policy "businesses: admins delete"
  on public.businesses for delete to authenticated
  using (private.is_admin());

-- business_locations: visible when the parent business is visible
create policy "business_locations: follow parent visibility"
  on public.business_locations for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "business_locations: editors insert"
  on public.business_locations for insert to authenticated
  with check (private.can_edit_business(business_id));
create policy "business_locations: editors update"
  on public.business_locations for update to authenticated
  using (private.can_edit_business(business_id)) with check (private.can_edit_business(business_id));
create policy "business_locations: editors delete"
  on public.business_locations for delete to authenticated
  using (private.can_edit_business(business_id));

-- business_members: team can see the team; owners manage non-owner roles; admins manage all
create policy "business_members: team and admins read"
  on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_business_member(business_id) or private.is_admin());
create policy "business_members: owners add non-owners"
  on public.business_members for insert to authenticated
  with check (private.is_admin()
              or (private.business_role(business_id) = 'owner' and role <> 'owner'));
create policy "business_members: owners change non-owners"
  on public.business_members for update to authenticated
  using (private.is_admin() or (private.business_role(business_id) = 'owner' and role <> 'owner'))
  with check (private.is_admin() or (private.business_role(business_id) = 'owner' and role <> 'owner'));
create policy "business_members: owners remove non-owners, members leave"
  on public.business_members for delete to authenticated
  using (private.is_admin()
         or (private.business_role(business_id) = 'owner' and role <> 'owner')
         or (user_id = (select auth.uid()) and role <> 'owner'));

-- business_claims
create policy "business_claims: claimant and admins read"
  on public.business_claims for select to authenticated
  using (claimant_id = (select auth.uid()) or private.is_admin());
create policy "business_claims: users file claims"
  on public.business_claims for insert to authenticated
  with check (claimant_id = (select auth.uid())
              and status = 'pending'
              and reviewed_by is null and reviewed_at is null and decision_note is null
              and private.business_is_claimable(business_id));
create policy "business_claims: claimant edits pending, admins all"
  on public.business_claims for update to authenticated
  using (claimant_id = (select auth.uid()) or private.is_admin())
  with check (claimant_id = (select auth.uid()) or private.is_admin());

-- audit_logs: admin read only. Rows are written by security-definer functions.
create policy "audit_logs: admins read"
  on public.audit_logs for select to authenticated
  using (private.is_admin());

-- ── Admin RPCs ─────────────────────────────────────────────────────────

create or replace function public.approve_business_claim(p_claim_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.business_claims;
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

  -- Other pending claims on the same business are closed.
  update public.business_claims
     set status = 'rejected', decision_note = 'Another claim for this business was approved',
         reviewed_by = auth.uid(), reviewed_at = now()
   where business_id = c.business_id and status = 'pending' and id <> c.id;

  insert into public.business_members (business_id, user_id, role, invited_by)
  values (c.business_id, c.claimant_id, 'owner', auth.uid())
  on conflict (business_id, user_id) do update set role = 'owner';

  update public.businesses set is_claimed = true where id = c.business_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business_claim.approved', 'business', c.business_id,
          jsonb_build_object('claim_id', c.id, 'claimant_id', c.claimant_id));
end;
$$;

create or replace function public.reject_business_claim(p_claim_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.business_claims;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  select * into c from public.business_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'claim is %', c.status using errcode = '22023'; end if;

  update public.business_claims
     set status = 'rejected', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = c.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business_claim.rejected', 'business', c.business_id,
          jsonb_build_object('claim_id', c.id, 'claimant_id', c.claimant_id));
end;
$$;

revoke execute on function public.approve_business_claim(uuid, text) from public, anon;
revoke execute on function public.reject_business_claim(uuid, text)  from public, anon;
grant  execute on function public.approve_business_claim(uuid, text) to authenticated;
grant  execute on function public.reject_business_claim(uuid, text)  to authenticated;
