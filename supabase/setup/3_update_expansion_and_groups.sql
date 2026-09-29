-- VYBR8 · UPDATE: run this if your Supabase has a "profiles" table but NO "chef_profiles" table (set up before the Chefs / Food Trucks / MAX expansion).
-- Includes the expansion and Groups & Family.

-- ═════ 20261002000100_menus_intel.sql ═════
-- VYBR8 · Expansion 1/4 · Menus, item & place ratings, food intelligence (MAX-ready)
--
-- Menu items belong to any business (restaurants, bars, cafés, food trucks...). Their deeper
-- information (ingredients, preparation, recipe, nutrition) always carries its provenance and is
-- only read through public.item_deep_dive(), which checks the viewer's plan on the server.

-- ── Provenance levels ──────────────────────────────────────────────────
create type public.recipe_level as enum ('verified_recipe', 'verified_ingredients', 'preparation_info', 'vybr8_estimate', 'unknown');
create type public.nutrition_source as enum ('verified', 'restaurant_provided', 'database_provided', 'estimated', 'unknown');
create type public.item_category as enum ('food', 'drink');

-- ── Menu items ─────────────────────────────────────────────────────────
create table public.menu_items (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 120),
  description     text check (char_length(description) <= 600),
  category        public.item_category not null default 'food',
  dish_type       text check (dish_type ~ '^[a-z0-9-]{2,40}$'),      -- chart bucket: wings, burger, birria-taco, margarita...
  section         text check (char_length(section) <= 60),           -- "Starters", "Cocktails"
  price_cents     integer check (price_cents between 0 and 1000000),
  is_alcoholic    boolean not null default false,
  is_available    boolean not null default true,
  sold_out_until  timestamptz,                                       -- food trucks: sold out for today
  position        smallint not null default 100,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (category = 'drink' or not is_alcoholic)
);
create index menu_items_business_idx on public.menu_items (business_id, position);
create index menu_items_dish_type_idx on public.menu_items (dish_type) where dish_type is not null;
create index menu_items_name_idx on public.menu_items using gin (to_tsvector('simple', name));
create trigger menu_items_updated_at before update on public.menu_items for each row execute function private.set_updated_at();

alter table public.menu_items enable row level security;
create policy "menu_items: visible with the place (alcohol 21+)"
  on public.menu_items for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id)
         and (not is_alcoholic or private.viewer_has_pour_access() or private.can_edit_business(business_id)));
create policy "menu_items: editors write"
  on public.menu_items for all to authenticated
  using (private.can_edit_business(business_id)) with check (private.can_edit_business(business_id) and not is_demo);

-- ── Ratings: individual items, and the place itself ────────────────────
create table public.item_ratings (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  score         numeric(3,1) not null check (score between 0 and 10),
  note          text check (char_length(note) <= 500),
  status        public.content_status not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (menu_item_id, user_id)
);
create index item_ratings_item_idx on public.item_ratings (menu_item_id) where status = 'published';
create trigger item_ratings_updated_at before update on public.item_ratings for each row execute function private.set_updated_at();

alter table public.item_ratings enable row level security;
create policy "item_ratings: visible with the item"
  on public.item_ratings for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.menu_items m where m.id = menu_item_id))
         or user_id = (select auth.uid()) or private.is_staff());
-- Rating is free for everyone. Alcohol items follow the Pours rule.
create policy "item_ratings: rate a visible item"
  on public.item_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'published'
              and exists (select 1 from public.menu_items m where m.id = menu_item_id
                          and (not m.is_alcoholic or private.viewer_has_pour_access())));
create policy "item_ratings: change your own"
  on public.item_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status = 'published');
create policy "item_ratings: delete your own"
  on public.item_ratings for delete to authenticated using (user_id = (select auth.uid()));

create table public.place_ratings (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  overall       numeric(3,1) not null check (overall between 0 and 10),
  service_vybe  numeric(3,1) check (service_vybe between 0 and 10),
  value         numeric(3,1) check (value between 0 and 10),
  aesthetic     numeric(3,1) check (aesthetic between 0 and 10),
  note          text check (char_length(note) <= 1000),
  status        public.content_status not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, user_id)
);
create index place_ratings_business_idx on public.place_ratings (business_id) where status = 'published';
create trigger place_ratings_updated_at before update on public.place_ratings for each row execute function private.set_updated_at();

alter table public.place_ratings enable row level security;
create policy "place_ratings: visible with the place"
  on public.place_ratings for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.businesses b where b.id = business_id))
         or user_id = (select auth.uid()) or private.is_staff());
create policy "place_ratings: rate a place"
  on public.place_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'published'
              and exists (select 1 from public.businesses b where b.id = business_id)
              and not private.is_business_member(business_id));   -- no rating your own place
create policy "place_ratings: change your own"
  on public.place_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status = 'published');
create policy "place_ratings: delete your own"
  on public.place_ratings for delete to authenticated using (user_id = (select auth.uid()));

-- Aggregates (respect the underlying RLS: invoker views).
create view public.menu_item_stats with (security_invoker = true) as
  select m.id as menu_item_id, m.business_id, m.dish_type, m.category,
         count(r.id)::int as rating_count, round(avg(r.score), 1) as avg_score
    from public.menu_items m
    left join public.item_ratings r on r.menu_item_id = m.id and r.status = 'published'
   group by m.id;

create view public.place_stats with (security_invoker = true) as
  select b.id as business_id, count(r.id)::int as rating_count,
         round(avg(r.overall), 1) as overall, round(avg(r.service_vybe), 1) as service_vybe,
         round(avg(r.value), 1) as value, round(avg(r.aesthetic), 1) as aesthetic
    from public.businesses b
    left join public.place_ratings r on r.business_id = b.id and r.status = 'published'
   group by b.id;

