-- VYBR8 · Link Ups: meetups with up to 10 spots, guest invites for people without VYBR8,
-- and a group chat that disappears when the Link Up ends.

create type public.linkup_occasion   as enum ('girls_night', 'guys_night', 'dinner', 'drinks', 'brunch', 'happy_hour', 'birthday', 'date_night', 'game_night', 'meet_new_friends', 'other');
create type public.linkup_visibility as enum ('public', 'friends', 'invite_only');
create type public.linkup_join_mode  as enum ('open', 'request');
create type public.linkup_status     as enum ('active', 'cancelled');
create type public.member_status     as enum ('going', 'requested', 'invited', 'declined', 'left', 'removed');
create type public.invite_status     as enum ('pending', 'accepted', 'declined', 'revoked');

-- ── Tables ─────────────────────────────────────────────────────────────
create table public.linkups (
  id                   uuid primary key default gen_random_uuid(),
  host_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title                text not null check (char_length(trim(title)) between 3 and 80),
  occasion             public.linkup_occasion not null default 'other',
  description          text check (char_length(description) <= 1000),
  city_slug            text not null references public.cities (slug),
  business_id          uuid references public.businesses (id) on delete set null,
  meet_point           text check (char_length(meet_point) <= 120),     -- when not at a listed place
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  capacity             smallint not null check (capacity between 2 and 10),  -- total spots, host included
  visibility           public.linkup_visibility not null default 'public',
  join_mode            public.linkup_join_mode not null default 'open',
  open_to_new_friends  boolean not null default false,
  is_alcoholic         boolean not null default false,                -- drinks involved: 21+
  status               public.linkup_status not null default 'active',
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  check (business_id is not null or meet_point is not null)
);
create index linkups_city_time_idx on public.linkups (city_slug, starts_at) where status = 'active';
create index linkups_host_idx on public.linkups (host_id);
create trigger linkups_updated_at before update on public.linkups for each row execute function private.set_updated_at();

create table public.linkup_members (
  linkup_id   uuid not null references public.linkups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.member_status not null,
  is_host     boolean not null default false,
  invited_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (linkup_id, user_id)
);
create index linkup_members_user_idx on public.linkup_members (user_id, status);

