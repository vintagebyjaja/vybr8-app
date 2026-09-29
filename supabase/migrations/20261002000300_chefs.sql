-- VYBR8 · Expansion 3/4 · Chefs (restaurant chefs, private chefs, caterers, meal prep, pop-ups, food-truck chefs)
--
-- A chef is a person with a professional profile, not a business. A chef profile can be linked to a
-- user (chefs can also be consumers, business owners or food-truck operators) or created by the
-- VYBR8 Team and claimed later. Workplaces and dish credits are never inferred: each one records
-- who said so (chef, business, VYBR8 Team or a trusted provider) and whether it's current.

create type public.chef_service as enum
  ('private_chef', 'catering', 'meal_prep', 'pop_ups', 'classes', 'consulting', 'events', 'restaurant_chef', 'food_truck');
create type public.chef_verification as enum ('unverified', 'pending', 'verified');
create type public.relationship_source as enum ('self_reported', 'business_confirmed', 'admin_verified', 'provider');
create type public.chef_attribution as enum ('creator', 'executive_chef', 'head_chef', 'featured_chef', 'collaborator');
create type public.chef_price_type as enum ('starting', 'per_person', 'hourly', 'package', 'custom_quote');

create table public.chef_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references public.profiles (id) on delete set null,   -- null = not claimed yet
  slug                extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  professional_name   text not null check (char_length(trim(professional_name)) between 2 and 80),
  headline            text check (char_length(headline) <= 80),          -- "Executive Chef", "Private Chef & Caterer"
  bio                 text check (char_length(bio) <= 2000),
  photo_url           text check (photo_url is null or photo_url ~ '^(https://|/)'),
  cover_url           text check (cover_url is null or cover_url ~ '^(https://|/)'),
  city_slug           text references public.cities (slug),
  service_area        text check (char_length(service_area) <= 160),     -- "Charlotte + 30 miles, Rock Hill"
  years_experience    smallint check (years_experience between 0 and 70),
  culinary_background text check (char_length(culinary_background) <= 600),
  website             text check (website is null or website ~ '^https://'),
  booking_url         text check (booking_url is null or booking_url ~ '^https://'),
  contact_email       text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  socials             jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 6),
  accepting_clients   boolean not null default false,
  available_events    boolean not null default false,
  available_catering  boolean not null default false,
  available_private_dining boolean not null default false,
  available_meal_prep boolean not null default false,
  restaurant_only     boolean not null default false,
  -- Pricing is always "from" / "estimate": the chef confirms a real quote.
  starting_price_cents   integer check (starting_price_cents >= 0),
  per_person_cents       integer check (per_person_cents >= 0),
  hourly_cents           integer check (hourly_cents >= 0),
  custom_quote           boolean not null default true,
  min_guests          smallint check (min_guests >= 1),
  max_guests          smallint check (max_guests >= 1),
  verification        public.chef_verification not null default 'unverified',
  is_listed           boolean not null default true,
  is_demo             boolean not null default false,
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index chef_profiles_city_idx on public.chef_profiles (city_slug) where is_listed;
create trigger chef_profiles_updated_at before update on public.chef_profiles for each row execute function private.set_updated_at();