-- ── Food intelligence (MAX Deep Dive) ──────────────────────────────────
-- What the business/chef chose to disclose, and where each fact came from.
create table public.menu_item_intel (
  menu_item_id        uuid primary key references public.menu_items (id) on delete cascade,
  recipe_level        public.recipe_level not null default 'unknown',
  disclose_recipe     boolean not null default false,
  disclose_ingredients boolean not null default false,
  disclose_preparation boolean not null default false,
  disclose_allergens  boolean not null default false,
  disclose_nutrition  boolean not null default false,
  recipe_text         text check (char_length(recipe_text) <= 8000),
  preparation_steps   text[] check (coalesce(array_length(preparation_steps, 1), 0) <= 30),
  allergens           text[] check (coalesce(array_length(allergens, 1), 0) <= 20),
  kitchen_note        text check (char_length(kitchen_note) <= 600),     -- FROM THE KITCHEN
  source_note         text check (char_length(source_note) <= 300),      -- who supplied it
  estimate_text       text check (char_length(estimate_text) <= 2000),   -- VYBR8 ESTIMATE: labeled, never a claimed recipe
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  -- A "verified" level needs the matching disclosure.
  check (recipe_level <> 'verified_recipe' or (disclose_recipe and recipe_text is not null)),
  check (recipe_level <> 'verified_ingredients' or disclose_ingredients)
);

create table public.menu_item_ingredients (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  detail        text check (char_length(detail) <= 120),
  position      smallint not null default 100,
  source        public.recipe_level not null default 'verified_ingredients'
);
create index menu_item_ingredients_item_idx on public.menu_item_ingredients (menu_item_id, position);

create table public.menu_item_nutrition (
  menu_item_id  uuid primary key references public.menu_items (id) on delete cascade,
  calories      integer check (calories between 0 and 10000),
  protein_g     numeric(6,1) check (protein_g >= 0),
  carbs_g       numeric(6,1) check (carbs_g >= 0),
  fat_g         numeric(6,1) check (fat_g >= 0),
  fiber_g       numeric(6,1) check (fiber_g >= 0),
  sodium_mg     integer check (sodium_mg >= 0),
  sugar_g       numeric(6,1) check (sugar_g >= 0),
  source        public.nutrition_source not null default 'unknown',
  source_note   text check (char_length(source_note) <= 200),
  updated_at    timestamptz not null default now()
);

alter table public.menu_item_intel enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.menu_item_nutrition enable row level security;
-- Direct reads only for the business's editors and the VYBR8 Team. Everyone else goes through item_deep_dive().
create policy "menu_item_intel: editors" on public.menu_item_intel for all to authenticated
  using (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff())
  with check (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff());
create policy "menu_item_ingredients: editors" on public.menu_item_ingredients for all to authenticated
  using (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff())
  with check (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff());
create policy "menu_item_nutrition: editors" on public.menu_item_nutrition for all to authenticated
  using (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff())
  with check (private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)) or private.is_staff());

-- ── Personal nutrition (owner-only; wellness information, not medical advice) ──
create table public.nutrition_targets (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  goal        text check (goal in ('maintain', 'weight_management', 'muscle_gain', 'performance', 'custom')),
  calories    integer check (calories between 800 and 8000),
  protein_g   integer check (protein_g between 0 and 500),
  carbs_g     integer check (carbs_g between 0 and 1000),
  fat_g       integer check (fat_g between 0 and 400),
  fiber_g     integer check (fiber_g between 0 and 150),
  sodium_mg   integer check (sodium_mg between 0 and 10000),
  sugar_g     integer check (sugar_g between 0 and 500),
  updated_at  timestamptz not null default now()
);
create table public.food_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  menu_item_id  uuid references public.menu_items (id) on delete set null,
  name          text not null check (char_length(trim(name)) between 1 and 120),
  portion       numeric(3,2) not null default 1 check (portion > 0 and portion <= 5),   -- 0.5 = split it
  calories      integer check (calories between 0 and 20000),
  protein_g     numeric(6,1), carbs_g numeric(6,1), fat_g numeric(6,1),
  sodium_mg     integer, sugar_g numeric(6,1), fiber_g numeric(6,1),
  nutrition_source public.nutrition_source not null default 'unknown',
  logged_at     timestamptz not null default now()
);
create index food_logs_user_day_idx on public.food_logs (user_id, logged_at desc);
alter table public.nutrition_targets enable row level security;
alter table public.food_logs enable row level security;
create policy "nutrition_targets: owner only" on public.nutrition_targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "food_logs: owner only" on public.food_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ═════ 20261002000200_plans_entitlements.sql ═════
-- VYBR8 · Expansion 2/4 · Plans and entitlements
--
-- One source of truth for "who can use what". The app asks the server (can_use / my_plan);
-- it never compares plan names in components. Payments (Stripe) will write subscriptions later;
-- until then the founder/admins can grant plans. Rating is always free.

create type public.plan_audience as enum ('consumer', 'business', 'chef');
create type public.subscription_status as enum ('active', 'trialing', 'past_due', 'canceled');
create type public.subscription_source as enum ('stripe', 'admin_grant', 'promo');

create table public.plans (
  code                text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  audience            public.plan_audience not null,
  name                text not null,
  tagline             text,
  price_monthly_cents integer check (price_monthly_cents >= 0),
  price_yearly_cents  integer check (price_yearly_cents >= 0),
  is_public           boolean not null default true,     -- Chef Pro stays hidden until pricing is approved
  rank                smallint not null default 0,       -- higher includes lower within an audience
  created_at          timestamptz not null default now()
);

create table public.plan_entitlements (
  plan_code    text not null references public.plans (code) on delete cascade,
  entitlement  text not null check (entitlement ~ '^[a-z0-9_]{2,60}$'),
  primary key (plan_code, entitlement)
);

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
create policy "plans: public plans are public" on public.plans for select to anon, authenticated using (is_public or private.is_staff());
create policy "plan_entitlements: readable with the plan" on public.plan_entitlements for select to anon, authenticated
  using (exists (select 1 from public.plans p where p.code = plan_code and (p.is_public or private.is_staff())));

