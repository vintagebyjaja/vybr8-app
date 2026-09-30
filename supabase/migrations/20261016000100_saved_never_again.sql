-- VYBR8 · Saved places and "Never again"
--
-- • Save a place to come back to. Mark a place "Never again" after a bad experience: it disappears from your
--   recommendations (What Should I Eat?, group suggestions), and when a Link Up or group plan you're in is at that
--   place, the host or group gets a heads-up that you don't want to go back.
-- • Your lists are private. The reason you give is never shown to anyone.

create table public.place_lists (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  list         text not null check (list in ('saved', 'never')),
  note         text check (note is null or char_length(note) <= 200),   -- private, only you see it
  created_at   timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index place_lists_business_idx on public.place_lists (business_id, list);
alter table public.place_lists enable row level security;
create policy "place_lists: yours only" on public.place_lists for select to authenticated using (user_id = (select auth.uid()));
create policy "place_lists: remove yours" on public.place_lists for delete to authenticated using (user_id = (select auth.uid()));
-- Adding goes through set_place_list() so the right people hear about a "Never again".

-- Tell the host of an upcoming Link Up / the rest of a group with an upcoming plan that someone won't go back.
create or replace function private.notify_never_again(p_user uuid, p_business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := coalesce((select '@' || username from public.profiles where id = p_user), 'Someone');
  place text := (select name from public.businesses where id = p_business);
begin
  -- Link Ups this person is going to, hosted by someone else.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select l.host_id, 'linkup.never_again', 'Heads up about your Link Up spot',
         format('%s had a bad experience at %s and doesn''t want to go back. Maybe pick another spot?', who, place),
         '/vybe/' || l.id::text, 'never.' || l.id::text || '.' || p_user::text
    from public.linkups l
    join public.linkup_members m on m.linkup_id = l.id and m.user_id = p_user and m.status = 'going'
   where l.business_id = p_business and l.host_id <> p_user and l.status = 'active' and l.ends_at > now()
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  -- Upcoming plans at this place in groups this person is in: everyone else in the group hears.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select gm.user_id, 'group.never_again', 'Heads up about a group plan',
         format('%s had a bad experience at %s and doesn''t want to go back. Plan: %s', who, place, gp.title),
         '/groups/' || gp.group_id::text, 'never.' || gp.id::text || '.' || p_user::text
    from public.group_plans gp
    join public.group_members me on me.group_id = gp.group_id and me.user_id = p_user and me.status = 'active'
    join public.group_members gm on gm.group_id = gp.group_id and gm.status = 'active' and gm.user_id is not null and gm.user_id <> p_user
   where gp.business_id = p_business and gp.status in ('idea', 'planned') and (gp.planned_for is null or gp.planned_for > now())
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Save, mark "Never again", or clear (p_list = null).
create or replace function public.set_place_list(p_business uuid, p_list text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_list is null then
    delete from public.place_lists where user_id = me and business_id = p_business;
    return 'cleared';
  end if;
  if p_list not in ('saved', 'never') then raise exception 'unknown list' using errcode = '22023'; end if;
  if not exists (select 1 from public.businesses where id = p_business and deleted_at is null) then
    raise exception 'place not found' using errcode = 'P0002';
  end if;
  insert into public.place_lists (user_id, business_id, list, note) values (me, p_business, p_list, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (user_id, business_id) do update set list = excluded.list, note = coalesce(excluded.note, public.place_lists.note), created_at = now();
  if p_list = 'never' then perform private.notify_never_again(me, p_business); end if;
  return p_list;
end;
$$;
revoke all on function public.set_place_list(uuid, text, text) from public, anon;
grant execute on function public.set_place_list(uuid, text, text) to authenticated;

-- A new or moved group plan at a place someone in the group won't go back to: the person who made the plan hears.
create or replace function private.group_plan_never_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.business_id is null or (tg_op = 'UPDATE' and new.business_id is not distinct from old.business_id) or new.created_by is null then
    return new;
  end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select new.created_by, 'group.never_again', 'Heads up about your plan',
         format('%s had a bad experience at %s and doesn''t want to go back.', coalesce('@' || p.username, 'Someone in the group'), b.name),
         '/groups/' || new.group_id::text, 'never.' || new.id::text || '.' || pl.user_id::text
    from public.group_members gm
    join public.place_lists pl on pl.user_id = gm.user_id and pl.business_id = new.business_id and pl.list = 'never'
    join public.businesses b on b.id = new.business_id
    left join public.profiles p on p.id = gm.user_id
   where gm.group_id = new.group_id and gm.status = 'active' and gm.user_id <> new.created_by
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
create trigger group_plan_never_check after insert or update of business_id on public.group_plans
  for each row execute function private.group_plan_never_check();

-- The same for a Link Up: when someone joins one at a place they marked "Never again", the host hears.
create or replace function private.linkup_join_never_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'going' then return new; end if;
  if exists (select 1 from public.linkups l join public.place_lists pl on pl.business_id = l.business_id
              where l.id = new.linkup_id and pl.user_id = new.user_id and pl.list = 'never' and l.host_id <> new.user_id) then
    perform private.notify_never_again(new.user_id, (select business_id from public.linkups where id = new.linkup_id));
  end if;
  return new;
end;
$$;
create trigger linkup_join_never_check after insert on public.linkup_members
  for each row execute function private.linkup_join_never_check();

-- Places anyone active in a group marked "Never again" (no names): group suggestions leave them out.
create or replace function public.group_never_places(p_group uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct pl.business_id
    from public.place_lists pl
    join public.group_members gm on gm.user_id = pl.user_id and gm.group_id = p_group and gm.status = 'active'
   where pl.list = 'never'
     and exists (select 1 from public.group_members me where me.group_id = p_group and me.user_id = (select auth.uid()) and me.status = 'active');
$$;
grant execute on function public.group_never_places(uuid) to authenticated;

-- What Should I Eat? now leaves out your "Never again" places, marks your saved ones, and can show only saved.
drop function if exists public.places_near(text, numeric, numeric, text[], text, text, boolean, text[], text[], text, int, int, text);
create or replace function public.places_near(
  p_city     text,
  p_lat      numeric default null,
  p_lng      numeric default null,
  p_kinds    text[] default null,
  p_cuisine  text default null,
  p_q        text default null,
  p_open_now boolean default false,
  p_likes    text[] default '{}',
  p_dislikes text[] default '{}',
  p_sort     text default 'near',
  p_limit    int default 30,
  p_offset   int default 0,
  p_badge    text default null,
  p_saved_only boolean default false
)
returns table (
  business_id uuid, slug text, name text, branch_name text, kind text, cuisines text[], price_level smallint,
  approved boolean, logo_url text, address text, lat numeric, lng numeric, meters double precision,
  open_now boolean, rating numeric, ratings int, match int, badges text[], saved boolean
)
language sql stable
set search_path = ''
as $$
  with c as (select * from public.cities where slug = p_city),
  base as (
    select b.id, b.slug::text, b.name, b.branch_name, b.kind::text, b.cuisines, b.price_level, b.is_claimed, b.logo_url,
           l.address_line1, l.latitude, l.longitude, l.id as loc, l.timezone,
           private.meters_between(l.latitude, l.longitude, coalesce(p_lat, (select center_lat from c)), coalesce(p_lng, (select center_lng from c))) as meters,
           lower(b.name || ' ' || replace(array_to_string(b.cuisines, ' '), '_', ' ') || ' ' || replace(b.kind::text, '_', ' ')) as hay
      from public.businesses b
      join public.business_locations l on l.business_id = b.id and l.is_primary
     where l.city_slug = p_city and l.latitude is not null
       and b.status = 'active' and b.deleted_at is null
       and (p_kinds is null or b.kind::text = any (p_kinds))
       and (p_cuisine is null or p_cuisine = any (b.cuisines))
       and (p_q is null or b.name ilike '%' || p_q || '%')
       and not exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = b.id and pl.list = 'never')
       and (not p_saved_only or exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = b.id and pl.list = 'saved'))
       and (p_badge is null or exists (select 1 from public.place_badges pb where pb.business_id = b.id and pb.badge = p_badge and pb.status = 'verified'))
  ),
  scored as (
    select base.*,
      (select case when count(*) = 0 then null else bool_or(
          (h.opens_at < h.closes_at and h.weekday = extract(dow from (now() at time zone base.timezone))::int
             and (now() at time zone base.timezone)::time >= h.opens_at and (now() at time zone base.timezone)::time < h.closes_at)
          or (h.opens_at >= h.closes_at and (
               (h.weekday = extract(dow from (now() at time zone base.timezone))::int and (now() at time zone base.timezone)::time >= h.opens_at)
            or (h.weekday = (extract(dow from (now() at time zone base.timezone))::int + 6) % 7 and (now() at time zone base.timezone)::time < h.closes_at))))
        end
         from public.business_hours h where h.location_id = base.loc) as open_now,
      (select count(*) from unnest(p_likes) x where length(x) >= 3 and position(lower(x) in base.hay) > 0)::int
        - 2 * (select count(*) from unnest(p_dislikes) x where length(x) >= 3 and position(lower(x) in base.hay) > 0)::int as match
      from base
  ),
  rated as (
    select s.*, r.rating, coalesce(r.n, 0)::int as ratings
      from scored s
      left join lateral (
        select round(avg(p.rating), 1) as rating, count(*) as n
          from public.posts p
         where p.business_id = s.id and p.rating is not null and p.deleted_at is null and p.status = 'published'
      ) r on true
     where not p_open_now or s.open_now is true
  ),
  page as (
    select * from rated
     order by
       case when p_sort = 'for_you' then match end desc nulls last,
       case when p_sort = 'top' then (ratings > 0) end desc nulls last,
       case when p_sort = 'top' then rating end desc nulls last,
       meters asc, name
     limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
  )
  select pg.id, pg.slug, pg.name, pg.branch_name, pg.kind, pg.cuisines, pg.price_level, pg.is_claimed, pg.logo_url, pg.address_line1, pg.latitude, pg.longitude,
         round(pg.meters::numeric)::double precision, pg.open_now, pg.rating, pg.ratings, pg.match,
         coalesce((select array_agg(pb.badge order by pb.badge) from public.place_badges pb where pb.business_id = pg.id and pb.status = 'verified'), '{}'),
         exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = pg.id and pl.list = 'saved')
    from page pg
   order by
     case when p_sort = 'for_you' then pg.match end desc nulls last,
     case when p_sort = 'top' then (pg.ratings > 0) end desc nulls last,
     case when p_sort = 'top' then pg.rating end desc nulls last,
     pg.meters asc, pg.name;
$$;
grant execute on function public.places_near(text, numeric, numeric, text[], text, text, boolean, text[], text[], text, int, int, text, boolean) to anon, authenticated;
