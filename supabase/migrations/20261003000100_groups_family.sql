-- VYBR8 · Groups: Family, Dating, Friends, Organizations, For The Kids (FTK)
--
-- • Anyone can make several groups. People are invited and must accept (no one is added to a
--   "family" or "dating" group without saying yes).
-- • Parents/guardians can add kid profiles (no app account needed). Kid profiles hold only a first
--   name, optional birthday, and food tastes, and are visible only to their guardians and the
--   groups the guardian puts them in.
-- • When a kid is 13+, a guardian makes a one-time transfer code. The kid signs up and enters it:
--   the profile becomes theirs, their tastes move over, and they stay in the family.
-- • Groups plan outings (date nights, family dinners) with menu picks per person.

create type public.group_kind as enum ('family', 'dating', 'friends', 'organization', 'ftk');
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.group_member_status as enum ('invited', 'active');
create type public.group_relationship as enum
  ('partner', 'girlfriend', 'boyfriend', 'wife', 'husband', 'spouse', 'fiance', 'parent', 'child', 'sibling', 'grandparent',
   'cousin', 'aunt_uncle', 'relative', 'friend', 'coworker', 'teammate', 'member', 'other');

-- ── Kid profiles (dependents) ──────────────────────────────────────────
create table public.dependents (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null check (char_length(trim(first_name)) between 1 and 40),
  birthdate    date check (birthdate <= current_date),
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  claimed_by   uuid unique references public.profiles (id) on delete set null,   -- set when the kid takes over their profile
  claimed_at   timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.dependent_guardians (
  dependent_id  uuid not null references public.dependents (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (dependent_id, user_id)
);

create or replace function private.is_guardian(p_dependent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.dependent_guardians where dependent_id = p_dependent and user_id = (select auth.uid())); $$;

create or replace function private.guardian_count(p_dependent uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.dependent_guardians where dependent_id = p_dependent; $$;

-- The creator becomes the first guardian.
create or replace function private.dependents_add_guardian()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.dependent_guardians (dependent_id, user_id) values (new.id, new.created_by); return new; end; $$;
create trigger dependents_add_guardian after insert on public.dependents for each row execute function private.dependents_add_guardian();

-- ── Groups ─────────────────────────────────────────────────────────────
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 60),
  kind         public.group_kind not null,
  description  text check (char_length(description) <= 280),
  city_slug    text references public.cities (slug),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger groups_updated_at before update on public.groups for each row execute function private.set_updated_at();

create table public.group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete cascade,
  dependent_id  uuid references public.dependents (id) on delete cascade,
  role          public.group_role not null default 'member',
  status        public.group_member_status not null default 'invited',
  relationship  public.group_relationship not null default 'member',
  invited_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((user_id is null) <> (dependent_id is null)),
  check (dependent_id is null or (status = 'active' and role = 'member'))
);
create unique index group_members_user_idx on public.group_members (group_id, user_id) where user_id is not null;
create unique index group_members_dependent_idx on public.group_members (group_id, dependent_id) where dependent_id is not null;
create index group_members_by_user on public.group_members (user_id) where user_id is not null;

create or replace function private.group_role_of(p_group uuid)
returns public.group_role language sql stable security definer set search_path = ''
as $$ select role from public.group_members where group_id = p_group and user_id = (select auth.uid()) and status = 'active'; $$;

create or replace function private.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.group_role_of(p_group) is not null; $$;

create or replace function private.can_manage_group(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.group_role_of(p_group) in ('owner', 'admin'), false); $$;

-- Groups I share with someone (used to share tastes for planning).
create or replace function private.shares_group_with_user(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
                  where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_user and b.status = 'active');
$$;
create or replace function private.shares_group_with_dependent(p_dependent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
                  where a.user_id = (select auth.uid()) and a.status = 'active' and b.dependent_id = p_dependent);
$$;

create or replace function private.user_is_adult(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select private.age_on(birthdate, current_date) >= 18 from public.user_birthdays where user_id = p_user), false); $$;

-- The owner joins as the first member.
create or replace function private.groups_add_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, relationship, invited_by)
  values (new.id, new.owner_id, 'owner', 'active', case new.kind when 'dating' then 'partner' when 'family' then 'relative' when 'friends' then 'friend' else 'member' end::public.group_relationship, new.owner_id);
  return new;
end;
$$;
create trigger groups_add_owner after insert on public.groups for each row execute function private.groups_add_owner();