insert into public.plans (code, audience, name, tagline, price_monthly_cents, price_yearly_cents, is_public, rank) values
  ('free',            'consumer', 'Free',     'Everything you need to find what''s good.', 0, 0, true, 0),
  ('plus',            'consumer', 'VYBR8+',   'No ads, smarter matching, detailed nutrition.', 699, 4999, true, 1),
  ('max',             'consumer', 'VYBR8 MAX','Know your food. Know your vybe.', 999, 7999, true, 2),
  ('business_free',   'business', 'Business Free', 'Claim your place and run your menu.', 0, 0, true, 0),
  ('business_pro',    'business', 'Pro',      'See what''s working on your menu.', 4900, null, true, 1),
  ('business_growth', 'business', 'Growth',   'Campaigns, specials and deeper trends.', 9900, null, true, 2),
  ('chef_free',       'chef',     'Chef',     'Your professional chef profile, free.', 0, 0, true, 0),
  ('chef_pro',        'chef',     'Chef Pro', 'Coming later.', null, null, false, 1);

-- Each plan lists everything it includes (higher tiers repeat lower ones on purpose: easy to audit).
insert into public.plan_entitlements (plan_code, entitlement)
select p.code, e.key
from (values
  -- Free (consumer)
  ('free', 'local_discovery'), ('free', 'item_ratings'), ('free', 'charts'), ('free', 'link_ups'), ('free', 'basic_group_vybe'),
  ('free', 'basic_vybe_match'), ('free', 'basic_food_logging'), ('free', 'basic_nutrition'), ('free', 'food_truck_schedules'), ('free', 'chef_profiles'),
  -- VYBR8+
  ('plus', 'ad_free'), ('plus', 'advanced_vybe_match'), ('plus', 'advanced_filters'), ('plus', 'advanced_taste_profile'), ('plus', 'deeper_taste_match'),
  ('plus', 'advanced_group_vybe'), ('plus', 'expanded_group_explanations'), ('plus', 'advanced_menu_matching'), ('plus', 'advanced_nutrition'),
  ('plus', 'custom_nutrition_targets'), ('plus', 'weekly_nutrition_insights'), ('plus', 'meal_history_analytics'), ('plus', 'nutrition_aware_recs'),
  ('plus', 'expanded_active_vybe'), ('plus', 'advanced_saves'),
  -- MAX
  ('max', 'deep_dive'), ('max', 'ingredient_intelligence'), ('max', 'recipe_provenance'), ('max', 'preparation_method'), ('max', 'chef_information'),
  ('max', 'goal_impact'), ('max', 'make_it_work'), ('max', 'better_swap'), ('max', 'eating_it_anyway'), ('max', 'advanced_active_vybe'),
  ('max', 'meal_planning'), ('max', 'advanced_daily_planning'), ('max', 'weekly_reports'), ('max', 'smart_substitutions'), ('max', 'ai_food_intelligence'),
  ('max', 'personalized_recs'),
  -- Business Free
  ('business_free', 'claim_business'), ('business_free', 'menu_management'), ('business_free', 'photos'), ('business_free', 'links'),
  ('business_free', 'food_truck_schedule_management'), ('business_free', 'public_ratings'), ('business_free', 'review_responses'), ('business_free', 'basic_analytics'),
  -- Business Pro
  ('business_pro', 'business_advanced_analytics'), ('business_pro', 'item_performance'), ('business_pro', 'menu_analytics'), ('business_pro', 'rating_trends'),
  ('business_pro', 'ranking_movement'), ('business_pro', 'interest_trends'), ('business_pro', 'saves_analytics'), ('business_pro', 'group_vybe_insights'),
  ('business_pro', 'budget_exclusion_insights'), ('business_pro', 'shareable_graphics'), ('business_pro', 'performance_dashboard'),
  -- Business Growth
  ('business_growth', 'category_analytics'), ('business_growth', 'campaign_tools'), ('business_growth', 'multiple_specials'),
  ('business_growth', 'promotion_management'), ('business_growth', 'customer_trend_insights'), ('business_growth', 'enhanced_menu_tools'),
  ('business_growth', 'marketing_tools'), ('business_growth', 'multi_location'),
  -- Chef Free
  ('chef_free', 'chef_profile'), ('chef_free', 'chef_portfolio'), ('chef_free', 'chef_booking_link'), ('chef_free', 'chef_availability_status'),
  -- Chef Pro (hidden until approved)
  ('chef_pro', 'booking_leads'), ('chef_pro', 'chef_analytics'), ('chef_pro', 'enhanced_portfolio'), ('chef_pro', 'availability_calendar'),
  ('chef_pro', 'lead_management'), ('chef_pro', 'verified_professional_badge'), ('chef_pro', 'service_packages_pro')
) as e(tier, key)
join public.plans p on p.audience = (select audience from public.plans where code = e.tier)
                   and p.rank >= (select rank from public.plans where code = e.tier);

-- ── Subscriptions ──────────────────────────────────────────────────────
create table public.user_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  plan_code            text not null references public.plans (code),
  status               public.subscription_status not null default 'active',
  source               public.subscription_source not null,
  provider_ref         text,                 -- Stripe subscription id
  current_period_end   timestamptz,
  granted_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index user_subscriptions_user_idx on public.user_subscriptions (user_id, status);

create table public.business_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  plan_code            text not null references public.plans (code),
  status               public.subscription_status not null default 'active',
  source               public.subscription_source not null,
  provider_ref         text,
  current_period_end   timestamptz,
  granted_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index business_subscriptions_business_idx on public.business_subscriptions (business_id, status);

alter table public.user_subscriptions enable row level security;
alter table public.business_subscriptions enable row level security;
create policy "user_subscriptions: owner and admins read" on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
create policy "business_subscriptions: business team and admins read" on public.business_subscriptions for select to authenticated
  using (private.is_business_member(business_id) or private.is_admin());
-- Writes: payment webhook (service role) or grant_plan() below.

-- ── Plan resolution ────────────────────────────────────────────────────
create or replace function private.user_plan(p_user uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan_code from public.user_subscriptions s join public.plans p on p.code = s.plan_code
     where s.user_id = p_user and p.audience = 'consumer' and s.status in ('active', 'trialing')
       and (s.current_period_end is null or s.current_period_end > now())
     order by p.rank desc limit 1), 'free');
