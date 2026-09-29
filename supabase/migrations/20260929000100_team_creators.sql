-- VYBR8 · Social layer 1/2 · VYBR8 Team, verified creators, follows
--
-- Creator types:
--   big_back      food creators
--   liquid_lover  drink creators (must attest they are 21+)
--   both

create type public.creator_type       as enum ('big_back', 'liquid_lover', 'both');
create type public.application_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.creator_status     as enum ('verified', 'suspended');

-- ── VYBR8 Team (public roster, e.g. Founder) ───────────────────────────
-- Titles are display only. Powers come from user_roles (admin / moderator).
create table public.team_members (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  bio         text check (char_length(bio) <= 280),
  position    smallint not null default 100,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger team_members_updated_at before update on public.team_members
  for each row execute function private.set_updated_at();

-- ── Follows (one-way; friendships stay two-way) ────────────────────────
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

-- ── Creator applications and verified creators ─────────────────────────
create table public.creator_applications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  creator_type         public.creator_type not null,
  city                 text check (char_length(city) <= 80),
  pitch                text not null check (char_length(pitch) between 20 and 1000),
  links                jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  is_21_plus_attested  boolean not null default false,
  status               public.application_status not null default 'pending',
  decision_note        text check (char_length(decision_note) <= 500),
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Liquid Lovers post about drinks, so they must confirm they are of legal drinking age.
  check (creator_type = 'big_back' or is_21_plus_attested)
);
create unique index creator_applications_one_pending on public.creator_applications (user_id) where status = 'pending';
create index creator_applications_queue_idx on public.creator_applications (status, created_at);
create trigger creator_applications_updated_at before update on public.creator_applications
  for each row execute function private.set_updated_at();

create table public.creator_profiles (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  creator_type    public.creator_type not null,
  status          public.creator_status not null default 'verified',
  application_id  uuid references public.creator_applications (id) on delete set null,
  verified_by     uuid references public.profiles (id) on delete set null,
  verified_at     timestamptz not null default now(),
  status_note     text,
  updated_at      timestamptz not null default now()
);
create index creator_profiles_status_idx on public.creator_profiles (status, creator_type);
create trigger creator_profiles_updated_at before update on public.creator_profiles
  for each row execute function private.set_updated_at();

-- ── Helpers ────────────────────────────────────────────────────────────
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'blocked'
      and least(f.requester_id, f.addressee_id)    = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

create or replace function private.is_verified_creator(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.creator_profiles where user_id = p_user and status = 'verified'); $$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- Applicants can edit or withdraw while pending. Decisions go through staff RPCs.
create or replace function private.creator_applications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  if old.status = 'pending' and new.status in ('pending', 'withdrawn')
     and new.user_id = old.user_id
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.decision_note is not distinct from old.decision_note then
    return new;
  end if;
  raise exception 'applications can only be edited or withdrawn while pending' using errcode = '42501';
end;
$$;
create trigger creator_applications_guard before update on public.creator_applications
  for each row execute function private.creator_applications_guard();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.team_members          enable row level security;
alter table public.follows               enable row level security;
alter table public.creator_applications  enable row level security;
alter table public.creator_profiles      enable row level security;

create policy "team_members: public roster"
  on public.team_members for select to anon, authenticated
  using (is_public or private.is_staff());
-- No write policies: the roster is managed with the secret key or SQL editor.

create policy "follows: visible when both profiles are visible"
  on public.follows for select to anon, authenticated
  using (private.can_view(follower_id, 'profile') and private.can_view(followee_id, 'profile'));
create policy "follows: follow visible, unblocked people"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid())
              and private.can_view(followee_id, 'profile')
              and not private.is_blocked_between(follower_id, followee_id));
create policy "follows: unfollow"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create policy "creator_applications: applicant and staff read"
  on public.creator_applications for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
create policy "creator_applications: apply for yourself"
  on public.creator_applications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending'
              and reviewed_by is null and reviewed_at is null and decision_note is null
              and not private.is_verified_creator(user_id));
create policy "creator_applications: applicant edits pending, staff all"
  on public.creator_applications for update to authenticated
  using (user_id = (select auth.uid()) or private.is_staff())
  with check (user_id = (select auth.uid()) or private.is_staff());

create policy "creator_profiles: verified creators are public"
  on public.creator_profiles for select to anon, authenticated
  using (status = 'verified' or user_id = (select auth.uid()) or private.is_staff());
-- No write policies: only the staff RPCs below change creator status.

-- ── Staff RPCs (VYBR8 Team: admins and moderators) ─────────────────────
create or replace function public.approve_creator_application(p_application_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.creator_applications;
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;

  select * into a from public.creator_applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'application is %', a.status using errcode = '22023'; end if;

  update public.creator_applications
     set status = 'approved', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = a.id;

  insert into public.creator_profiles (user_id, creator_type, status, application_id, verified_by, verified_at)
  values (a.user_id, a.creator_type, 'verified', a.id, auth.uid(), now())
  on conflict (user_id) do update
    set creator_type = excluded.creator_type, status = 'verified', application_id = excluded.application_id,
        verified_by = excluded.verified_by, verified_at = excluded.verified_at, status_note = null;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator.verified', 'profile', a.user_id,
          jsonb_build_object('application_id', a.id, 'creator_type', a.creator_type));
end;
$$;

create or replace function public.reject_creator_application(p_application_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.creator_applications;
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'a reason is required' using errcode = '22023'; end if;

  select * into a from public.creator_applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'application is %', a.status using errcode = '22023'; end if;

  update public.creator_applications
     set status = 'rejected', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = a.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator.application_rejected', 'profile', a.user_id, jsonb_build_object('application_id', a.id));
end;
$$;

create or replace function public.set_creator_status(p_user_id uuid, p_status public.creator_status, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  update public.creator_profiles set status = p_status, status_note = p_note where user_id = p_user_id;
  if not found then raise exception 'not a creator' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator.status_' || p_status, 'profile', p_user_id, jsonb_build_object('note', p_note));
end;
$$;

revoke execute on function public.approve_creator_application(uuid, text) from public, anon;
revoke execute on function public.reject_creator_application(uuid, text) from public, anon;
revoke execute on function public.set_creator_status(uuid, public.creator_status, text) from public, anon;
grant execute on function public.approve_creator_application(uuid, text) to authenticated;
grant execute on function public.reject_creator_application(uuid, text) to authenticated;
grant execute on function public.set_creator_status(uuid, public.creator_status, text) to authenticated;