create or replace function private.groups_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.is_demo then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.kind = 'dating' and not private.user_is_adult(new.owner_id) then
      raise exception 'dating groups are for people 18 and older' using errcode = '42501';
    end if;
    if (select count(*) from public.groups where owner_id = new.owner_id) >= 25 then
      raise exception 'you can own up to 25 groups' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.owner_id <> old.owner_id or new.kind <> old.kind or new.is_demo <> old.is_demo then
    raise exception 'that change is not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger groups_guard before insert or update on public.groups for each row execute function private.groups_guard();

-- Size limits and safety rules on membership.
create or replace function private.group_members_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare
  g public.groups;
  n integer;
begin
  select * into g from public.groups where id = new.group_id;
  select count(*) into n from public.group_members where group_id = new.group_id and id <> new.id;
  if n >= (case g.kind when 'dating' then 2 when 'family' then 30 when 'friends' then 50 when 'ftk' then 50 else 200 end) then
    raise exception 'this group is full' using errcode = '23514';
  end if;
  if g.kind = 'dating' and (new.dependent_id is not null or (new.user_id is not null and not private.user_is_adult(new.user_id))) then
    raise exception 'dating groups are for two people 18 and older' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_guard before insert on public.group_members for each row execute function private.group_members_guard();

-- ── Tastes (for planning and suggestions) ──────────────────────────────
create table public.taste_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references public.profiles (id) on delete cascade,
  dependent_id  uuid unique references public.dependents (id) on delete cascade,
  likes         text[] not null default '{}' check (array_length(likes, 1) is null or array_length(likes, 1) <= 30),
  dislikes      text[] not null default '{}' check (array_length(dislikes, 1) is null or array_length(dislikes, 1) <= 30),
  allergies     text[] not null default '{}' check (array_length(allergies, 1) is null or array_length(allergies, 1) <= 15),
  dietary       text[] not null default '{}' check (array_length(dietary, 1) is null or array_length(dietary, 1) <= 10),
  spice         smallint check (spice between 0 and 4),       -- 0 none … 4 very hot
  kids_menu     boolean not null default false,
  notes         text check (char_length(notes) <= 280),
  updated_at    timestamptz not null default now(),
  check ((user_id is null) <> (dependent_id is null))
);

-- ── Plans (date nights, family dinners) with menu picks ────────────────
create table public.group_plans (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 2 and 80),
  planned_for   timestamptz,
  business_id   uuid references public.businesses (id) on delete set null,
  notes         text check (char_length(notes) <= 500),
  status        text not null default 'planned' check (status in ('idea', 'planned', 'done', 'cancelled')),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index group_plans_group_idx on public.group_plans (group_id, planned_for);

create table public.group_plan_picks (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.group_plans (id) on delete cascade,
  member_id     uuid not null references public.group_members (id) on delete cascade,   -- who it's for (adult or kid)
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  note          text check (char_length(note) <= 140),
  added_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (plan_id, member_id, menu_item_id)
);

-- ── Transfer codes (kid takes over their profile at 13+) ───────────────
create table public.dependent_transfers (
  id            uuid primary key default gen_random_uuid(),
  dependent_id  uuid not null references public.dependents (id) on delete cascade,
  token_hash    text not null unique,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null default now() + interval '30 days',
  redeemed_by   uuid references public.profiles (id) on delete set null,
  redeemed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.dependents enable row level security;
alter table public.dependent_guardians enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.group_plans enable row level security;
alter table public.group_plan_picks enable row level security;
alter table public.dependent_transfers enable row level security;

-- Kid profiles: guardians, the kid once they've claimed it, and people in a group with them.
create policy "dependents: guardians, claimed kid and shared groups read" on public.dependents for select to authenticated
  using (private.is_guardian(id) or claimed_by = (select auth.uid()) or private.shares_group_with_dependent(id));
create policy "dependents: parents add kids" on public.dependents for insert to authenticated
  with check (created_by = (select auth.uid()) and claimed_by is null and not is_demo);
create policy "dependents: guardians edit until the kid takes over" on public.dependents for update to authenticated
  using (private.is_guardian(id) and claimed_by is null)
  with check (private.is_guardian(id) and claimed_by is null);
create policy "dependents: guardians remove until the kid takes over" on public.dependents for delete to authenticated
  using (private.is_guardian(id) and claimed_by is null);

create policy "dependent_guardians: guardians read" on public.dependent_guardians for select to authenticated
  using (private.is_guardian(dependent_id) or user_id = (select auth.uid()));
-- A guardian can add a co-parent (who must be in a family group with them).
create policy "dependent_guardians: guardians add co-parents" on public.dependent_guardians for insert to authenticated
  with check (private.is_guardian(dependent_id) and private.shares_group_with_user(user_id)
              and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null));