$$;

create or replace function private.user_can(p_user uuid, p_entitlement text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.plan_entitlements where plan_code = private.user_plan(p_user) and entitlement = p_entitlement);
$$;

-- The VYBR8 Team can use everything (to support members and test features).
create or replace function private.viewer_can(p_entitlement text)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.is_staff() or ((select auth.uid()) is not null and private.user_can((select auth.uid()), p_entitlement)); $$;

create or replace function private.business_plan(p_business uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan_code from public.business_subscriptions s join public.plans p on p.code = s.plan_code
     where s.business_id = p_business and p.audience = 'business' and s.status in ('active', 'trialing')
       and (s.current_period_end is null or s.current_period_end > now())
     order by p.rank desc limit 1), 'business_free');
$$;

create or replace function private.business_can(p_business uuid, p_entitlement text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or (private.is_business_member(p_business)
    and exists (select 1 from public.plan_entitlements where plan_code = private.business_plan(p_business) and entitlement = p_entitlement));
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- What the app reads: the viewer's plan and entitlements.
create or replace function public.my_plan()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', case when (select auth.uid()) is null then 'free' else private.user_plan((select auth.uid())) end,
    'entitlements', coalesce((select jsonb_agg(entitlement order by entitlement) from public.plan_entitlements
                               where plan_code = case when (select auth.uid()) is null then 'free' else private.user_plan((select auth.uid())) end), '[]'::jsonb),
    'staff', private.is_staff());
$$;
grant execute on function public.my_plan() to anon, authenticated;

create or replace function public.business_plan_info(p_business uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (private.is_business_member(p_business) or private.is_admin()) then raise exception 'not your business' using errcode = '42501'; end if;
  return jsonb_build_object('plan', private.business_plan(p_business),
    'entitlements', coalesce((select jsonb_agg(entitlement order by entitlement) from public.plan_entitlements
                               where plan_code = private.business_plan(p_business)), '[]'::jsonb));
end;
$$;
revoke execute on function public.business_plan_info(uuid) from public, anon;
grant execute on function public.business_plan_info(uuid) to authenticated;

-- Until payments are live: the founder/admins grant plans (comps, testers, early partners). Audited.
create or replace function public.grant_plan(p_user uuid, p_plan text, p_days integer default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where code = p_plan and audience = 'consumer') then raise exception 'unknown plan' using errcode = '22023'; end if;
  update public.user_subscriptions set status = 'canceled', updated_at = now()
   where user_id = p_user and source = 'admin_grant' and status = 'active';
  if p_plan <> 'free' then
    insert into public.user_subscriptions (user_id, plan_code, source, current_period_end, granted_by)
    values (p_user, p_plan, 'admin_grant', case when p_days is null then null else now() + make_interval(days => p_days) end, auth.uid());
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'plan.granted', 'profile', p_user, jsonb_build_object('plan', p_plan, 'days', p_days));
end;
$$;
revoke execute on function public.grant_plan(uuid, text, integer) from public, anon;
grant execute on function public.grant_plan(uuid, text, integer) to authenticated;

-- ── Promotions (paid placement; never changes scores or organic rank) ──
create type public.promotion_placement as enum
  ('promoted_venue', 'promoted_dish', 'promoted_cocktail', 'promoted_food_truck', 'promoted_chef', 'promoted_catering', 'sponsored_special');
create type public.promotion_status as enum ('draft', 'pending_review', 'active', 'paused', 'ended', 'rejected');

create table public.promotion_campaigns (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses (id) on delete cascade,
  chef_id       uuid,                                   -- FK added with chef_profiles
  menu_item_id  uuid references public.menu_items (id) on delete set null,
  placement     public.promotion_placement not null,
  surface       text check (surface in ('near_you', 'food_trucks_today', 'lunch_near_you', 'this_weekend', 'trending_trucks', 'explore', 'chefs')),
  label         text not null default 'Promoted' check (label in ('Promoted', 'Sponsored')),   -- always shown
  headline      text check (char_length(headline) <= 80),
  city_slug     text references public.cities (slug),
  status        public.promotion_status not null default 'draft',
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (business_id is not null or chef_id is not null),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.promotion_campaigns enable row level security;
create policy "promotion_campaigns: active ones are public"
  on public.promotion_campaigns for select to anon, authenticated
  using ((status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or (business_id is not null and private.is_business_member(business_id)) or private.is_staff());
-- Businesses draft campaigns (needs Growth); only the VYBR8 Team can activate one (after payment and review).
create policy "promotion_campaigns: businesses draft"
  on public.promotion_campaigns for insert to authenticated
  with check (business_id is not null and private.business_can(business_id, 'campaign_tools') and status in ('draft', 'pending_review'));
create policy "promotion_campaigns: businesses edit drafts, team manages"
  on public.promotion_campaigns for update to authenticated
  using ((business_id is not null and private.can_edit_business(business_id) and status in ('draft', 'pending_review')) or private.is_staff())
  with check ((business_id is not null and private.can_edit_business(business_id) and status in ('draft', 'pending_review', 'paused')) or private.is_staff());

-- ═════ 20261002000300_chefs.sql ═════
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

-- ═════ 20261002000400_food_trucks.sql ═════
-- VYBR8 · Expansion 4/4 · Food trucks
--
-- A food truck is a business (kind 'food_truck') so it shares menus, item ratings, place ratings,
-- claims and dashboards. What's different: it moves. Every location has a time window and a source,
-- and a manually reported "WE'RE HERE" always expires.

create type public.truck_stop_status as enum ('scheduled', 'open', 'delayed', 'cancelled', 'sold_out', 'closed');
create type public.location_source as enum ('operator', 'vybr8_team', 'community', 'provider');

create table public.food_truck_profiles (
  business_id        uuid primary key references public.businesses (id) on delete cascade,
  cuisine            text check (char_length(cuisine) <= 60),
  truck_photo_url    text check (truck_photo_url is null or truck_photo_url ~ '^(https://|/)'),
  ordering_url       text check (ordering_url is null or ordering_url ~ '^https://'),
  socials            jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 6),
  catering_available boolean not null default false,
  home_city_slug     text references public.cities (slug),
  updated_at         timestamptz not null default now()
);

create table public.food_truck_schedules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  location_name  text not null check (char_length(trim(location_name)) between 2 and 80),
  address        text check (char_length(address) <= 160),
  latitude       numeric(9,6) check (latitude between -90 and 90),
  longitude      numeric(9,6) check (longitude between -180 and 180),
  city_slug      text references public.cities (slug),
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  event_name     text check (char_length(event_name) <= 80),     -- "Friday Night Market" (food_truck_events live here)
  status         public.truck_stop_status not null default 'scheduled',
  source         public.location_source not null default 'operator',
  verified_at    timestamptz,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_at > start_at and end_at <= start_at + interval '18 hours')
);
create index food_truck_schedules_when_idx on public.food_truck_schedules (city_slug, start_at);
create index food_truck_schedules_truck_idx on public.food_truck_schedules (business_id, start_at);
create trigger food_truck_schedules_updated_at before update on public.food_truck_schedules for each row execute function private.set_updated_at();

