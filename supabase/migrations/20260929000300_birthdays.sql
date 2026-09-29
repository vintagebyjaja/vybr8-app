-- VYBR8 · Birthdays: 21+ at sign-up, birthday alerts, and Birthday Perks
--
-- Birthdate is self-reported at sign-up. It is private to the user, set once,
-- and used for: the 21+ gate, birthday alerts, and showing which perks are usable now.

create type public.perk_type   as enum ('free_food', 'free_drink', 'discount', 'other');
create type public.perk_window as enum ('day', 'week', 'month');   -- on the day · birthday week (±3 days) · birthday month
create type public.perk_source as enum ('business', 'community', 'vybr8');
create type public.perk_status as enum ('pending', 'active', 'rejected', 'expired');

-- ── Birthdays (owner-only) ─────────────────────────────────────────────
create table public.user_birthdays (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  birthdate   date not null check (birthdate >= date '1900-01-01'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger user_birthdays_updated_at before update on public.user_birthdays
  for each row execute function private.set_updated_at();

-- Age in whole years on a given day.
create or replace function private.age_on(p_birthdate date, p_day date)
returns integer
language sql immutable
set search_path = ''
as $$ select extract(year from age(p_day, p_birthdate))::integer; $$;

-- Next birthday on or after p_from. Feb 29 birthdays are celebrated on Feb 28 in non-leap years.
create or replace function private.next_birthday(p_birthdate date, p_from date)
returns date
language plpgsql immutable
set search_path = ''
as $$
declare
  y integer := extract(year from p_from)::integer;
  m integer := extract(month from p_birthdate)::integer;
  d integer := extract(day from p_birthdate)::integer;
  candidate date;
begin
  for i in 0..1 loop
    if m = 2 and d = 29 and not ((y + i) % 4 = 0 and ((y + i) % 100 <> 0 or (y + i) % 400 = 0)) then
      candidate := make_date(y + i, 2, 28);
    else
      candidate := make_date(y + i, m, d);
    end if;
    if candidate >= p_from then return candidate; end if;
  end loop;
  return candidate;
end;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- Must be 21+. Birthdate can be set once by the user; later changes go through the VYBR8 team.
create or replace function private.user_birthdays_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.age_on(new.birthdate, current_date) < 21 then
    raise exception 'VYBR8 is for adults 21 and over' using errcode = '23514';
  end if;
  if new.birthdate > current_date then
    raise exception 'birthdate cannot be in the future' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (select auth.uid()) is not null and not private.is_staff()
     and new.birthdate is distinct from old.birthdate then
    raise exception 'contact the VYBR8 team to change your birthday' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger user_birthdays_guard before insert or update on public.user_birthdays
  for each row execute function private.user_birthdays_guard();

alter table public.user_birthdays enable row level security;
create policy "user_birthdays: owner reads"
  on public.user_birthdays for select to authenticated using (user_id = (select auth.uid()));
create policy "user_birthdays: owner sets once"
  on public.user_birthdays for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_birthdays: owner or staff updates"
  on public.user_birthdays for update to authenticated
  using (user_id = (select auth.uid()) or private.is_staff())
  with check (user_id = (select auth.uid()) or private.is_staff());

-- ── Sign-up: now also records the birthday and enforces 21+ ────────────
-- Email sign-ups always send a birthdate (the form requires it). Sign-ups without one
-- (e.g. a future Google/Apple login) are sent to a "confirm your birthday" step before using the app.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  bday   date;
  uname  text;
begin
  begin
    bday := nullif(new.raw_user_meta_data ->> 'birthdate', '')::date;
  exception when others then
    raise exception 'invalid birthdate' using errcode = '22007';
  end;
  if bday is not null and private.age_on(bday, current_date) < 21 then
    raise exception 'VYBR8 is for adults 21 and over' using errcode = '23514';
  end if;

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
  if bday is not null then
    insert into public.user_birthdays (user_id, birthdate) values (new.id, bday);
  end if;
  return new;
end;
$$;

-- ── In-app notifications ───────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_.]{3,60}$'),
  title       text not null check (char_length(title) <= 120),
  body        text check (char_length(body) <= 500),
  link        text check (link ~ '^/'),
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_inbox_idx on public.notifications (user_id, created_at desc);

create or replace function private.notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.user_id <> old.user_id or new.kind <> old.kind or new.title <> old.title
  or new.body is distinct from old.body or new.link is distinct from old.link
  or new.dedupe_key is distinct from old.dedupe_key or new.created_at <> old.created_at then
    raise exception 'only read status can change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

alter table public.notifications enable row level security;
create policy "notifications: owner reads"   on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: owner marks read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: owner clears"  on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
-- No insert policy: notifications are created by server jobs only.

-- ── Birthday Perks ─────────────────────────────────────────────────────
create table public.birthday_perks (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  title              text not null check (char_length(title) between 3 and 120),     -- "Free dessert on your birthday"
  details            text check (char_length(details) <= 600),
  perk_type          public.perk_type not null,
  redeem_window      public.perk_window not null default 'day',
  requirements       text check (char_length(requirements) <= 300),                  -- "Show ID · dine-in only · rewards members"
  is_alcoholic       boolean not null default false,
  source             public.perk_source not null,
  status             public.perk_status not null default 'pending',
  submitted_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  last_confirmed_at  timestamptz,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index birthday_perks_active_idx on public.birthday_perks (status, perk_type) where status = 'active';
create index birthday_perks_business_idx on public.birthday_perks (business_id);
create trigger birthday_perks_updated_at before update on public.birthday_perks
  for each row execute function private.set_updated_at();

-- Community tips start pending and need VYBR8 review. Verified businesses publish their own perks directly.
create or replace function private.birthday_perks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editor boolean;
begin
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  editor := private.can_edit_business(new.business_id);
  if tg_op = 'INSERT' then
    new.submitted_by := (select auth.uid());
    if new.is_demo then raise exception 'only admins create demo records' using errcode = '42501'; end if;
    if editor then
      new.source := 'business';
      new.status := 'active';
      new.last_confirmed_at := now();
    else
      new.source := 'community';
      new.status := 'pending';
      new.last_confirmed_at := null;
    end if;
    new.reviewed_by := null;
    return new;
  end if;
  -- UPDATE by a business editor: content and status (e.g. expire it), not provenance.
  if new.business_id <> old.business_id or new.source <> old.source or new.is_demo <> old.is_demo
  or new.reviewed_by is distinct from old.reviewed_by or new.submitted_by is distinct from old.submitted_by
  or new.status not in ('active', 'expired') then
    raise exception 'that change is not allowed on a birthday perk' using errcode = '42501';
  end if;
  new.last_confirmed_at := now();
  return new;
end;
$$;
create trigger birthday_perks_guard before insert or update on public.birthday_perks
  for each row execute function private.birthday_perks_guard();

alter table public.birthday_perks enable row level security;
create policy "birthday_perks: active perks at visible places are public"
  on public.birthday_perks for select to anon, authenticated
  using ((status = 'active' and exists (select 1 from public.businesses b where b.id = business_id))
         or submitted_by = (select auth.uid())
         or private.can_edit_business(business_id)
         or private.is_staff());
create policy "birthday_perks: anyone signed in can suggest"
  on public.birthday_perks for insert to authenticated
  with check (exists (select 1 from public.businesses b where b.id = business_id));
create policy "birthday_perks: business editors and staff update"
  on public.birthday_perks for update to authenticated
  using (private.can_edit_business(business_id) or private.is_staff())
  with check (private.can_edit_business(business_id) or private.is_staff());
create policy "birthday_perks: business editors and staff delete"
  on public.birthday_perks for delete to authenticated
  using (private.can_edit_business(business_id) or private.is_staff());

create or replace function public.review_birthday_perk(p_perk_id uuid, p_approve boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  update public.birthday_perks
     set status = case when p_approve then 'active'::public.perk_status else 'rejected'::public.perk_status end,
         reviewed_by = auth.uid(),
         last_confirmed_at = case when p_approve then now() else last_confirmed_at end
   where id = p_perk_id and status = 'pending';
  if not found then raise exception 'no pending perk with that id' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (auth.uid(), case when p_approve then 'birthday_perk.approved' else 'birthday_perk.rejected' end, 'birthday_perk', p_perk_id);
end;
$$;
revoke execute on function public.review_birthday_perk(uuid, boolean) from public, anon;
grant execute on function public.review_birthday_perk(uuid, boolean) to authenticated;

-- ── Daily birthday alerts ──────────────────────────────────────────────
-- Sends "birthday week is coming" 7 days out and "happy birthday" on the day.
-- Idempotent (dedupe keys), respects user_settings.notification_prefs->>'birthday' = 'false'.
create or replace function public.queue_birthday_notifications(p_today date default (now() at time zone 'America/New_York')::date)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  perks integer;
  n1 integer;
  n2 integer;
begin
  select count(*) into perks from public.birthday_perks p
    join public.businesses b on b.id = p.business_id
   where p.status = 'active' and b.status = 'active' and b.deleted_at is null;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select ub.user_id, 'birthday.upcoming',
         'Your birthday is one week away',
         format('Plan it now: %s places near you have birthday perks, from free food to drinks and discounts.', perks),
         '/birthday',
         'birthday.upcoming.' || extract(year from p_today + 7)::text
    from public.user_birthdays ub
    join public.user_settings us on us.user_id = ub.user_id
   where private.next_birthday(ub.birthdate, p_today) = p_today + 7
     and coalesce(us.notification_prefs ->> 'birthday', 'true') <> 'false'
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n1 = row_count;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select ub.user_id, 'birthday.today',
         'Happy birthday from VYBR8!',
         format('Eat your vybe today. %s birthday perks are waiting for you.', perks),
         '/birthday',
         'birthday.today.' || extract(year from p_today)::text
    from public.user_birthdays ub
    join public.user_settings us on us.user_id = ub.user_id
   where private.next_birthday(ub.birthdate, p_today) = p_today
     and coalesce(us.notification_prefs ->> 'birthday', 'true') <> 'false'
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n2 = row_count;

  return n1 + n2;
end;
$$;
revoke execute on function public.queue_birthday_notifications(date) from public, anon, authenticated;
grant execute on function public.queue_birthday_notifications(date) to service_role;

-- Run it every morning with pg_cron when available (it is on hosted Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vybr8-birthday-alerts', '0 13 * * *', 'select public.queue_birthday_notifications()');
  else
    raise notice 'pg_cron not available: schedule public.queue_birthday_notifications() daily another way';
  end if;
end $$;