create policy "dependent_guardians: step back" on public.dependent_guardians for delete to authenticated
  using (user_id = (select auth.uid()) and private.guardian_count(dependent_id) > 1);

create policy "groups: members and invitees read" on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or exists (select 1 from public.group_members m where m.group_id = groups.id and m.user_id = (select auth.uid())));
create policy "groups: anyone creates" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "groups: owner and admins edit" on public.groups for update to authenticated
  using (private.can_manage_group(id)) with check (private.can_manage_group(id));
create policy "groups: owner deletes" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

create policy "group_members: members see the group; invitees see their invite" on public.group_members for select to authenticated
  using (private.is_group_member(group_id) or user_id = (select auth.uid()));
-- Owners/admins invite people (status invited; they must accept) and add kids they're a guardian of.
create policy "group_members: invite or add your kid" on public.group_members for insert to authenticated
  with check (private.can_manage_group(group_id) and role <> 'owner' and invited_by = (select auth.uid())
              and ((user_id is not null and status = 'invited' and not private.is_blocked_between((select auth.uid()), user_id))
                   or (dependent_id is not null and private.is_guardian(dependent_id))));
-- Invitees accept for themselves; owners/admins change relationship labels or promote members.
create policy "group_members: accept, relabel, promote" on public.group_members for update to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_group(group_id))
  with check (user_id = (select auth.uid()) or private.can_manage_group(group_id));
create policy "group_members: leave, decline or remove" on public.group_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner') or (private.can_manage_group(group_id) and role <> 'owner')
         or (dependent_id is not null and private.is_guardian(dependent_id)));

-- Members can't promote themselves or flip someone else's invite to active.
create or replace function private.group_members_update_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.group_id <> old.group_id or new.user_id is distinct from old.user_id or new.dependent_id is distinct from old.dependent_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new.status <> old.status and (old.user_id is distinct from (select auth.uid()) or new.status <> 'active') then
    raise exception 'only the invited person can accept' using errcode = '42501';
  end if;
  if new.role <> old.role and (old.role = 'owner' or new.role = 'owner' or private.group_role_of(new.group_id) <> 'owner') then
    raise exception 'only the owner changes roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_update_guard before update on public.group_members for each row execute function private.group_members_update_guard();

-- Tastes: your own; kids' by their guardians; shared with people in your groups for planning.
create policy "taste_profiles: own, kids and group members read" on public.taste_profiles for select to authenticated
  using (user_id = (select auth.uid())
         or (user_id is not null and private.shares_group_with_user(user_id))
         or (dependent_id is not null and (private.is_guardian(dependent_id) or private.shares_group_with_dependent(dependent_id))));
create policy "taste_profiles: own or your kid's" on public.taste_profiles for insert to authenticated
  with check (user_id = (select auth.uid())
              or (dependent_id is not null and private.is_guardian(dependent_id) and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null)));
create policy "taste_profiles: edit own or your kid's" on public.taste_profiles for update to authenticated
  using (user_id = (select auth.uid()) or (dependent_id is not null and private.is_guardian(dependent_id)
         and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null)))
  with check (user_id = (select auth.uid()) or (dependent_id is not null and private.is_guardian(dependent_id)));

create policy "group_plans: members" on public.group_plans for select to authenticated using (private.is_group_member(group_id));
create policy "group_plans: members plan" on public.group_plans for insert to authenticated
  with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "group_plans: members update" on public.group_plans for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy "group_plans: creator or managers delete" on public.group_plans for delete to authenticated
  using (created_by = (select auth.uid()) or private.can_manage_group(group_id));

create policy "group_plan_picks: members" on public.group_plan_picks for select to authenticated
  using (exists (select 1 from public.group_plans p where p.id = plan_id and private.is_group_member(p.group_id)));