-- "WE'RE HERE": a live pin set by a verified operator. Max 8 hours, then it disappears on its own.
create table public.food_truck_live_status (
  business_id  uuid primary key references public.businesses (id) on delete cascade,
  latitude     numeric(9,6) not null check (latitude between -90 and 90),
  longitude    numeric(9,6) not null check (longitude between -180 and 180),
  city_slug    text references public.cities (slug),
  note         text check (char_length(note) <= 120),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  set_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  check (expires_at > started_at and expires_at <= started_at + interval '8 hours')
);

create table public.food_truck_follows (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  notify       boolean not null default true,     -- "Notify me" when a new stop is posted
  created_at   timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- Only trucks get truck features.
create or replace function private.is_food_truck(p_business uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.businesses where id = p_business and kind = 'food_truck'); $$;

alter table public.food_truck_profiles enable row level security;
alter table public.food_truck_schedules enable row level security;
alter table public.food_truck_live_status enable row level security;
alter table public.food_truck_follows enable row level security;

create policy "food_truck_profiles: public" on public.food_truck_profiles for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_profiles: operators write" on public.food_truck_profiles for all to authenticated
  using (private.can_edit_business(business_id)) with check (private.can_edit_business(business_id) and private.is_food_truck(business_id));

create policy "food_truck_schedules: public" on public.food_truck_schedules for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_schedules: operators write" on public.food_truck_schedules for all to authenticated
  using (private.can_edit_business(business_id) or private.is_staff())
  with check ((private.can_edit_business(business_id) and source = 'operator' or private.is_staff()) and private.is_food_truck(business_id));

create policy "food_truck_live_status: public while live" on public.food_truck_live_status for select to anon, authenticated
  using (expires_at > now() and exists (select 1 from public.businesses b where b.id = business_id));
create policy "food_truck_live_status: operators set" on public.food_truck_live_status for all to authenticated
  using (private.can_edit_business(business_id))
  with check (private.can_edit_business(business_id) and private.is_food_truck(business_id));

create policy "food_truck_follows: own" on public.food_truck_follows for select to authenticated using (user_id = (select auth.uid()));
create policy "food_truck_follows: follow" on public.food_truck_follows for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_food_truck(business_id));
create policy "food_truck_follows: change" on public.food_truck_follows for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "food_truck_follows: unfollow" on public.food_truck_follows for delete to authenticated using (user_id = (select auth.uid()));

-- Follower counts for operators and profile pages (numbers only, never who).
create or replace function public.food_truck_follower_count(p_business uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.food_truck_follows where business_id = p_business; $$;
grant execute on function public.food_truck_follower_count(uuid) to anon, authenticated;

-- food_truck_notifications: a new or re-opened stop notifies followers who asked (in-app alerts).
create or replace function private.food_truck_notify_followers()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  truck text;
begin
  if new.status in ('cancelled', 'closed') or new.end_at < now() then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status and old.start_at = new.start_at and old.location_name = new.location_name then return new; end if;
  select name into truck from public.businesses where id = new.business_id;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select f.user_id, 'truck.stop',
         case when new.status = 'open' then truck || ' is open' when new.status = 'delayed' then truck || ' is running late' else truck || ' posted a stop' end,
         new.location_name || coalesce(' · ' || new.event_name, ''),
         '/food-trucks/' || (select slug from public.businesses where id = new.business_id),
         'truck.stop:' || new.id || ':' || new.status
    from public.food_truck_follows f
   where f.business_id = new.business_id and f.notify
  on conflict do nothing;
  return new;
end;
$$;
create trigger food_truck_schedules_notify after insert or update on public.food_truck_schedules
  for each row execute function private.food_truck_notify_followers();

-- What's where, right now or soon, in a city. A scheduled future stop is never shown as "here now".
create or replace function public.food_trucks_in_city(p_city text, p_from timestamptz default now(), p_to timestamptz default now() + interval '7 days')
returns table (business_id uuid, slug text, name text, cuisine text, stop_id uuid, location_name text, address text, event_name text,
               latitude numeric, longitude numeric, start_at timestamptz, end_at timestamptz, status public.truck_stop_status,
               is_live boolean, live_note text, live_until timestamptz)
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select * from public.food_truck_live_status where expires_at > now() and (city_slug = p_city or city_slug is null)
  )
  select b.id, b.slug::text, b.name, p.cuisine, s.id, s.location_name, s.address, s.event_name,
         coalesce(lv.latitude, s.latitude), coalesce(lv.longitude, s.longitude), s.start_at, s.end_at, s.status,
         lv.business_id is not null and (s.id is null or (s.start_at <= now() and s.end_at > now())), lv.note, lv.expires_at
    from public.businesses b
    left join public.food_truck_profiles p on p.business_id = b.id
    left join live lv on lv.business_id = b.id
    left join lateral (
      select * from public.food_truck_schedules x
       where x.business_id = b.id and x.end_at > p_from and x.start_at < p_to and x.status <> 'cancelled'
         and (x.city_slug = p_city or x.city_slug is null)
       order by x.start_at limit 1) s on true
   where b.kind = 'food_truck' and b.status = 'active' and b.deleted_at is null
     and (s.id is not null or lv.business_id is not null or p.home_city_slug = p_city);