create or replace function private.can_edit_chef(p_chef uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.is_staff() or exists (select 1 from public.chef_profiles where id = p_chef and user_id = (select auth.uid())); $$;

-- Chefs can't verify themselves or change who owns the profile.
create or replace function private.chef_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from (select auth.uid()) then raise exception 'create your own chef profile' using errcode = '42501'; end if;
    if new.verification <> 'unverified' or new.is_demo then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.verification <> old.verification and new.verification <> 'pending'
     or new.is_demo <> old.is_demo or new.created_by is distinct from old.created_by then
    raise exception 'that change is made by the VYBR8 Team' using errcode = '42501';
  end if;
  if new.verification = 'pending' and old.verification = 'verified' then new.verification := 'verified'; end if;
  return new;
end;
$$;
create trigger chef_profiles_guard before insert or update on public.chef_profiles for each row execute function private.chef_profiles_guard();

create table public.chef_specialties (
  chef_id    uuid not null references public.chef_profiles (id) on delete cascade,
  cuisine    text not null check (char_length(trim(cuisine)) between 2 and 40),
  is_dietary boolean not null default false,        -- vegan, halal, gluten-free...
  primary key (chef_id, cuisine)
);
create table public.chef_services (
  chef_id  uuid not null references public.chef_profiles (id) on delete cascade,
  service  public.chef_service not null,
  primary key (chef_id, service)
);
create table public.chef_service_areas (
  chef_id    uuid not null references public.chef_profiles (id) on delete cascade,
  city_slug  text not null references public.cities (slug),
  primary key (chef_id, city_slug)
);

create table public.chef_business_relationships (
  id                  uuid primary key default gen_random_uuid(),
  chef_id             uuid not null references public.chef_profiles (id) on delete cascade,
  business_id         uuid not null references public.businesses (id) on delete cascade,
  role                text not null check (char_length(trim(role)) between 2 and 60),   -- Executive Chef, Sous Chef, Owner
  start_date          date,
  end_date            date,
  verification_status public.relationship_source not null default 'self_reported',
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index chef_business_relationships_chef_idx on public.chef_business_relationships (chef_id);
create index chef_business_relationships_business_idx on public.chef_business_relationships (business_id);

-- "Current" is computed, never stored: an end date in the past means former.
create or replace function public.chef_relationship_is_current(r public.chef_business_relationships)
returns boolean language sql stable set search_path = '' as $$ select r.end_date is null or r.end_date >= current_date; $$;

create table public.chef_menu_item_attributions (
  id                  uuid primary key default gen_random_uuid(),
  chef_id             uuid not null references public.chef_profiles (id) on delete cascade,
  menu_item_id        uuid not null references public.menu_items (id) on delete cascade,
  attribution_type    public.chef_attribution not null,
  verification_status public.relationship_source not null default 'self_reported',
  start_date          date,
  end_date            date,
  created_at          timestamptz not null default now(),
  unique (chef_id, menu_item_id, attribution_type)
);

create table public.chef_portfolio_items (
  id          uuid primary key default gen_random_uuid(),
  chef_id     uuid not null references public.chef_profiles (id) on delete cascade,
  image_url   text not null check (image_url ~ '^(https://|/)'),
  caption     text check (char_length(caption) <= 200),
  position    smallint not null default 100,
  created_at  timestamptz not null default now()
);

create table public.chef_service_packages (
  id           uuid primary key default gen_random_uuid(),
  chef_id      uuid not null references public.chef_profiles (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 80),
  description  text check (char_length(description) <= 600),
  price_type   public.chef_price_type not null,
  price_cents  integer check (price_cents >= 0),
  min_guests   smallint, max_guests smallint,
  position     smallint not null default 100,
  check (price_type = 'custom_quote' or price_cents is not null)
);

create table public.chef_availability (
  chef_id  uuid not null references public.chef_profiles (id) on delete cascade,
  day      date not null,
  status   text not null check (status in ('available', 'limited', 'booked')),
  note     text check (char_length(note) <= 120),
  primary key (chef_id, day)
);

create table public.chef_verifications (
  id           uuid primary key default gen_random_uuid(),
  chef_id      uuid not null references public.chef_profiles (id) on delete cascade,
  method       text not null check (method in ('business_confirmation', 'license_or_certificate', 'social_proof', 'in_person', 'provider')),
  evidence     text check (char_length(evidence) <= 1000),
  status       public.application_status not null default 'pending',
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Chef-service reviews: separate from food ratings. Only for chef services (private dining, catering...).
create table public.chef_reviews (
  id                uuid primary key default gen_random_uuid(),
  chef_id           uuid not null references public.chef_profiles (id) on delete cascade,
  reviewer_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  service           public.chef_service not null,
  food_quality      smallint not null check (food_quality between 1 and 10),
  professionalism   smallint check (professionalism between 1 and 10),
  communication     smallint check (communication between 1 and 10),
  presentation      smallint check (presentation between 1 and 10),
  timeliness        smallint check (timeliness between 1 and 10),
  value             smallint check (value between 1 and 10),
  would_book_again  boolean,
  body              text check (char_length(body) <= 1000),
  event_date        date,
  status            public.content_status not null default 'published',
  created_at        timestamptz not null default now(),
  unique (chef_id, reviewer_id, event_date),
  check (service <> 'restaurant_chef')   -- restaurant experiences are rated on the place and its dishes
);

alter table public.promotion_campaigns add constraint promotion_campaigns_chef_fk foreign key (chef_id) references public.chef_profiles (id) on delete cascade;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.chef_profiles enable row level security;
alter table public.chef_specialties enable row level security;
alter table public.chef_services enable row level security;
alter table public.chef_service_areas enable row level security;
alter table public.chef_business_relationships enable row level security;
alter table public.chef_menu_item_attributions enable row level security;
alter table public.chef_portfolio_items enable row level security;
alter table public.chef_service_packages enable row level security;
alter table public.chef_availability enable row level security;
alter table public.chef_verifications enable row level security;
alter table public.chef_reviews enable row level security;

create policy "chef_profiles: listed profiles are public" on public.chef_profiles for select to anon, authenticated
  using (is_listed or user_id = (select auth.uid()) or private.is_staff());
create policy "chef_profiles: chefs create their own" on public.chef_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_staff());
create policy "chef_profiles: chef and team edit" on public.chef_profiles for update to authenticated
  using (private.can_edit_chef(id)) with check (private.can_edit_chef(id));
create policy "chef_profiles: team deletes" on public.chef_profiles for delete to authenticated using (private.is_staff());

-- Child tables: public read with a listed profile, chef/team write.
create policy "chef_specialties: read" on public.chef_specialties for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_specialties: write" on public.chef_specialties for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));
create policy "chef_services: read" on public.chef_services for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_services: write" on public.chef_services for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));
create policy "chef_service_areas: read" on public.chef_service_areas for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_service_areas: write" on public.chef_service_areas for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));
create policy "chef_portfolio_items: read" on public.chef_portfolio_items for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_portfolio_items: write" on public.chef_portfolio_items for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));
create policy "chef_service_packages: read" on public.chef_service_packages for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_service_packages: write" on public.chef_service_packages for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));
create policy "chef_availability: read" on public.chef_availability for select to anon, authenticated using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_availability: write" on public.chef_availability for all to authenticated using (private.can_edit_chef(chef_id)) with check (private.can_edit_chef(chef_id));

-- Workplaces: public. A chef may self-report (shown as "self-reported"); only the business or the team can confirm.
create policy "chef_business_relationships: read" on public.chef_business_relationships for select to anon, authenticated
  using (exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_business_relationships: chef self-reports, business or team confirms" on public.chef_business_relationships for insert to authenticated
  with check ((private.can_edit_chef(chef_id) and verification_status = 'self_reported')
              or (private.can_edit_business(business_id) and verification_status = 'business_confirmed')
              or private.is_staff());
create policy "chef_business_relationships: chef, business or team update" on public.chef_business_relationships for update to authenticated
  using (private.can_edit_chef(chef_id) or private.can_edit_business(business_id))
  with check (private.is_staff()
              or (private.can_edit_business(business_id) and verification_status in ('self_reported', 'business_confirmed'))
              or (private.can_edit_chef(chef_id) and verification_status = 'self_reported'));
create policy "chef_business_relationships: chef, business or team delete" on public.chef_business_relationships for delete to authenticated
  using (private.can_edit_chef(chef_id) or private.can_edit_business(business_id));

-- Dish credits: only the business (or the team) can credit a chef with a dish. Chefs can't claim dishes alone.
create policy "chef_menu_item_attributions: read" on public.chef_menu_item_attributions for select to anon, authenticated
  using (exists (select 1 from public.menu_items m where m.id = menu_item_id) and exists (select 1 from public.chef_profiles c where c.id = chef_id));
create policy "chef_menu_item_attributions: business or team credits" on public.chef_menu_item_attributions for all to authenticated
  using (private.is_staff() or private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)))
  with check ((private.is_staff() and verification_status in ('admin_verified', 'provider', 'business_confirmed'))
              or (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) and verification_status = 'business_confirmed'));