create policy "group_plan_picks: members pick for anyone in the group" on public.group_plan_picks for insert to authenticated
  with check (added_by = (select auth.uid())
              and exists (select 1 from public.group_plans p join public.group_members m on m.group_id = p.group_id
                           where p.id = plan_id and m.id = member_id and private.is_group_member(p.group_id))
              -- no alcohol picks for kids or anyone under 21 on the plan's day
              and not exists (select 1 from public.menu_items i join public.group_members m on m.id = member_id
                               where i.id = menu_item_id and i.is_alcoholic
                                 and (m.dependent_id is not null or not private.user_21_on(m.user_id, current_date))));
create policy "group_plan_picks: members remove" on public.group_plan_picks for delete to authenticated
  using (exists (select 1 from public.group_plans p where p.id = plan_id and private.is_group_member(p.group_id)));

create policy "dependent_transfers: guardians read" on public.dependent_transfers for select to authenticated
  using (private.is_guardian(dependent_id));
-- Created and redeemed only through the functions below.

-- ── Transfer: kid takes over at 13+ and stays in the family ────────────
create or replace function public.create_dependent_transfer(p_dependent uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not private.is_guardian(p_dependent) then raise exception 'guardians only' using errcode = '42501'; end if;
  if exists (select 1 from public.dependents where id = p_dependent and claimed_by is not null) then
    raise exception 'this profile already belongs to them' using errcode = '22023';
  end if;
  delete from public.dependent_transfers where dependent_id = p_dependent and redeemed_at is null;
  insert into public.dependent_transfers (dependent_id, token_hash, created_by)
  values (p_dependent, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  return token;
end;
$$;

create or replace function public.redeem_dependent_transfer(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t public.dependent_transfers;
  d public.dependents;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into t from public.dependent_transfers
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if not found or t.redeemed_at is not null or t.expires_at < now() then raise exception 'this code is not valid' using errcode = 'P0002'; end if;
  select * into d from public.dependents where id = t.dependent_id for update;
  if d.claimed_by is not null then raise exception 'this profile already belongs to someone' using errcode = '22023'; end if;
  if exists (select 1 from public.dependent_guardians where dependent_id = d.id and user_id = me) then
    raise exception 'a parent can''t take over their kid''s profile' using errcode = '42501';
  end if;
  if coalesce((select private.age_on(birthdate, current_date) from public.user_birthdays where user_id = me), 0) < 13 then
    raise exception 'you need to be 13 or older' using errcode = '42501';
  end if;

  update public.dependents set claimed_by = me, claimed_at = now() where id = d.id;
  update public.dependent_transfers set redeemed_by = me, redeemed_at = now() where id = t.id;

  -- Stay in every group: kid rows become their own account's rows.
  insert into public.group_members (group_id, user_id, role, status, relationship, invited_by)
  select m.group_id, me, 'member', 'active', m.relationship, m.invited_by
    from public.group_members m join public.groups g on g.id = m.group_id
   where m.dependent_id = d.id and g.kind <> 'dating'
  on conflict do nothing;
  update public.group_plan_picks p set member_id = nm.id
    from public.group_members om, public.group_members nm
   where p.member_id = om.id and om.dependent_id = d.id and nm.group_id = om.group_id and nm.user_id = me;
  delete from public.group_members where dependent_id = d.id;

  -- Their tastes come with them (unless they already set their own).
  if exists (select 1 from public.taste_profiles where user_id = me) then
    delete from public.taste_profiles where dependent_id = d.id;
  else
    update public.taste_profiles set dependent_id = null, user_id = me, updated_at = now() where dependent_id = d.id;
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  select g.user_id, 'family.transfer', d.first_name || ' has their own VYBR8 now',
         'Their profile moved to their account. They''re still in your family.', '/groups'
    from public.dependent_guardians g where g.dependent_id = d.id;
  return d.id;
end;
$$;

revoke execute on function public.create_dependent_transfer(uuid) from public, anon;
revoke execute on function public.redeem_dependent_transfer(text) from public, anon;
grant execute on function public.create_dependent_transfer(uuid) to authenticated;
grant execute on function public.redeem_dependent_transfer(text) to authenticated;

-- Invite notifications.
create or replace function private.group_invite_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null and new.status = 'invited' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select new.user_id, 'group.invite', 'You''re invited to a group',
           coalesce((select coalesce(display_name, username::text) from public.profiles where id = new.invited_by), 'Someone') || ' invited you to ' || g.name,
           '/groups', 'group.invite:' || new.id
      from public.groups g where g.id = new.group_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger group_members_invite_notify after insert on public.group_members for each row execute function private.group_invite_notify();

grant execute on all functions in schema private to anon, authenticated, service_role;