$$;
grant execute on function public.food_trucks_in_city(text, timestamptz, timestamptz) to anon, authenticated;

-- ═════ 20261003000100_groups_family.sql ═════
-- VYBR8 · Groups: Family, Dating, Friends, Organizations, For The Kids (FTK)
--
-- • Anyone can make several groups. People are invited and must accept (no one is added to a
--   "family" or "dating" group without saying yes).
-- • Parents/guardians can add kid profiles (no app account needed). Kid profiles hold only a first
--   name, optional birthday, and food tastes, and are visible only to their guardians and the
--   groups the guardian puts them in.
-- • When a kid is 13+, a guardian makes a one-time transfer code. The kid signs up and enters it:
--   the profile becomes theirs, their tastes move over, and they stay in the family.
-- • Groups plan outings (date nights, family dinners) with menu picks per person.

create type public.group_kind as enum ('family', 'dating', 'friends', 'organization', 'ftk');
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.group_member_status as enum ('invited', 'active');
create type public.group_relationship as enum
  ('partner', 'girlfriend', 'boyfriend', 'wife', 'husband', 'spouse', 'fiance', 'parent', 'child', 'sibling', 'grandparent',
   'cousin', 'aunt_uncle', 'relative', 'friend', 'coworker', 'teammate', 'member', 'other');

-- ── Kid profiles (dependents) ──────────────────────────────────────────
create table public.dependents (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null check (char_length(trim(first_name)) between 1 and 40),
  birthdate    date check (birthdate <= current_date),
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  claimed_by   uuid unique references public.profiles (id) on delete set null,   -- set when the kid takes over their profile
  claimed_at   timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.dependent_guardians (
  dependent_id  uuid not null references public.dependents (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (dependent_id, user_id)
);

create or replace function private.is_guardian(p_dependent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.dependent_guardians where dependent_id = p_dependent and user_id = (select auth.uid())); $$;

create or replace function private.guardian_count(p_dependent uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.dependent_guardians where dependent_id = p_dependent; $$;

-- The creator becomes the first guardian.
create or replace function private.dependents_add_guardian()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.dependent_guardians (dependent_id, user_id) values (new.id, new.created_by); return new; end; $$;
create trigger dependents_add_guardian after insert on public.dependents for each row execute function private.dependents_add_guardian();

-- ── Groups ─────────────────────────────────────────────────────────────
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 60),
  kind         public.group_kind not null,
  description  text check (char_length(description) <= 280),
  city_slug    text references public.cities (slug),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger groups_updated_at before update on public.groups for each row execute function private.set_updated_at();

create table public.group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete cascade,
  dependent_id  uuid references public.dependents (id) on delete cascade,
  role          public.group_role not null default 'member',
  status        public.group_member_status not null default 'invited',
  relationship  public.group_relationship not null default 'member',
  invited_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((user_id is null) <> (dependent_id is null)),
  check (dependent_id is null or (status = 'active' and role = 'member'))
);
create unique index group_members_user_idx on public.group_members (group_id, user_id) where user_id is not null;
create unique index group_members_dependent_idx on public.group_members (group_id, dependent_id) where dependent_id is not null;
create index group_members_by_user on public.group_members (user_id) where user_id is not null;

create or replace function private.group_role_of(p_group uuid)
returns public.group_role language sql stable security definer set search_path = ''
as $$ select role from public.group_members where group_id = p_group and user_id = (select auth.uid()) and status = 'active'; $$;

create or replace function private.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.group_role_of(p_group) is not null; $$;

create or replace function private.can_manage_group(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.group_role_of(p_group) in ('owner', 'admin'), false); $$;

-- Groups I share with someone (used to share tastes for planning).
create or replace function private.shares_group_with_user(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
                  where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_user and b.status = 'active');
$$;
create or replace function private.shares_group_with_dependent(p_dependent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
                  where a.user_id = (select auth.uid()) and a.status = 'active' and b.dependent_id = p_dependent);
$$;

create or replace function private.user_is_adult(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select private.age_on(birthdate, current_date) >= 18 from public.user_birthdays where user_id = p_user), false); $$;

-- The owner joins as the first member.
create or replace function private.groups_add_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, relationship, invited_by)
  values (new.id, new.owner_id, 'owner', 'active', case new.kind when 'dating' then 'partner' when 'family' then 'relative' when 'friends' then 'friend' else 'member' end::public.group_relationship, new.owner_id);
  return new;
end;
$$;
create trigger groups_add_owner after insert on public.groups for each row execute function private.groups_add_owner();

create or replace function private.groups_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.is_demo then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.kind = 'dating' and not private.user_is_adult(new.owner_id) then
      raise exception 'dating groups are for people 18 and older' using errcode = '42501';
    end if;
    if (select count(*) from public.groups where owner_id = new.owner_id) >= 25 then
      raise exception 'you can own up to 25 groups' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.owner_id <> old.owner_id or new.kind <> old.kind or new.is_demo <> old.is_demo then
    raise exception 'that change is not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger groups_guard before insert or update on public.groups for each row execute function private.groups_guard();

-- Size limits and safety rules on membership.
create or replace function private.group_members_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare
  g public.groups;
  n integer;
begin
  select * into g from public.groups where id = new.group_id;
  select count(*) into n from public.group_members where group_id = new.group_id and id <> new.id;
  if n >= (case g.kind when 'dating' then 2 when 'family' then 30 when 'friends' then 50 when 'ftk' then 50 else 200 end) then
    raise exception 'this group is full' using errcode = '23514';
  end if;
  if g.kind = 'dating' and (new.dependent_id is not null or (new.user_id is not null and not private.user_is_adult(new.user_id))) then
    raise exception 'dating groups are for two people 18 and older' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_guard before insert on public.group_members for each row execute function private.group_members_guard();