create policy "chef_verifications: chef and team read" on public.chef_verifications for select to authenticated using (private.can_edit_chef(chef_id));
create policy "chef_verifications: chef requests" on public.chef_verifications for insert to authenticated
  with check (private.can_edit_chef(chef_id) and status = 'pending' and reviewed_by is null);
create policy "chef_verifications: team reviews" on public.chef_verifications for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "chef_reviews: published reviews are public" on public.chef_reviews for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.chef_profiles c where c.id = chef_id)) or reviewer_id = (select auth.uid()) or private.is_staff());
create policy "chef_reviews: members review, not their own profile" on public.chef_reviews for insert to authenticated
  with check (reviewer_id = (select auth.uid()) and status = 'published'
              and not exists (select 1 from public.chef_profiles c where c.id = chef_id and c.user_id = (select auth.uid())));
create policy "chef_reviews: edit your own, team moderates" on public.chef_reviews for update to authenticated
  using (reviewer_id = (select auth.uid()) or private.is_staff())
  with check ((reviewer_id = (select auth.uid()) and status = 'published') or private.is_staff());
create policy "chef_reviews: delete your own" on public.chef_reviews for delete to authenticated using (reviewer_id = (select auth.uid()));

-- Reports can target chef reviews and place ratings too.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('post', 'comment', 'profile', 'chef_review', 'place_rating', 'item_rating', 'chef_profile'));

