-- VYBR8 · Link Up ETAs: "Dee · 12 min away"
--
-- People going to a Link Up can choose to share how far away they are while they head there.
--   Off unless each person turns it on, for that one Link Up only.
--   Only an ETA (minutes away + arrival time + drive/walk) is stored. Never a location or a route.
--   Seen only by the host and people going, only while the Link Up is on (from 4 hours before it starts until it ends).
--   Rows are removed when someone stops sharing, leaves, or when the Link Up ends or is cancelled.

create table public.linkup_etas (
  linkup_id    uuid not null references public.linkups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  minutes_away integer not null check (minutes_away between 0 and 1440),
  arrives_at   timestamptz not null,
  mode         text not null default 'drive' check (mode in ('drive', 'walk')),
  updated_at   timestamptz not null default now(),
  primary key (linkup_id, user_id)
);
alter table public.linkup_etas enable row level security;

-- The Link Up is on: active, not over, and starting within 4 hours.
create or replace function private.linkup_eta_window(p_linkup uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.linkups l where l.id = p_linkup and l.status = 'active'
                   and l.ends_at > now() and l.starts_at < now() + interval '4 hours');
$$;

create or replace function private.linkup_is_going(p_linkup uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.linkups l where l.id = p_linkup and l.host_id = (select auth.uid()))
      or coalesce(private.linkup_member_status(p_linkup) = 'going', false);
$$;
grant execute on function private.linkup_eta_window(uuid), private.linkup_is_going(uuid) to authenticated;

create policy "linkup_etas: the group sees ETAs while the Link Up is on" on public.linkup_etas for select to authenticated
  using (private.linkup_is_going(linkup_id) and private.linkup_eta_window(linkup_id)
         and not private.is_blocked_between((select auth.uid()), user_id));
-- Writes only through the functions below.

-- Share or update my ETA.
create or replace function public.share_linkup_eta(p_linkup uuid, p_minutes integer, p_mode text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not private.linkup_is_going(p_linkup) then raise exception 'Only people going can share an ETA.' using errcode = '42501'; end if;
  if not private.linkup_eta_window(p_linkup) then raise exception 'ETAs open 4 hours before the Link Up starts.' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 1440 or p_mode not in ('drive', 'walk') then
    raise exception 'That ETA doesn''t look right.' using errcode = '22023';
  end if;
  insert into public.linkup_etas (linkup_id, user_id, minutes_away, arrives_at, mode, updated_at)
  values (p_linkup, me, p_minutes, now() + make_interval(mins => p_minutes), p_mode, now())
  on conflict (linkup_id, user_id) do update
     set minutes_away = excluded.minutes_away, arrives_at = excluded.arrives_at, mode = excluded.mode, updated_at = now();
end;
$$;

create or replace function public.stop_linkup_eta(p_linkup uuid)
returns void
language sql security definer
set search_path = ''
as $$ delete from public.linkup_etas where linkup_id = p_linkup and user_id = (select auth.uid()); $$;

revoke execute on function public.share_linkup_eta(uuid, integer, text), public.stop_linkup_eta(uuid) from public, anon;
grant execute on function public.share_linkup_eta(uuid, integer, text), public.stop_linkup_eta(uuid) to authenticated;

-- Clean up: leaving a Link Up, or a Link Up ending/being cancelled, removes ETAs.
create or replace function private.linkup_etas_cleanup_member()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.status <> 'going' then
    delete from public.linkup_etas where linkup_id = coalesce(old.linkup_id, new.linkup_id) and user_id = coalesce(old.user_id, new.user_id);
  end if;
  return null;
end;
$$;
create trigger linkup_members_eta_cleanup after update of status or delete on public.linkup_members
  for each row execute function private.linkup_etas_cleanup_member();

create or replace function private.linkup_etas_cleanup_linkup()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then delete from public.linkup_etas where linkup_id = new.id; end if;
  -- Ended Link Ups: sweep old ETAs whenever any Link Up changes (cheap; ETAs are tiny).
  delete from public.linkup_etas e using public.linkups l where l.id = e.linkup_id and l.ends_at < now();
  return null;
end;
$$;
create trigger linkups_eta_cleanup after update on public.linkups
  for each row execute function private.linkup_etas_cleanup_linkup();
