-- VYBR8 · UPDATE: run this ONCE after file 21. Lets people change their @username from Edit profile (old links keep working).

-- ═════ 20261017700100_change_username.sql ═════
-- VYBR8 · Change your @username
--
-- People change their @ from Edit profile. Rules: 3-30 letters, numbers, _ or .; not taken; not a reserved name
-- (vybr8, admin, support…); once every 30 days (the VYBR8 Team isn't limited). Old links keep working: visiting
-- /profile/<old name> forwards to the new one, and nobody else can grab someone's old name for 90 days.

alter table public.profiles add column if not exists username_changed_at timestamptz;

create table public.username_history (
  old_username  extensions.citext primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  changed_at    timestamptz not null default now()
);
create index username_history_user_idx on public.username_history (user_id);
alter table public.username_history enable row level security;
-- No policies: read through username_redirect() only.

-- Usernames only change through change_username() (or by an admin).
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
  if (select auth.uid()) is not null and not private.is_admin()
     and new.username is distinct from old.username
     and coalesce(current_setting('vybr8.username_change', true), '') <> 'on' then
    raise exception 'Change your @username from Edit profile.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.change_username(p_new text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  me     uuid := (select auth.uid());
  wanted text := lower(trim(both '@ ' from coalesce(p_new, '')));
  cur    public.profiles;
  staff  boolean := private.is_staff();
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into cur from public.profiles where id = me;
  if wanted = lower(cur.username::text) then
    -- Same name, maybe different capitals: allowed any time.
    perform set_config('vybr8.username_change', 'on', true);
    update public.profiles set username = trim(both '@ ' from p_new) where id = me;
    return trim(both '@ ' from p_new);
  end if;
  if wanted !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'Use 3 to 30 letters, numbers, underscores or periods.' using errcode = '22023';
  end if;
  if wanted ~ '^[._]|[._]$' or wanted ~ '\.\.' then
    raise exception 'Your @ can''t start or end with a period or underscore, or have two periods in a row.' using errcode = '22023';
  end if;
  if not staff and (wanted ~ '(vybr8|vybe8|admin|moderator|support|official|staff)'
     or wanted in ('help', 'team', 'founder', 'settings', 'profile', 'explore', 'pricing', 'eat', 'events', 'orgs', 'root', 'null', 'undefined')) then
    raise exception 'That @ is reserved. Try another.' using errcode = '22023';
  end if;
  if not staff and cur.username_changed_at is not null and cur.username_changed_at > now() - interval '30 days' then
    raise exception 'You can change your @ again on %.', to_char(cur.username_changed_at + interval '30 days', 'FMMonth FMDD') using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where username = wanted::extensions.citext and id <> me) then
    raise exception 'That @ is taken. Try another.' using errcode = '23505';
  end if;
  if exists (select 1 from public.username_history h where h.old_username = wanted::extensions.citext and h.user_id <> me
             and h.changed_at > now() - interval '90 days') then
    raise exception 'That @ was used recently. Try another.' using errcode = '23505';
  end if;

  delete from public.username_history where old_username = wanted::extensions.citext;   -- taking back your own old name, or an expired one
  insert into public.username_history (old_username, user_id) values (cur.username, me)
    on conflict (old_username) do update set user_id = excluded.user_id, changed_at = now();
  perform set_config('vybr8.username_change', 'on', true);
  update public.profiles set username = trim(both '@ ' from p_new), username_changed_at = now() where id = me;
  perform set_config('vybr8.username_change', '', true);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (me, 'profile.username_changed', 'profile', me, jsonb_build_object('from', cur.username::text, 'to', trim(both '@ ' from p_new)));
  return trim(both '@ ' from p_new);
end;
$$;
revoke execute on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;

-- Old profile links: /profile/<old name> → the person's current @ (if you can see their profile).
create or replace function public.username_redirect(p_old text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.username::text
    from public.username_history h join public.profiles p on p.id = h.user_id
   where h.old_username = trim(both '@ ' from coalesce(p_old, ''))::extensions.citext
     and private.can_view(p.id, 'profile');
$$;
grant execute on function public.username_redirect(text) to anon, authenticated;