-- ── Tastes (for planning and suggestions) ──────────────────────────────
create table public.taste_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references public.profiles (id) on delete cascade,
  dependent_id  uuid unique references public.dependents (id) on delete cascade,
  likes         text[] not null default '{}' check (array_length(likes, 1) is null or array_length(likes, 1) <= 30),
  dislikes      text[] not null default '{}' check (array_length(dislikes, 1) is null or array_length(dislikes, 1) <= 30),
  allergies     text[] not null default '{}' check (array_length(allergies, 1) is null or array_length(allergies, 1) <= 15),
  dietary       text[] not null default '{}' check (array_length(dietary, 1) is null or array_length(dietary, 1) <= 10),
  spice         smallint check (spice between 0 and 4),       -- 0 none … 4 very hot
  kids_menu     boolean not null default false,
  notes         text check (char_length(notes) <= 280),
  updated_at    timestamptz not null default now(),
  check ((user_id is null) <> (dependent_id is null))
);

-- ── Plans (date nights, family dinners) with menu picks ────────────────
create table public.group_plans (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 2 and 80),
  planned_for   timestamptz,
  business_id   uuid references public.businesses (id) on delete set null,
  notes         text check (char_length(notes) <= 500),
  status        text not null default 'planned' check (status in ('idea', 'planned', 'done', 'cancelled')),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index group_plans_group_idx on public.group_plans (group_id, planned_for);

create table public.group_plan_picks (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.group_plans (id) on delete cascade,
  member_id     uuid not null references public.group_members (id) on delete cascade,   -- who it's for (adult or kid)
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  note          text check (char_length(note) <= 140),
  added_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (plan_id, member_id, menu_item_id)
);

-- ── Transfer codes (kid takes over their profile at 13+) ───────────────
create table public.dependent_transfers (
  id            uuid primary key default gen_random_uuid(),
  dependent_id  uuid not null references public.dependents (id) on delete cascade,
  token_hash    text not null unique,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null default now() + interval '30 days',
  redeemed_by   uuid references public.profiles (id) on delete set null,
  redeemed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.dependents enable row level security;
alter table public.dependent_guardians enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.group_plans enable row level security;
alter table public.group_plan_picks enable row level security;
alter table public.dependent_transfers enable row level security;

-- Kid profiles: guardians, the kid once they've claimed it, and people in a group with them.
create policy "dependents: guardians, claimed kid and shared groups read" on public.dependents for select to authenticated
  using (private.is_guardian(id) or claimed_by = (select auth.uid()) or private.shares_group_with_dependent(id));
create policy "dependents: parents add kids" on public.dependents for insert to authenticated
  with check (created_by = (select auth.uid()) and claimed_by is null and not is_demo);
create policy "dependents: guardians edit until the kid takes over" on public.dependents for update to authenticated
  using (private.is_guardian(id) and claimed_by is null)
  with check (private.is_guardian(id) and claimed_by is null);
create policy "dependents: guardians remove until the kid takes over" on public.dependents for delete to authenticated
  using (private.is_guardian(id) and claimed_by is null);

create policy "dependent_guardians: guardians read" on public.dependent_guardians for select to authenticated
  using (private.is_guardian(dependent_id) or user_id = (select auth.uid()));
-- A guardian can add a co-parent (who must be in a family group with them).
create policy "dependent_guardians: guardians add co-parents" on public.dependent_guardians for insert to authenticated
  with check (private.is_guardian(dependent_id) and private.shares_group_with_user(user_id)
              and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null));
create policy "dependent_guardians: step back" on public.dependent_guardians for delete to authenticated
  using (user_id = (select auth.uid()) and private.guardian_count(dependent_id) > 1);

create policy "groups: members and invitees read" on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or exists (select 1 from public.group_members m where m.group_id = groups.id and m.user_id = (select auth.uid())));
create policy "groups: anyone creates" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "groups: owner and admins edit" on public.groups for update to authenticated
  using (private.can_manage_group(id)) with check (private.can_manage_group(id));
create policy "groups: owner deletes" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

create policy "group_members: members see the group; invitees see their invite" on public.group_members for select to authenticated
  using (private.is_group_member(group_id) or user_id = (select auth.uid()));
-- Owners/admins invite people (status invited; they must accept) and add kids they're a guardian of.
create policy "group_members: invite or add your kid" on public.group_members for insert to authenticated
  with check (private.can_manage_group(group_id) and role <> 'owner' and invited_by = (select auth.uid())
              and ((user_id is not null and status = 'invited' and not private.is_blocked_between((select auth.uid()), user_id))
                   or (dependent_id is not null and private.is_guardian(dependent_id))));
-- Invitees accept for themselves; owners/admins change relationship labels or promote members.
create policy "group_members: accept, relabel, promote" on public.group_members for update to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_group(group_id))
  with check (user_id = (select auth.uid()) or private.can_manage_group(group_id));
create policy "group_members: leave, decline or remove" on public.group_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner') or (private.can_manage_group(group_id) and role <> 'owner')
         or (dependent_id is not null and private.is_guardian(dependent_id)));

-- Members can't promote themselves or flip someone else's invite to active.
create or replace function private.group_members_update_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.group_id <> old.group_id or new.user_id is distinct from old.user_id or new.dependent_id is distinct from old.dependent_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new.status <> old.status and (old.user_id is distinct from (select auth.uid()) or new.status <> 'active') then
    raise exception 'only the invited person can accept' using errcode = '42501';
  end if;
  if new.role <> old.role and (old.role = 'owner' or new.role = 'owner' or private.group_role_of(new.group_id) <> 'owner') then
    raise exception 'only the owner changes roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_update_guard before update on public.group_members for each row execute function private.group_members_update_guard();

-- Tastes: your own; kids' by their guardians; shared with people in your groups for planning.
create policy "taste_profiles: own, kids and group members read" on public.taste_profiles for select to authenticated
  using (user_id = (select auth.uid())
         or (user_id is not null and private.shares_group_with_user(user_id))
         or (dependent_id is not null and (private.is_guardian(dependent_id) or private.shares_group_with_dependent(dependent_id))));