-- Guests: people without a VYBR8 account, invited by a private link.
create table public.linkup_invites (
  id             uuid primary key default gen_random_uuid(),
  linkup_id      uuid not null references public.linkups (id) on delete cascade,
  created_by     uuid not null references public.profiles (id) on delete cascade,
  token_hash     text not null unique,                 -- sha256 of the link token; the token itself is never stored
  label          text check (char_length(label) <= 60), -- "Aaliyah" (who the host meant it for)
  status         public.invite_status not null default 'pending',
  guest_name     text check (char_length(guest_name) between 1 and 40),
  guest_birthdate date,                                -- only kept to check age for the event
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index linkup_invites_linkup_idx on public.linkup_invites (linkup_id);

create table public.linkup_messages (
  id          uuid primary key default gen_random_uuid(),
  linkup_id   uuid not null references public.linkups (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete cascade,
  invite_id   uuid references public.linkup_invites (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  check ((user_id is null) <> (invite_id is null))
);
create index linkup_messages_linkup_idx on public.linkup_messages (linkup_id, created_at);

-- ── Helpers ────────────────────────────────────────────────────────────
create or replace function private.linkup_member_status(p_linkup uuid)
returns public.member_status
language sql stable security definer
set search_path = ''
as $$ select status from public.linkup_members where linkup_id = p_linkup and user_id = (select auth.uid()); $$;

create or replace function private.is_linkup_host(p_linkup uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.linkups where id = p_linkup and host_id = (select auth.uid())); $$;

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
  if l.is_alcoholic and not private.viewer_is_21_plus() then return false; end if;
  if me is not null and private.is_blocked_between(me, l.host_id) then return false; end if;
  return case l.visibility
           when 'public'  then true
           when 'friends' then private.are_friends(l.host_id, me)
           else false
         end;
end;
$$;

-- Spots taken = members going + guests who accepted.
create or replace function private.linkup_spots_taken(p_linkup uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select (select count(*) from public.linkup_members where linkup_id = p_linkup and status = 'going')::int
       + (select count(*) from public.linkup_invites where linkup_id = p_linkup and status = 'accepted')::int;
$$;

create or replace function private.can_chat(p_linkup uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.linkups l
    where l.id = p_linkup and l.status = 'active' and l.ends_at > now()
      and (l.host_id = (select auth.uid()) or private.linkup_member_status(p_linkup) = 'going')
  );
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Guards ─────────────────────────────────────────────────────────────
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
      if new.is_alcoholic and not private.viewer_is_21_plus() then raise exception 'drinks Link Ups are 21+' using errcode = '42501'; end if;
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
  if new.is_alcoholic and not old.is_alcoholic and not private.viewer_is_21_plus() then
    raise exception 'drinks Link Ups are 21+' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger linkups_guard before insert or update on public.linkups for each row execute function private.linkups_guard();

-- The host is always the first member.
create or replace function private.linkups_add_host()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.linkup_members (linkup_id, user_id, status, is_host) values (new.id, new.host_id, 'going', true);
  return new;
end;
$$;
create trigger linkups_add_host after insert on public.linkups for each row execute function private.linkups_add_host();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.linkups          enable row level security;
alter table public.linkup_members   enable row level security;
alter table public.linkup_invites   enable row level security;
alter table public.linkup_messages  enable row level security;

create policy "linkups: visible per visibility, age and membership"
  on public.linkups for select to anon, authenticated
  using (private.can_see_linkup(id));
create policy "linkups: host creates"
  on public.linkups for insert to authenticated
  with check (host_id = (select auth.uid()) and status = 'active'
              and (business_id is null or exists (select 1 from public.businesses b where b.id = business_id)));
create policy "linkups: host edits"
  on public.linkups for update to authenticated
  using (host_id = (select auth.uid()) or private.is_staff())
  with check (host_id = (select auth.uid()) or private.is_staff());

-- Member lists: people in the Link Up see everyone; outsiders see only who is going.
create policy "linkup_members: visible with the Link Up"
  on public.linkup_members for select to authenticated
  using (private.can_see_linkup(linkup_id)
         and (status = 'going' or user_id = (select auth.uid()) or private.is_linkup_host(linkup_id)));
-- No direct writes: joining, leaving, approving and inviting go through the functions below.

create policy "linkup_invites: host reads"
  on public.linkup_invites for select to authenticated
  using (private.is_linkup_host(linkup_id) or private.is_staff());

create policy "linkup_messages: chat members read until it ends"
  on public.linkup_messages for select to authenticated
  using (private.can_chat(linkup_id));
create policy "linkup_messages: chat members post until it ends"
  on public.linkup_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and invite_id is null and private.can_chat(linkup_id));

-- ── Member actions ─────────────────────────────────────────────────────
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
  if l.is_alcoholic and not private.viewer_is_21_plus() then raise exception 'drinks Link Ups are 21+' using errcode = '42501'; end if;
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

create or replace function public.leave_linkup(p_linkup uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_linkup_host(p_linkup) then raise exception 'hosts cancel the Link Up instead of leaving' using errcode = '22023'; end if;
  update public.linkup_members set status = case when status = 'invited' then 'declined'::public.member_status else 'left'::public.member_status end, updated_at = now()
   where linkup_id = p_linkup and user_id = auth.uid() and status in ('going', 'requested', 'invited');
end;
$$;

create or replace function public.respond_to_request(p_linkup uuid, p_user uuid, p_approve boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  l public.linkups;
begin
  if not private.is_linkup_host(p_linkup) then raise exception 'host only' using errcode = '42501'; end if;
  select * into l from public.linkups where id = p_linkup for update;
  if p_approve and private.linkup_spots_taken(p_linkup) >= l.capacity then
    raise exception 'this Link Up is full' using errcode = '23514';
  end if;
  update public.linkup_members
     set status = case when p_approve then 'going'::public.member_status else 'declined'::public.member_status end, updated_at = now()
   where linkup_id = p_linkup and user_id = p_user and status = 'requested';
  if not found then raise exception 'no request from that person' using errcode = 'P0002'; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, 'linkup.request_answered',
          case when p_approve then 'You''re in!' else 'Request not accepted' end,
          l.title, '/vybe/' || l.id);
end;
$$;

create or replace function public.remove_member(p_linkup uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_linkup_host(p_linkup) then raise exception 'host only' using errcode = '42501'; end if;
  update public.linkup_members set status = 'removed', updated_at = now()
   where linkup_id = p_linkup and user_id = p_user and not is_host;
end;
$$;

-- Invite a VYBR8 member (friends only, to keep invites from being spammy).
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
  if l.is_alcoholic and not private.user_is_21_plus(p_user) then raise exception 'drinks Link Ups are 21+' using errcode = '42501'; end if;
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

-- ── Guest invites (no account needed) ──────────────────────────────────
-- Host creates a link. The plain token is returned once and never stored.
create or replace function public.create_guest_invite(p_linkup uuid, p_label text default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.is_linkup_host(p_linkup) then raise exception 'host only' using errcode = '42501'; end if;
  if (select count(*) from public.linkup_invites where linkup_id = p_linkup and status <> 'revoked') >= 20 then
    raise exception 'too many guest links for one Link Up' using errcode = '23514';
  end if;
  insert into public.linkup_invites (linkup_id, created_by, token_hash, label)
  values (p_linkup, auth.uid(), encode(sha256(convert_to(token, 'UTF8')), 'hex'), nullif(trim(p_label), ''));
  return token;
end;
$$;

create or replace function public.revoke_guest_invite(p_invite uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.linkup_invites i set status = 'revoked'
   where i.id = p_invite and private.is_linkup_host(i.linkup_id);
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function private.invite_by_token(p_token text)
returns public.linkup_invites
language sql stable security definer
set search_path = ''
as $$
  select * from public.linkup_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- What a guest sees before and after accepting.
create or replace function public.guest_view_invite(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  i public.linkup_invites := private.invite_by_token(p_token);
  l public.linkups;
begin
  if i.id is null or i.status = 'revoked' then return null; end if;
  select * into l from public.linkups where id = i.linkup_id;
  return jsonb_build_object(
    'invite_status', i.status,
    'guest_name', i.guest_name,
    'label', i.label,
    'title', l.title,
    'occasion', l.occasion,
    'description', l.description,
    'starts_at', l.starts_at,
    'ends_at', l.ends_at,
    'is_over', l.ends_at < now() or l.status <> 'active',
    'is_alcoholic', l.is_alcoholic,
    'capacity', l.capacity,
    'spots_taken', private.linkup_spots_taken(l.id),
    'city', (select name || ', ' || region from public.cities where slug = l.city_slug),
    'place', coalesce((select b.name from public.businesses b where b.id = l.business_id), l.meet_point),
    'address', (select concat_ws(', ', bl.address_line1, bl.city, bl.region) from public.business_locations bl
                where bl.business_id = l.business_id order by bl.is_primary desc limit 1),
    'host', (select coalesce(display_name, username::text) from public.profiles where id = l.host_id),
    'going', (select coalesce(jsonb_agg(coalesce(p.display_name, p.username::text)), '[]'::jsonb)
                from public.linkup_members m join public.profiles p on p.id = m.user_id
               where m.linkup_id = l.id and m.status = 'going')
             || (select coalesce(jsonb_agg(g.guest_name || ' (guest)'), '[]'::jsonb)
                   from public.linkup_invites g where g.linkup_id = l.id and g.status = 'accepted')
  );
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
  if p_birthdate is null or private.age_on(p_birthdate, current_date) < (case when l.is_alcoholic then 21 else 13 end) then
    raise exception '%', case when l.is_alcoholic then 'this Link Up is 21+' else 'VYBR8 is for people 13 and older' end using errcode = '23514';
  end if;
  if private.linkup_spots_taken(l.id) >= l.capacity then raise exception 'this Link Up is full' using errcode = '23514'; end if;
  update public.linkup_invites
     set status = 'accepted', guest_name = left(trim(p_name), 40), guest_birthdate = p_birthdate, accepted_at = now()
   where id = i.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (l.host_id, 'linkup.guest_accepted', 'A guest accepted your invite', left(trim(p_name), 40) || ' · ' || l.title, '/vybe/' || l.id);
end;
$$;

create or replace function public.guest_decline_invite(p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  i public.linkup_invites := private.invite_by_token(p_token);
begin
  if i.id is null or i.status = 'revoked' then raise exception 'this invite link is not valid' using errcode = 'P0002'; end if;
  update public.linkup_invites set status = 'declined' where id = i.id and status = 'pending';
end;
$$;

create or replace function public.guest_messages(p_token text)
returns table (id uuid, author text, is_guest boolean, is_me boolean, body text, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  i public.linkup_invites := private.invite_by_token(p_token);
begin
  if i.id is null or i.status <> 'accepted' then return; end if;
  if not exists (select 1 from public.linkups l where l.id = i.linkup_id and l.status = 'active' and l.ends_at > now()) then return; end if;
  return query
    select m.id,
           coalesce(p.display_name, p.username::text, g.guest_name),
           m.invite_id is not null,
           m.invite_id = i.id,
           m.body,
           m.created_at
      from public.linkup_messages m
      left join public.profiles p on p.id = m.user_id
      left join public.linkup_invites g on g.id = m.invite_id
     where m.linkup_id = i.linkup_id
     order by m.created_at
     limit 500;
end;
$$;

create or replace function public.guest_send_message(p_token text, p_body text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  i public.linkup_invites := private.invite_by_token(p_token);
begin
  if i.id is null or i.status <> 'accepted' then raise exception 'accept the invite to chat' using errcode = '42501'; end if;
  if not exists (select 1 from public.linkups l where l.id = i.linkup_id and l.status = 'active' and l.ends_at > now()) then
    raise exception 'the chat has closed' using errcode = '22023';
  end if;
  insert into public.linkup_messages (linkup_id, invite_id, body) values (i.linkup_id, i.id, left(trim(p_body), 1000));
end;
$$;

-- Members' chat view with author names (guests included).
create or replace function public.linkup_chat(p_linkup uuid)
returns table (id uuid, author text, is_guest boolean, is_me boolean, body text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select m.id,
         coalesce(p.display_name, p.username::text, g.guest_name),
         m.invite_id is not null,
         m.user_id = (select auth.uid()),
         m.body,
         m.created_at
    from public.linkup_messages m
    left join public.profiles p on p.id = m.user_id
    left join public.linkup_invites g on g.id = m.invite_id
   where m.linkup_id = p_linkup and private.can_chat(p_linkup)
   order by m.created_at
   limit 500;
$$;

-- ── Chats disappear when the Link Up ends ──────────────────────────────
create or replace function public.purge_ended_linkup_chats()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.linkup_messages m using public.linkups l
   where l.id = m.linkup_id and (l.ends_at <= now() or l.status = 'cancelled');
  get diagnostics n = row_count;
  -- Guest birthdates are only needed while the invite is live.
  update public.linkup_invites i set guest_birthdate = null
    from public.linkups l where l.id = i.linkup_id and l.ends_at <= now() and i.guest_birthdate is not null;
  return n;
end;
$$;

-- Grants: guest functions are callable without an account; everything else needs sign-in.
revoke execute on function public.join_linkup(uuid), public.leave_linkup(uuid), public.respond_to_request(uuid, uuid, boolean),
  public.remove_member(uuid, uuid), public.invite_to_linkup(uuid, uuid), public.create_guest_invite(uuid, text),
  public.revoke_guest_invite(uuid), public.linkup_chat(uuid) from public, anon;
grant execute on function public.join_linkup(uuid), public.leave_linkup(uuid), public.respond_to_request(uuid, uuid, boolean),
  public.remove_member(uuid, uuid), public.invite_to_linkup(uuid, uuid), public.create_guest_invite(uuid, text),
  public.revoke_guest_invite(uuid), public.linkup_chat(uuid) to authenticated;
grant execute on function public.guest_view_invite(text), public.guest_accept_invite(text, text, date),
  public.guest_decline_invite(text), public.guest_messages(text), public.guest_send_message(text, text) to anon, authenticated;
revoke execute on function public.purge_ended_linkup_chats() from public, anon, authenticated;
grant execute on function public.purge_ended_linkup_chats() to service_role;

-- Live chat updates for members (Supabase Realtime respects RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.linkup_messages;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vybr8-purge-ended-chats', '*/10 * * * *', 'select public.purge_ended_linkup_chats()');
  end if;
end $$;

-- Spots taken for Link Ups the viewer can see (members + accepted guests).
create or replace function public.linkup_spots(p_ids uuid[])
returns table (linkup_id uuid, taken integer)
language sql stable security definer
set search_path = ''
as $$
  select l.id, private.linkup_spots_taken(l.id)
    from public.linkups l
   where l.id = any (p_ids) and private.can_see_linkup(l.id);
$$;
grant execute on function public.linkup_spots(uuid[]) to anon, authenticated;