-- Review summary. Chef rankings only show with enough reviews (see app: MIN_CHEF_REVIEWS).
create view public.chef_review_stats with (security_invoker = true) as
  select c.id as chef_id, count(r.id)::int as review_count,
         round(avg(r.food_quality), 1) as food_quality, round(avg(r.professionalism), 1) as professionalism,
         round(avg(r.communication), 1) as communication, round(avg(r.presentation), 1) as presentation,
         round(avg(r.timeliness), 1) as timeliness, round(avg(r.value), 1) as value,
         round(100.0 * avg(case when r.would_book_again then 1 when r.would_book_again = false then 0 end))::int as would_book_again_pct
    from public.chef_profiles c
    left join public.chef_reviews r on r.chef_id = c.id and r.status = 'published'
   group by c.id;

-- ── MAX Deep Dive: one server-side door to food intelligence ───────────
-- Returns only what the viewer's plan allows AND what the business chose to disclose, each with its source.
create or replace function public.item_deep_dive(p_item uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  m public.menu_items;
  i public.menu_item_intel;
  n public.menu_item_nutrition;
  can_max boolean := private.viewer_can('deep_dive');
  can_plus boolean := private.viewer_can('advanced_nutrition');
  editor boolean;
  show_nutrition boolean;
  locked text[] := '{}';
begin
  select * into m from public.menu_items where id = p_item;
  if not found or not exists (select 1 from public.businesses b where b.id = m.business_id) then return null; end if;
  editor := coalesce(private.can_edit_business(m.business_id), false);
  if m.is_alcoholic and not (private.viewer_has_pour_access() or editor) then return null; end if;
  select * into i from public.menu_item_intel where menu_item_id = p_item;
  select * into n from public.menu_item_nutrition where menu_item_id = p_item;
  can_max := can_max or editor;
  can_plus := can_plus or can_max;

  -- Business-sourced nutrition needs their OK; VYBR8 estimates and database values are always labeled and shown.
  show_nutrition := n.menu_item_id is not null and (n.source in ('estimated', 'database_provided', 'unknown') or coalesce(i.disclose_nutrition, false));
  if not can_plus then locked := array_append(locked, 'detailed_nutrition'); end if;
  if not can_max then locked := locked || array['whats_in_it', 'how_its_made', 'from_the_kitchen', 'recipe', 'chef', 'vybe_check', 'better_swap']; end if;

  return jsonb_build_object(
    'item', jsonb_build_object('id', m.id, 'name', m.name, 'description', m.description, 'price_cents', m.price_cents,
                               'category', m.category, 'dish_type', m.dish_type, 'is_alcoholic', m.is_alcoholic,
                               'business', (select jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'kind', b.kind) from public.businesses b where b.id = m.business_id)),
    'score', (select jsonb_build_object('avg', s.avg_score, 'count', s.rating_count) from public.menu_item_stats s where s.menu_item_id = m.id),
    'recipe_level', coalesce(i.recipe_level, 'unknown'),
    'nutrition', case when not show_nutrition then null
                      when can_plus then jsonb_build_object('calories', n.calories, 'protein_g', n.protein_g, 'carbs_g', n.carbs_g, 'fat_g', n.fat_g,
                                                            'fiber_g', n.fiber_g, 'sodium_mg', n.sodium_mg, 'sugar_g', n.sugar_g, 'source', n.source, 'source_note', n.source_note)
                      else jsonb_build_object('calories', n.calories, 'source', n.source, 'source_note', n.source_note) end,
    'ingredients', case when can_max and coalesce(i.disclose_ingredients, false) then
                     (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'detail', g.detail, 'source', g.source) order by g.position), '[]'::jsonb)
                        from public.menu_item_ingredients g where g.menu_item_id = m.id) end,
    'preparation', case when can_max and coalesce(i.disclose_preparation, false) then to_jsonb(i.preparation_steps) end,
    'recipe', case when can_max and i.recipe_level = 'verified_recipe' and i.disclose_recipe then i.recipe_text end,
    'allergens', case when coalesce(i.disclose_allergens, false) then to_jsonb(i.allergens) end,   -- allergens are safety info: free
    'kitchen_note', case when can_max then i.kitchen_note end,
    'estimate', case when can_max then i.estimate_text end,
    'source_note', i.source_note,
    'chefs', case when can_max then
               (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.professional_name, 'type', a.attribution_type, 'source', a.verification_status)), '[]'::jsonb)
                  from public.chef_menu_item_attributions a join public.chef_profiles c on c.id = a.chef_id
                 where a.menu_item_id = m.id and c.is_listed and (a.end_date is null or a.end_date >= current_date)) end,
    'locked', to_jsonb(locked),
    'plan', case when can_max then 'max' when can_plus then 'plus' else 'free' end
  );
