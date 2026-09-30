-- VYBR8 · Owner & cause badges: Black-owned, woman-owned, Latino-owned, Asian-owned, veteran-owned, LGBTQ+-owned, gives back
--
-- • Owners of a claimed place say what applies to their business. Anyone can suggest a badge for a place they know.
-- • Every badge is checked by the VYBR8 Team before it shows. Nothing is ever guessed or assumed.
-- • Verified badges show on the place, in What Should I Eat? (with a filter for each), and on the list cards.

create table public.place_badges (
  business_id   uuid not null references public.businesses (id) on delete cascade,
  badge         text not null check (badge in ('black_owned', 'woman_owned', 'latino_owned', 'asian_owned', 'veteran_owned', 'lgbtq_owned', 'good_cause')),
  status        text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  from_owner    boolean not null default false,          -- the owner said so (vs. someone suggesting it)
  suggestions   int not null default 1 check (suggestions >= 0),
  evidence      text check (evidence is null or char_length(evidence) <= 500),   -- a link or a few words the team can check
  submitted_by  uuid references public.profiles (id) on delete set null,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  verified_at   timestamptz,
  primary key (business_id, badge)
);
create index place_badges_verified_idx on public.place_badges (badge, business_id) where status = 'verified';
alter table public.place_badges enable row level security;
create policy "place_badges: verified are public; owners and the team see the rest" on public.place_badges for select to anon, authenticated
  using (status = 'verified' or private.is_staff() or private.can_edit_business(business_id) or submitted_by = (select auth.uid()));
-- Written through claim_place_badge() and review_place_badge() only.

-- Owner or community: "this place is Black-owned" (or another badge). Always waits for the team, except the team's own.
create or replace function public.claim_place_badge(p_business uuid, p_badge text, p_evidence text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  owner boolean;
  cur public.place_badges;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_badge not in ('black_owned', 'woman_owned', 'latino_owned', 'asian_owned', 'veteran_owned', 'lgbtq_owned', 'good_cause') then
    raise exception 'Pick one of the badges.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.businesses where id = p_business and status = 'active' and deleted_at is null) then
    raise exception 'place not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.place_badges where submitted_by = me and created_at > now() - interval '1 day') >= 15 then
    raise exception 'That''s a lot for one day. Thanks! Try again tomorrow.' using errcode = '22023';
  end if;
  owner := coalesce(private.can_edit_business(p_business), false);
  p_evidence := nullif(left(trim(coalesce(p_evidence, '')), 500), '');

  select * into cur from public.place_badges where business_id = p_business and badge = p_badge for update;
  if found and cur.status = 'verified' then return 'already_verified'; end if;

  if private.is_staff() then
    insert into public.place_badges (business_id, badge, status, from_owner, evidence, submitted_by, reviewed_by, verified_at)
    values (p_business, p_badge, 'verified', false, p_evidence, me, me, now())
    on conflict (business_id, badge) do update set status = 'verified', reviewed_by = me, verified_at = now(),
      evidence = coalesce(excluded.evidence, public.place_badges.evidence);
    return 'verified';
  end if;

  insert into public.place_badges (business_id, badge, status, from_owner, evidence, submitted_by)
  values (p_business, p_badge, 'pending', owner, p_evidence, me)
  on conflict (business_id, badge) do update set
    status = 'pending',
    from_owner = public.place_badges.from_owner or excluded.from_owner,
    suggestions = public.place_badges.suggestions + 1,
    evidence = coalesce(excluded.evidence, public.place_badges.evidence);

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select distinct r.user_id, 'badge.pending', 'Badge to verify',
         format('%s says %s is %s.', case when owner then 'The owner' else 'Someone' end,
                (select name from public.businesses where id = p_business), replace(p_badge, '_', '-')),
         '/admin#badges', 'badge.pending.' || p_business::text || '.' || p_badge
    from public.user_roles r where r.role in ('admin', 'moderator')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return 'pending';
end;
$$;
revoke all on function public.claim_place_badge(uuid, text, text) from public, anon;
grant execute on function public.claim_place_badge(uuid, text, text) to authenticated;

create or replace function public.review_place_badge(p_business uuid, p_badge text, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 Team only' using errcode = '42501'; end if;
  update public.place_badges
     set status = case when p_approve then 'verified' else 'rejected' end,
         reviewed_by = (select auth.uid()), verified_at = case when p_approve then now() end
   where business_id = p_business and badge = p_badge;
end;
$$;
revoke all on function public.review_place_badge(uuid, text, boolean) from public, anon;
grant execute on function public.review_place_badge(uuid, text, boolean) to authenticated;

create or replace function public.badge_queue()
returns table (business_id uuid, slug text, name text, branch_name text, badge text, from_owner boolean, suggestions int, evidence text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select pb.business_id, b.slug::text, b.name, b.branch_name, pb.badge, pb.from_owner, pb.suggestions, pb.evidence, pb.created_at
    from public.place_badges pb join public.businesses b on b.id = pb.business_id
   where pb.status = 'pending' and private.is_staff() and b.deleted_at is null
   order by pb.from_owner desc, pb.suggestions desc, pb.created_at
   limit 100;
$$;
grant execute on function public.badge_queue() to authenticated;

-- What Should I Eat?: filter by a verified badge and show each place's verified badges.
drop function if exists public.places_near(text, numeric, numeric, text[], text, text, boolean, text[], text[], text, int, int);
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
  p_badge    text default null
)
returns table (
  business_id uuid, slug text, name text, branch_name text, kind text, cuisines text[], price_level smallint,
  approved boolean, logo_url text, address text, lat numeric, lng numeric, meters double precision,
  open_now boolean, rating numeric, ratings int, match int, badges text[]
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
         coalesce((select array_agg(pb.badge order by pb.badge) from public.place_badges pb where pb.business_id = pg.id and pb.status = 'verified'), '{}')
    from page pg
   order by
     case when p_sort = 'for_you' then pg.match end desc nulls last,
     case when p_sort = 'top' then (pg.ratings > 0) end desc nulls last,
     case when p_sort = 'top' then pg.rating end desc nulls last,
     pg.meters asc, pg.name;
$$;
grant execute on function public.places_near(text, numeric, numeric, text[], text, text, boolean, text[], text[], text, int, int, text) to anon, authenticated;
