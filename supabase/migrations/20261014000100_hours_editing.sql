-- VYBR8 · Adding and fixing opening hours
--
-- • Owners of a claimed place and the VYBR8 Team set hours directly.
-- • Anyone signed in who knows the hours (walked by, works there, called) can suggest them.
--   Suggestions go to the Admin page; approving one puts the hours live.

create table public.hours_suggestions (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.business_locations (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  hours        jsonb not null check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) <= 21),
  note         text check (note is null or char_length(note) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index hours_suggestions_pending_idx on public.hours_suggestions (created_at) where status = 'pending';
alter table public.hours_suggestions enable row level security;
create policy "hours_suggestions: yours, and the team sees all" on public.hours_suggestions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
-- Written through submit_place_hours() and review_hours_suggestion() only.

-- Replace a location's hours with a clean list. [{ "weekday": 1, "opens": "11:00", "closes": "22:00" }, …]
create or replace function private.apply_hours(p_location uuid, p_hours jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  h jsonb; n int := 0;
begin
  delete from public.business_hours where location_id = p_location;
  for h in select * from jsonb_array_elements(p_hours) loop
    insert into public.business_hours (location_id, weekday, opens_at, closes_at)
    values (p_location, (h ->> 'weekday')::smallint, (h ->> 'opens')::time, (h ->> 'closes')::time)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Check the list before anything is saved: real weekdays and real times.
create or replace function private.valid_hours(p_hours jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare h jsonb;
begin
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 21 then return false; end if;
  for h in select * from jsonb_array_elements(p_hours) loop
    if (h ->> 'weekday')::int not between 0 and 6 then return false; end if;
    if h ->> 'opens' !~ '^([01]\d|2[0-3]):[0-5]\d$' or h ->> 'closes' !~ '^([01]\d|2[0-3]):[0-5]\d$' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

-- Owners and the team: saved right away. Everyone else: a suggestion for the team to check.
create or replace function public.submit_place_hours(p_location uuid, p_hours jsonb, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  biz uuid;
begin
  if me is null then raise exception 'sign in to add hours' using errcode = '42501'; end if;
  if not private.valid_hours(p_hours) then raise exception 'Check the days and times.' using errcode = '22023'; end if;
  select l.business_id into biz from public.business_locations l join public.businesses b on b.id = l.business_id
   where l.id = p_location and b.deleted_at is null;
  if biz is null then raise exception 'place not found' using errcode = 'P0002'; end if;

  if private.is_staff() or private.can_edit_business(biz) then
    perform private.apply_hours(p_location, p_hours);
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (me, 'place.hours_set', 'business', biz, jsonb_build_object('location', p_location));
    return 'saved';
  end if;

  if (select count(*) from public.hours_suggestions where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of hours today. Thanks! Try again tomorrow.' using errcode = '22023';
  end if;
  insert into public.hours_suggestions (location_id, user_id, hours, note) values (p_location, me, p_hours, nullif(trim(p_note), ''));
  return 'suggested';
end;
$$;
revoke all on function public.submit_place_hours(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_place_hours(uuid, jsonb, text) to authenticated;

create or replace function public.review_hours_suggestion(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.hours_suggestions;
begin
  if not private.is_staff() then raise exception 'VYBR8 Team only' using errcode = '42501'; end if;
  select * into s from public.hours_suggestions where id = p_id and status = 'pending' for update;
  if not found then return; end if;
  if p_approve then
    perform private.apply_hours(s.location_id, s.hours);
    -- Other pending suggestions for the same place are settled by this one.
    update public.hours_suggestions set status = 'rejected', reviewed_by = (select auth.uid())
     where location_id = s.location_id and status = 'pending' and id <> s.id;
  end if;
  update public.hours_suggestions set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = (select auth.uid()) where id = s.id;
end;
$$;
revoke all on function public.review_hours_suggestion(uuid, boolean) from public, anon;
grant execute on function public.review_hours_suggestion(uuid, boolean) to authenticated;

-- Can the signed-in person edit this place (owner/manager or admin)? Used to show "Edit hours" instead of "Suggest".
create or replace function public.can_edit_place(p_business uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce((select auth.uid()) is not null and private.can_edit_business(p_business), false); $$;
grant execute on function public.can_edit_place(uuid) to authenticated;

-- For the Admin page: pending hours with the place they're for.
create or replace function public.hours_suggestion_queue()
returns table (id uuid, slug text, name text, branch_name text, hours jsonb, note text, username text, created_at timestamptz, current jsonb)
language sql stable security definer
set search_path = ''
as $$
  select s.id, b.slug::text, b.name, b.branch_name, s.hours, s.note, p.username::text, s.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', to_char(h.opens_at, 'HH24:MI'), 'closes', to_char(h.closes_at, 'HH24:MI')))
                     from public.business_hours h where h.location_id = s.location_id), '[]'::jsonb)
    from public.hours_suggestions s
    join public.business_locations l on l.id = s.location_id
    join public.businesses b on b.id = l.business_id
    left join public.profiles p on p.id = s.user_id
   where s.status = 'pending' and private.is_staff()
   order by s.created_at
   limit 100;
$$;
grant execute on function public.hours_suggestion_queue() to authenticated;