end;
$$;
grant execute on function public.item_deep_dive(uuid) to anon, authenticated;

-- Better Swap candidates: similar items nearby, with nutrition only where it's actually known.
create or replace function public.item_swaps(p_item uuid, p_limit integer default 6)
returns table (id uuid, name text, business_slug text, business_name text, price_cents integer, calories integer, nutrition_source public.nutrition_source, avg_score numeric, same_place boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  m public.menu_items;
  v_city text;
begin
  if not private.viewer_can('better_swap') then return; end if;
  select * into m from public.menu_items where menu_items.id = p_item;
  if not found then return; end if;
  select l.city_slug into v_city from public.business_locations l where l.business_id = m.business_id order by l.is_primary desc limit 1;
  return query
    select x.id, x.name, b.slug::text, b.name, x.price_cents,
           case when nn.source in ('verified', 'restaurant_provided') and not coalesce(ii.disclose_nutrition, false) then null else nn.calories end,
           coalesce(nn.source, 'unknown'::public.nutrition_source), s.avg_score, x.business_id = m.business_id
      from public.menu_items x
      join public.businesses b on b.id = x.business_id
      left join public.menu_item_nutrition nn on nn.menu_item_id = x.id
      left join public.menu_item_intel ii on ii.menu_item_id = x.id
      left join public.menu_item_stats s on s.menu_item_id = x.id
     where x.id <> m.id and x.category = m.category and x.is_available
       and (not x.is_alcoholic or private.viewer_has_pour_access())
       and (x.dish_type = m.dish_type or x.section = m.section and x.business_id = m.business_id
            or x.name ilike '%' || split_part(m.name, ' ', array_length(string_to_array(m.name, ' '), 1)) || '%')
       and (x.business_id = m.business_id or exists (select 1 from public.business_locations l where l.business_id = x.business_id and l.city_slug = v_city))
     order by (x.business_id = m.business_id) desc, s.avg_score desc nulls last
     limit least(p_limit, 12);
end;
$$;
grant execute on function public.item_swaps(uuid, integer) to authenticated;

grant execute on all functions in schema private to anon, authenticated, service_role;
