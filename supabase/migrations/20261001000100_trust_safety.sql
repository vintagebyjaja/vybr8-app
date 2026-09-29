-- VYBR8 · Trust & safety
--  • Founder outranks the VYBR8 Team: the team can remove content; the founder can uphold or veto
--  • Creators prove their accounts (Instagram / TikTok / YouTube + a proof code in their bio)
--  • Profile photos (public avatars bucket); a photo is required to host or join a Link Up
--  • Public and meet-new-friends Link Ups are 18+ (they bring strangers together)
--  • Identity verification records (ID + selfie through a provider; VYBR8 never stores face data)

-- ── Founder ────────────────────────────────────────────────────────────
alter table public.team_members add column is_founder boolean not null default false;
create unique index team_members_one_founder on public.team_members (is_founder) where is_founder;

create or replace function private.is_founder()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.team_members where user_id = (select auth.uid()) and is_founder); $$;

-- Only the founder (or the service role) can change who is on the team or who is founder.
create or replace function private.team_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_founder() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.is_founder is not distinct from old.is_founder and new.user_id = (select auth.uid()) then
    return new;  -- team members may edit their own title/bio
  end if;
  raise exception 'only the founder manages the VYBR8 Team' using errcode = '42501';
end;
$$;
create trigger team_members_guard before insert or update or delete on public.team_members
  for each row execute function private.team_members_guard();

-- ── Age helper ─────────────────────────────────────────────────────────
create or replace function private.viewer_is_adult()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_staff() or coalesce((select private.age_on(birthdate, current_date) >= 18
                                          from public.user_birthdays where user_id = (select auth.uid())), false);
$$;

