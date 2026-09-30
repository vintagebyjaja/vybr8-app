-- VYBR8 · UPDATE: run this ONCE after file 12. Powers "What Should I Eat?": every place near you, filters, and your tastes first.

-- ═════ 20261012000100_places_near.sql ═════
-- VYBR8 · "What Should I Eat?": every place near you, rated or not, with your tastes on top
--
-- Lists all active places in a city by distance from you (or from downtown), with filters for the kind of
-- place, cuisine, open now and a name search. People who saved their tastes (likes / won't eat) see what
-- matches first, but never lose the rest of the list. VYBR8 ratings show when a place has them.

create or replace function public.places_near(
  p_city     text,
  p_lat      numeric default null,
  p_lng      numeric default null,
  p_kinds    text[] default null,       -- null = every kind
  p_cuisine  text default null,
  p_q        text default null,
  p_open_now boolean default false,
  p_likes    text[] default '{}',
  p_dislikes text[] default '{}',
  p_sort     text default 'near',       -- near | for_you | top
  p_limit    int default 30,
  p_offset   int default 0
)
returns table (
  business_id uuid, slug text, name text, branch_name text, kind text, cuisines text[], price_level smallint,
  approved boolean, logo_url text, address text, lat numeric, lng numeric, meters double precision,
  open_now boolean, rating numeric, ratings int, match int
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
  )
  select id, slug, name, branch_name, kind, cuisines, price_level, is_claimed, logo_url, address_line1, latitude, longitude,
         round(meters::numeric)::double precision, open_now, rating, ratings, match
    from rated
   order by
     case when p_sort = 'for_you' then match end desc nulls last,
     case when p_sort = 'top' then (ratings > 0) end desc nulls last,
     case when p_sort = 'top' then rating end desc nulls last,
     meters asc, name
   limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
grant execute on function public.places_near(text, numeric, numeric, text[], text, text, boolean, text[], text[], text, int, int) to anon, authenticated;

-- The cuisines in a city, most common first (for the filter chips).
create or replace function public.city_cuisines(p_city text, p_limit int default 16)
returns table (cuisine text, places bigint)
language sql stable
set search_path = ''
as $$
  select x, count(*)
    from public.businesses b
    join public.business_locations l on l.business_id = b.id and l.is_primary
    cross join lateral unnest(b.cuisines) x
   where l.city_slug = p_city and b.status = 'active' and b.deleted_at is null
   group by x
   order by count(*) desc, x
   limit least(greatest(p_limit, 1), 40);
$$;
grant execute on function public.city_cuisines(text, int) to anon, authenticated;
