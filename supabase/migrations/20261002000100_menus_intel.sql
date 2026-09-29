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
