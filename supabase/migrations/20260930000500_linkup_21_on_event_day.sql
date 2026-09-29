-- VYBR8 · Drinks Link Ups: you must be 21 on the day of the event, not the day you RSVP.
-- Lets people plan their 21st birthday night ahead of time. Everything else about alcohol is unchanged.

-- The calendar day a Link Up starts, in its city's time zone.
create or replace function private.linkup_day(p_starts_at timestamptz, p_city text)
returns date
language sql stable security definer
set search_path = ''
as $$
  select (p_starts_at at time zone coalesce((select timezone from public.cities where slug = p_city), 'America/New_York'))::date;
$$;

create or replace function private.user_21_on(p_user uuid, p_day date)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select private.age_on(birthdate, p_day) >= 21 from public.user_birthdays where user_id = p_user), false);
$$;

create or replace function private.viewer_21_for_linkup(p_starts_at timestamptz, p_city text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_staff() or private.user_21_on((select auth.uid()), private.linkup_day(p_starts_at, p_city));
$$;

grant execute on function private.linkup_day(timestamptz, text), private.user_21_on(uuid, date),
  private.viewer_21_for_linkup(timestamptz, text) to anon, authenticated, service_role;

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

create or replace function public.invite_to_linkup(p_linkup uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  l public.linkups;
  me uuid := auth.uid();
begin
  select * into l from public.linkups where id = p_linkup;
  if not found or not (l.host_id = me or private.linkup_member_status(p_linkup) = 'going') then
    raise exception 'only people in the Link Up can invite' using errcode = '42501';
  end if;
  if not private.are_friends(me, p_user) then raise exception 'you can invite friends on VYBR8, or send a guest link' using errcode = '42501'; end if;
  if l.is_alcoholic and not private.user_21_on(p_user, private.linkup_day(l.starts_at, l.city_slug)) then raise exception 'drinks Link Ups are for people who are 21 by the day it happens' using errcode = '42501'; end if;
  insert into public.linkup_members (linkup_id, user_id, status, invited_by)
  values (p_linkup, p_user, 'invited', me)
  on conflict (linkup_id, user_id) do update set status = 'invited', invited_by = me, updated_at = now()
    where public.linkup_members.status in ('declined', 'left');
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, 'linkup.invited', 'You''re invited to a Link Up',
          (select coalesce(display_name, username::text) from public.profiles where id = me) || ' invited you: ' || l.title,
          '/vybe/' || l.id);
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
     or private.age_on(p_birthdate, current_date) < 13 then
    raise exception '%', case when l.is_alcoholic then 'this Link Up is for people who are 21 by the day it happens' else 'VYBR8 is for people 13 and older' end using errcode = '23514';
  end if;
  if private.linkup_spots_taken(l.id) >= l.capacity then raise exception 'this Link Up is full' using errcode = '23514'; end if;
  update public.linkup_invites
     set status = 'accepted', guest_name = left(trim(p_name), 40), guest_birthdate = p_birthdate, accepted_at = now()
   where id = i.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (l.host_id, 'linkup.guest_accepted', 'A guest accepted your invite', left(trim(p_name), 40) || ' · ' || l.title, '/vybe/' || l.id);
end;
$$;

-- Hosts can always read their own Link Up (needed to read back a new row right after creating it).
drop policy "linkups: visible per visibility, age and membership" on public.linkups;
create policy "linkups: visible per visibility, age and membership"
  on public.linkups for select to anon, authenticated
  using (host_id = (select auth.uid()) or private.can_see_linkup(id));