create policy "taste_profiles: own or your kid's" on public.taste_profiles for insert to authenticated
  with check (user_id = (select auth.uid())
              or (dependent_id is not null and private.is_guardian(dependent_id) and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null)));
create policy "taste_profiles: edit own or your kid's" on public.taste_profiles for update to authenticated
  using (user_id = (select auth.uid()) or (dependent_id is not null and private.is_guardian(dependent_id)
         and not exists (select 1 from public.dependents d where d.id = dependent_id and d.claimed_by is not null)))
  with check (user_id = (select auth.uid()) or (dependent_id is not null and private.is_guardian(dependent_id)));

create policy "group_plans: members" on public.group_plans for select to authenticated using (private.is_group_member(group_id));
create policy "group_plans: members plan" on public.group_plans for insert to authenticated
  with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "group_plans: members update" on public.group_plans for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy "group_plans: creator or managers delete" on public.group_plans for delete to authenticated
  using (created_by = (select auth.uid()) or private.can_manage_group(group_id));

create policy "group_plan_picks: members" on public.group_plan_picks for select to authenticated
  using (exists (select 1 from public.group_plans p where p.id = plan_id and private.is_group_member(p.group_id)));
create policy "group_plan_picks: members pick for anyone in the group" on public.group_plan_picks for insert to authenticated
  with check (added_by = (select auth.uid())
              and exists (select 1 from public.group_plans p join public.group_members m on m.group_id = p.group_id
                           where p.id = plan_id and m.id = member_id and private.is_group_member(p.group_id))
              -- no alcohol picks for kids or anyone under 21 on the plan's day
              and not exists (select 1 from public.menu_items i join public.group_members m on m.id = member_id
                               where i.id = menu_item_id and i.is_alcoholic
                                 and (m.dependent_id is not null or not private.user_21_on(m.user_id, current_date))));
create policy "group_plan_picks: members remove" on public.group_plan_picks for delete to authenticated
  using (exists (select 1 from public.group_plans p where p.id = plan_id and private.is_group_member(p.group_id)));

create policy "dependent_transfers: guardians read" on public.dependent_transfers for select to authenticated
  using (private.is_guardian(dependent_id));
-- Created and redeemed only through the functions below.

-- ── Transfer: kid takes over at 13+ and stays in the family ────────────
create or replace function public.create_dependent_transfer(p_dependent uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not private.is_guardian(p_dependent) then raise exception 'guardians only' using errcode = '42501'; end if;
  if exists (select 1 from public.dependents where id = p_dependent and claimed_by is not null) then
    raise exception 'this profile already belongs to them' using errcode = '22023';
  end if;
  delete from public.dependent_transfers where dependent_id = p_dependent and redeemed_at is null;
  insert into public.dependent_transfers (dependent_id, token_hash, created_by)
  values (p_dependent, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  return token;
end;
$$;

create or replace function public.redeem_dependent_transfer(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t public.dependent_transfers;
  d public.dependents;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into t from public.dependent_transfers
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if not found or t.redeemed_at is not null or t.expires_at < now() then raise exception 'this code is not valid' using errcode = 'P0002'; end if;
  select * into d from public.dependents where id = t.dependent_id for update;
  if d.claimed_by is not null then raise exception 'this profile already belongs to someone' using errcode = '22023'; end if;
  if exists (select 1 from public.dependent_guardians where dependent_id = d.id and user_id = me) then
    raise exception 'a parent can''t take over their kid''s profile' using errcode = '42501';
  end if;
  if coalesce((select private.age_on(birthdate, current_date) from public.user_birthdays where user_id = me), 0) < 13 then
    raise exception 'you need to be 13 or older' using errcode = '42501';
  end if;

  update public.dependents set claimed_by = me, claimed_at = now() where id = d.id;
  update public.dependent_transfers set redeemed_by = me, redeemed_at = now() where id = t.id;

  -- Stay in every group: kid rows become their own account's rows.
  insert into public.group_members (group_id, user_id, role, status, relationship, invited_by)
  select m.group_id, me, 'member', 'active', m.relationship, m.invited_by
    from public.group_members m join public.groups g on g.id = m.group_id
   where m.dependent_id = d.id and g.kind <> 'dating'
  on conflict do nothing;
  update public.group_plan_picks p set member_id = nm.id
    from public.group_members om, public.group_members nm
   where p.member_id = om.id and om.dependent_id = d.id and nm.group_id = om.group_id and nm.user_id = me;
  delete from public.group_members where dependent_id = d.id;

  -- Their tastes come with them (unless they already set their own).
  if exists (select 1 from public.taste_profiles where user_id = me) then
    delete from public.taste_profiles where dependent_id = d.id;
  else
    update public.taste_profiles set dependent_id = null, user_id = me, updated_at = now() where dependent_id = d.id;
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  select g.user_id, 'family.transfer', d.first_name || ' has their own VYBR8 now',
         'Their profile moved to their account. They''re still in your family.', '/groups'
    from public.dependent_guardians g where g.dependent_id = d.id;
  return d.id;
end;
$$;

revoke execute on function public.create_dependent_transfer(uuid) from public, anon;
revoke execute on function public.redeem_dependent_transfer(text) from public, anon;
grant execute on function public.create_dependent_transfer(uuid) to authenticated;
grant execute on function public.redeem_dependent_transfer(text) to authenticated;

-- Invite notifications.
create or replace function private.group_invite_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null and new.status = 'invited' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select new.user_id, 'group.invite', 'You''re invited to a group',
           coalesce((select coalesce(display_name, username::text) from public.profiles where id = new.invited_by), 'Someone') || ' invited you to ' || g.name,
           '/groups', 'group.invite:' || new.id
      from public.groups g where g.id = new.group_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger group_members_invite_notify after insert on public.group_members for each row execute function private.group_invite_notify();

grant execute on all functions in schema private to anon, authenticated, service_role;
