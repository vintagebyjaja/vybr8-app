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