-- ── Profile photos ─────────────────────────────────────────────────────
-- avatar_url holds a path in the public "avatars" bucket ("<user id>/<file>") or a bundled demo image.
update public.profiles set avatar_url = null where avatar_url is not null;
alter table public.profiles add constraint profiles_avatar_path check (
  avatar_url is null
  or (split_part(avatar_url, '/', 1) = id::text and avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$')
  or avatar_url ~ '^/demo/avatars/[a-z0-9_-]{1,40}\.(svg|webp|png|jpg)$'
);

create or replace function private.has_profile_photo(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce((select avatar_url is not null from public.profiles where id = p_user), false); $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: upload to your own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: replace your own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: delete your own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

-- ── Creator proof ──────────────────────────────────────────────────────
-- Applicants link at least one Instagram, TikTok or YouTube account and put their proof code in its bio
-- (or a recent post/caption) so the team can confirm they own it.
alter table public.creator_applications
  add column proof_code text not null default ('VYBR8-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  add column proof_confirmed_by uuid references public.profiles (id) on delete set null,
  add column proof_confirmed_at timestamptz;

create or replace function private.has_social_proof_link(p_links jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select exists (select 1 from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) l
                 where l->>'url' ~* '^https://(www\.|m\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)/');
$$;

create or replace function private.creator_applications_proof_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select auth.uid()) is not null and not private.is_staff() then
    if not private.has_social_proof_link(new.links) then
      raise exception 'link your Instagram, TikTok or YouTube so we can verify you' using errcode = '23514';
    end if;
    new.proof_confirmed_by := null; new.proof_confirmed_at := null;
  end if;
  return new;
end;
$$;
create trigger creator_applications_proof_guard before insert on public.creator_applications
  for each row execute function private.creator_applications_proof_guard();

-- Team confirms they saw the proof code on the applicant's account; approval requires it.
create or replace function public.confirm_creator_proof(p_application_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  update public.creator_applications set proof_confirmed_by = auth.uid(), proof_confirmed_at = now()
   where id = p_application_id and status = 'pending';
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (auth.uid(), 'creator.proof_confirmed', 'creator_application', p_application_id);
end;
$$;
revoke execute on function public.confirm_creator_proof(uuid) from public, anon;
grant execute on function public.confirm_creator_proof(uuid) to authenticated;

create or replace function private.creator_approval_needs_proof()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status = 'pending' and new.proof_confirmed_at is null and not private.is_founder() then
    raise exception 'confirm the proof code on their Instagram, TikTok or YouTube first' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger creator_approval_needs_proof before update on public.creator_applications
  for each row execute function private.creator_approval_needs_proof();

-- ── Moderation with founder override ───────────────────────────────────
create type public.moderation_target as enum ('post', 'comment', 'linkup', 'perk');
create type public.founder_decision  as enum ('upheld', 'vetoed');

create table public.moderation_actions (
  id               uuid primary key default gen_random_uuid(),
  target_type      public.moderation_target not null,
  target_id        uuid not null,
  reason           text not null check (char_length(trim(reason)) between 3 and 500),
  previous_status  text not null,
  taken_by         uuid references public.profiles (id) on delete set null,
  taken_at         timestamptz not null default now(),
  founder_decision public.founder_decision,
  founder_note     text check (char_length(founder_note) <= 500),
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, taken_at desc);
create index moderation_actions_open_idx on public.moderation_actions (taken_at desc) where founder_decision is null;
alter table public.moderation_actions enable row level security;
create policy "moderation_actions: team reads" on public.moderation_actions for select to authenticated using (private.is_staff());
-- No direct writes: use team_remove / founder_decide.

create or replace function private.moderation_status(p_type public.moderation_target, p_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case p_type
    when 'post'    then (select status::text from public.posts where id = p_id)
    when 'comment' then (select status::text from public.post_comments where id = p_id)
    when 'linkup'  then (select status::text from public.linkups where id = p_id)
    when 'perk'    then (select status::text from public.birthday_perks where id = p_id)
  end;
$$;

create or replace function private.set_moderation_status(p_type public.moderation_target, p_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  case p_type
    when 'post'    then update public.posts set status = p_status::public.content_status where id = p_id;
    when 'comment' then update public.post_comments set status = p_status::public.content_status where id = p_id;
    when 'linkup'  then update public.linkups set status = p_status::public.linkup_status where id = p_id;
    when 'perk'    then update public.birthday_perks set status = p_status::public.perk_status where id = p_id;
  end case;
end;
$$;

-- Team (admins and moderators) remove content. If the founder already vetoed a removal of this
-- item, only the founder can remove it again: the founder's decision outranks the team.
create or replace function public.team_remove(p_type public.moderation_target, p_id uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  prev text := private.moderation_status(p_type, p_id);
  removed text := case p_type when 'linkup' then 'cancelled' when 'perk' then 'rejected' else 'removed' end;
  action_id uuid;
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  if prev is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if prev = removed then raise exception 'already removed' using errcode = '22023'; end if;
  if not private.is_founder() and exists (
       select 1 from public.moderation_actions
        where target_type = p_type and target_id = p_id and founder_decision = 'vetoed') then
    raise exception 'the founder decided to keep this; ask the founder' using errcode = '42501';
  end if;
  perform private.set_moderation_status(p_type, p_id, removed);
  insert into public.moderation_actions (target_type, target_id, reason, previous_status, taken_by,
                                         founder_decision, decided_by, decided_at)
  values (p_type, p_id, trim(p_reason), prev, auth.uid(),
          case when private.is_founder() then 'upheld'::public.founder_decision end,
          case when private.is_founder() then auth.uid() end,
          case when private.is_founder() then now() end)
  returning id into action_id;
  update public.reports set status = 'actioned', handled_by = auth.uid(), handled_at = now()
   where target_type = p_type::text and target_id = p_id and status = 'open';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'moderation.remove', p_type::text, p_id, jsonb_build_object('reason', trim(p_reason), 'action_id', action_id));
  return action_id;
end;
$$;

-- Founder: uphold (double down) or veto (restore). Final.
create or replace function public.founder_decide(p_action uuid, p_decision public.founder_decision, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.moderation_actions;
begin
  if not private.is_founder() then raise exception 'founder only' using errcode = '42501'; end if;
  select * into a from public.moderation_actions where id = p_action for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_decision = 'vetoed' then perform private.set_moderation_status(a.target_type, a.target_id, a.previous_status); end if;
  if p_decision = 'upheld' and a.founder_decision = 'vetoed' then
    perform private.set_moderation_status(a.target_type, a.target_id,
      case a.target_type when 'linkup' then 'cancelled' when 'perk' then 'rejected' else 'removed' end);
  end if;
  update public.moderation_actions
     set founder_decision = p_decision, founder_note = p_note, decided_by = auth.uid(), decided_at = now()
   where id = p_action;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'moderation.founder_' || p_decision, a.target_type::text, a.target_id, jsonb_build_object('action_id', p_action, 'note', p_note));
end;
$$;

revoke execute on function public.team_remove(public.moderation_target, uuid, text) from public, anon;
revoke execute on function public.founder_decide(uuid, public.founder_decision, text) from public, anon;
grant execute on function public.team_remove(public.moderation_target, uuid, text) to authenticated;
grant execute on function public.founder_decide(uuid, public.founder_decision, text) to authenticated;

-- ── Identity verification (ID + selfie through a provider) ─────────────
-- VYBR8 stores only the outcome. Face images and ID documents stay with the provider.
create type public.identity_status as enum ('unverified', 'pending', 'verified', 'failed', 'expired');
create table public.identity_verifications (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  provider      text not null check (char_length(provider) <= 40),
  provider_ref  text check (char_length(provider_ref) <= 200),
  status        public.identity_status not null default 'pending',
  verified_at   timestamptz,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.identity_verifications enable row level security;
create policy "identity_verifications: owner and team read"
  on public.identity_verifications for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
-- Written only by the provider webhook with the service role.

-- Public "ID verified" badge (no details).
create or replace function public.identity_verified(p_users uuid[])
returns table (user_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select v.user_id from public.identity_verifications v
   where v.user_id = any (p_users) and v.status = 'verified' and (v.expires_at is null or v.expires_at > now());
$$;
grant execute on function public.identity_verified(uuid[]) to anon, authenticated;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Link Ups: photos, 18+ for public ones ──────────────────────────────
create or replace function private.can_see_linkup(p_linkup uuid)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  l public.linkups;
  me uuid := (select auth.uid());
  mine public.member_status;
begin
  select * into l from public.linkups where id = p_linkup;
  if not found then return false; end if;
  if private.is_staff() or l.host_id = me then return true; end if;
  mine := private.linkup_member_status(p_linkup);
  if mine in ('going', 'requested', 'invited') then return true; end if;
  if l.status <> 'active' or l.ends_at < now() then return false; end if;
  if l.is_alcoholic and not private.viewer_21_for_linkup(l.starts_at, l.city_slug) then return false; end if;
  if me is not null and private.is_blocked_between(me, l.host_id) then return false; end if;
  -- Public and "meet new friends" Link Ups bring strangers together: 18+ only.
  if (l.visibility = 'public' or l.open_to_new_friends) and not private.viewer_is_adult() then return false; end if;
  return case l.visibility
           when 'public'  then true
           when 'friends' then private.are_friends(l.host_id, me)
           else false
         end;
end;
$$;

create or replace function private.linkups_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null and not private.is_staff() then
      if new.is_demo then raise exception 'only admins create demo records' using errcode = '42501'; end if;
      if new.starts_at < now() - interval '10 minutes' then raise exception 'a Link Up cannot start in the past' using errcode = '23514'; end if;
      if new.starts_at > now() + interval '90 days' then raise exception 'plan up to 90 days ahead' using errcode = '23514'; end if;
      if not private.has_profile_photo((select auth.uid())) then
        raise exception 'add a profile photo before you host a Link Up' using errcode = '42501';
      end if;
      if (new.visibility = 'public' or new.open_to_new_friends) and not private.viewer_is_adult() then
        raise exception 'public and meet-new-friends Link Ups are for people 18 and older' using errcode = '42501';
      end if;
      if new.is_alcoholic and not private.viewer_21_for_linkup(new.starts_at, new.city_slug) then
        raise exception 'you can host a drinks Link Up that starts on or after your 21st birthday' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  if new.host_id <> old.host_id or new.is_demo <> old.is_demo or new.created_at <> old.created_at then
    raise exception 'that change is not allowed on a Link Up' using errcode = '42501';
  end if;
  if (new.visibility = 'public' or new.open_to_new_friends) and not (old.visibility = 'public' or old.open_to_new_friends)
     and not private.viewer_is_adult() then
    raise exception 'public and meet-new-friends Link Ups are for people 18 and older' using errcode = '42501';
  end if;
  if new.capacity < private.linkup_spots_taken(new.id) then
    raise exception 'more people are going than that' using errcode = '23514';
  end if;
  if new.is_alcoholic and (not old.is_alcoholic or new.starts_at <> old.starts_at or new.city_slug <> old.city_slug) then
    -- Everyone going must be 21 on the (new) event day.
    if exists (select 1 from public.linkup_members m where m.linkup_id = new.id and m.status in ('going', 'requested', 'invited')
                and not private.user_21_on(m.user_id, private.linkup_day(new.starts_at, new.city_slug)))
    or exists (select 1 from public.linkup_invites i where i.linkup_id = new.id and i.status = 'accepted'
                and private.age_on(i.guest_birthdate, private.linkup_day(new.starts_at, new.city_slug)) < 21) then
      raise exception 'everyone in a drinks Link Up must be 21 by the day it happens' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.join_linkup(p_linkup uuid)
returns public.member_status
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.linkups;
  current_status public.member_status;
  next_status public.member_status;
begin
  if me is null then raise exception 'sign in to join' using errcode = '42501'; end if;
  select * into l from public.linkups where id = p_linkup for update;
  if not found or not private.can_see_linkup(p_linkup) then raise exception 'Link Up not found' using errcode = 'P0002'; end if;
  if l.status <> 'active' or l.ends_at < now() then raise exception 'this Link Up is over' using errcode = '22023'; end if;
  if not private.has_profile_photo(me) then raise exception 'add a profile photo so the group knows who is coming' using errcode = '42501'; end if;
  if (l.visibility = 'public' or l.open_to_new_friends) and not private.viewer_is_adult() then
    raise exception 'public and meet-new-friends Link Ups are for people 18 and older' using errcode = '42501';
  end if;
  if l.is_alcoholic and not private.viewer_21_for_linkup(l.starts_at, l.city_slug) then raise exception 'drinks Link Ups are for people who are 21 by the day it happens' using errcode = '42501'; end if;
  select status into current_status from public.linkup_members where linkup_id = p_linkup and user_id = me;
  if current_status in ('going', 'requested') then return current_status; end if;
  if current_status = 'removed' then raise exception 'the host removed you from this Link Up' using errcode = '42501'; end if;

  -- Invited people and open Link Ups join straight away; others ask the host.
  next_status := case when current_status = 'invited' or l.join_mode = 'open' then 'going' else 'requested' end;
  if next_status = 'going' and private.linkup_spots_taken(p_linkup) >= l.capacity then
    raise exception 'this Link Up is full' using errcode = '23514';
  end if;

  insert into public.linkup_members (linkup_id, user_id, status)
  values (p_linkup, me, next_status)
  on conflict (linkup_id, user_id) do update set status = excluded.status, updated_at = now();

  insert into public.notifications (user_id, kind, title, body, link)
  select l.host_id,
         case when next_status = 'going' then 'linkup.joined' else 'linkup.requested' end,
         case when next_status = 'going' then 'Someone joined your Link Up' else 'New request for your Link Up' end,
         (select coalesce(display_name, username::text) from public.profiles where id = me) || ' · ' || l.title,
         '/vybe/' || l.id
  where l.host_id <> me;
  return next_status;
end;
$$;

create or replace function public.guest_accept_invite(p_token text, p_name text, p_birthdate date)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  i public.linkup_invites := private.invite_by_token(p_token);
  l public.linkups;
begin
  if i.id is null or i.status = 'revoked' then raise exception 'this invite link is not valid' using errcode = 'P0002'; end if;
  if i.status = 'accepted' then return; end if;
  select * into l from public.linkups where id = i.linkup_id for update;
  if l.status <> 'active' or l.ends_at < now() then raise exception 'this Link Up is over' using errcode = '22023'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'enter your name' using errcode = '22023'; end if;
  if p_birthdate is null or (l.is_alcoholic and private.age_on(p_birthdate, private.linkup_day(l.starts_at, l.city_slug)) < 21)
     or private.age_on(p_birthdate, current_date) < (case when l.visibility = 'public' or l.open_to_new_friends then 18 else 13 end) then
    raise exception '%', case when l.is_alcoholic then 'this Link Up is for people who are 21 by the day it happens' when l.visibility = 'public' or l.open_to_new_friends then 'this Link Up is for people 18 and older' else 'VYBR8 is for people 13 and older' end using errcode = '23514';
  end if;
  if private.linkup_spots_taken(l.id) >= l.capacity then raise exception 'this Link Up is full' using errcode = '23514'; end if;
  update public.linkup_invites
     set status = 'accepted', guest_name = left(trim(p_name), 40), guest_birthdate = p_birthdate, accepted_at = now()
   where id = i.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (l.host_id, 'linkup.guest_accepted', 'A guest accepted your invite', left(trim(p_name), 40) || ' · ' || l.title, '/vybe/' || l.id);
end;
$$;
