-- VYBR8 · Phase 1 · Identity, platform roles, privacy, friendships

-- ── Tables ─────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      extensions.citext not null unique
                check (username::text ~ '^[A-Za-z0-9_.]{3,30}$'),
  display_name  text check (char_length(display_name) <= 60),
  avatar_url    text,
  bio           text check (char_length(bio) <= 280),
  home_city     text,
  home_region   text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.user_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  units               text not null default 'imperial' check (units in ('imperial', 'metric')),
  search_radius_km    numeric(5,1) not null default 15 check (search_radius_km between 0.5 and 500),
  big_back_mode       boolean not null default false,
  notification_prefs  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.privacy_settings (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  profile_visibility   public.visibility not null default 'public',
  ratings_visibility   public.visibility not null default 'public',
  saves_visibility     public.visibility not null default 'friends',
  taste_visibility     public.visibility not null default 'friends',
  activity_visibility  public.visibility not null default 'friends',
  dietary_visibility   public.visibility not null default 'private',
  -- Health data is private, full stop. Relaxing this requires a reviewed migration.
  health_visibility    public.visibility not null default 'private'
                       check (health_visibility = 'private'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.platform_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        public.friendship_status not null default 'pending',
  blocked_by    uuid references public.profiles (id) on delete set null,
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One relationship per pair, regardless of who asked first.
create unique index friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);

create trigger profiles_updated_at          before update on public.profiles          for each row execute function private.set_updated_at();
create trigger user_settings_updated_at     before update on public.user_settings     for each row execute function private.set_updated_at();
create trigger privacy_settings_updated_at  before update on public.privacy_settings  for each row execute function private.set_updated_at();
create trigger friendships_updated_at       before update on public.friendships       for each row execute function private.set_updated_at();

-- ── Helper functions (security definer, fixed search_path) ─────────────

create or replace function private.has_platform_role(p_role public.platform_role)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = p_role
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.has_platform_role('admin'); $$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.has_platform_role('admin') or private.has_platform_role('moderator'); $$;

create or replace function private.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id)    = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

-- Can the current viewer see `owner_id`'s data on a given privacy surface?
-- Surfaces: profile, ratings, saves, taste, activity, dietary, health.
create or replace function private.can_view(owner_id uuid, surface text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  vis    public.visibility;
begin
  if owner_id is null then return false; end if;
  if viewer = owner_id then return true; end if;

  select case surface
           when 'profile'  then p.profile_visibility
           when 'ratings'  then p.ratings_visibility
           when 'saves'    then p.saves_visibility
           when 'taste'    then p.taste_visibility
           when 'activity' then p.activity_visibility
           when 'dietary'  then p.dietary_visibility
           when 'health'   then p.health_visibility
         end
    into vis
    from public.privacy_settings p
   where p.user_id = owner_id;

  if vis is null then return false; end if;          -- unknown surface or no row: deny
  if surface = 'health' then return false; end if;    -- never shared, even with admins
  if private.is_staff() then return true; end if;     -- moderation needs visibility
  if vis = 'public' then return true; end if;
  if vis = 'friends' then return private.are_friends(owner_id, viewer); end if;
  return false;
end;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Sign-up: create profile, settings and privacy rows ─────────────────

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  uname  text;
begin
  if wanted is not null
     and wanted ~ '^[A-Za-z0-9_.]{3,30}$'
     and not exists (select 1 from public.profiles where username = wanted::extensions.citext) then
    uname := wanted;
  else
    uname := 'vyber_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (id, username, display_name, is_demo)
  values (
    new.id,
    uname,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname), 60),
    coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false)
  );
  insert into public.user_settings (user_id) values (new.id);
  insert into public.privacy_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── Guards ─────────────────────────────────────────────────────────────

-- Users cannot flip their own demo flag.
create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin()
     and new.is_demo is distinct from old.is_demo then
    raise exception 'is_demo can only be changed by an admin' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- Friendship state machine.
create or replace function private.friendships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then return new; end if;  -- service role / migrations

  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id
     or (new.blocked_by is distinct from old.blocked_by and new.status is not distinct from old.status) then
    raise exception 'friendship parties cannot change' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') then
      if me <> old.addressee_id or old.status <> 'pending' then
        raise exception 'only the invited person can respond to a pending request' using errcode = '42501';
      end if;
    elsif new.status = 'blocked' then
      new.blocked_by := me;  -- either party may block
    elsif old.status = 'blocked' then
      raise exception 'remove the block instead of changing its status' using errcode = '42501';
    else
      raise exception 'invalid friendship transition % -> %', old.status, new.status using errcode = '42501';
    end if;
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger friendships_guard before update on public.friendships
  for each row execute function private.friendships_guard();

-- ── Row Level Security ─────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.user_settings     enable row level security;
alter table public.privacy_settings  enable row level security;
alter table public.user_roles        enable row level security;
alter table public.friendships       enable row level security;

-- profiles
create policy "profiles: visible per privacy setting"
  on public.profiles for select to anon, authenticated
  using (private.can_view(id, 'profile'));
create policy "profiles: owner updates own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Inserts happen only through the sign-up trigger; deletes cascade from auth.users.

-- user_settings / privacy_settings: owner only
create policy "user_settings: owner reads"   on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "user_settings: owner updates" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "privacy_settings: owner reads"   on public.privacy_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "privacy_settings: owner updates" on public.privacy_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- user_roles: users can see their own roles; admins can see all. No client writes.
create policy "user_roles: read own or admin"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- friendships
create policy "friendships: parties read"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "friendships: send request"
  on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "friendships: parties update"
  on public.friendships for update to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id))
  with check ((select auth.uid()) in (requester_id, addressee_id));
create policy "friendships: parties remove"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id)
         and (status <> 'blocked' or blocked_by = (select auth.uid())));
