-- Expansion: entitlements, Deep Dive provenance, chefs, food trucks, promotions.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,    -- MAX (granted in seed)
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,  -- free
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,     -- VYBR8+
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,
  '00000000-0000-4000-8000-0000000000a7'::uuid as kay,     -- 16
  '00000000-0000-4000-9500-000000000002'::uuid as fries,
  '00000000-0000-4000-9500-000000000001'::uuid as wings,
  '00000000-0000-4000-9500-000000000006'::uuid as martini,
  '00000000-0000-4000-9000-0000000000b8'::uuid as truck,
  '00000000-0000-4000-9600-000000000002'::uuid as simone;
grant select on ids to anon, authenticated, service_role;

-- ── Plans ─────────────────────────────────────────────────────────────
select tests.anon();
select tests.ok((select count(*) from public.plans) = 7, 'public plans are listed (Chef Pro stays hidden)');
select tests.ok((select my_plan() ->> 'plan') = 'free', 'signed-out visitors are on Free');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(not private.viewer_can('deep_dive') and private.viewer_can('item_ratings'), 'Free: ratings yes, Deep Dive no');
select tests.fails($$select public.grant_plan('00000000-0000-4000-8000-0000000000a3', 'max')$$, 'members cannot grant themselves MAX');
select tests.fails($$insert into public.user_subscriptions (user_id, plan_code, source) values ('00000000-0000-4000-8000-0000000000a3', 'max', 'promo')$$, 'or write a subscription directly');
-- Deep Dive on Free: basic calories only, everything else locked.
select tests.ok((select item_deep_dive((select fries from ids)) -> 'ingredients') = 'null'::jsonb and (select item_deep_dive((select fries from ids)) -> 'nutrition' ->> 'protein_g') is null, 'Free sees no ingredients and no macros');
select tests.ok((select (item_deep_dive((select fries from ids)) -> 'nutrition' ->> 'calories')::int) = 520, 'Free still sees calories with their source');
select tests.ok((select item_deep_dive((select fries from ids)) -> 'locked') ? 'whats_in_it', 'locked sections are listed so the app can explain them');
select tests.ok((select count(*) from public.menu_item_ingredients) = 0, 'ingredient tables cannot be read around the server check');
select tests.logout();

select tests.login((select tia from ids));
select tests.ok((select item_deep_dive((select fries from ids)) -> 'nutrition' ->> 'protein_g') is not null and (select item_deep_dive((select fries from ids)) -> 'ingredients') = 'null'::jsonb, 'VYBR8+ gets macros, not ingredients');
select tests.logout();

select tests.login((select jaja from ids));
select tests.ok(jsonb_array_length(item_deep_dive((select fries from ids)) -> 'ingredients') = 3, 'MAX sees disclosed ingredients');
select tests.ok((select item_deep_dive((select fries from ids)) ->> 'recipe_level') = 'preparation_info', 'every item carries its provenance level');
select tests.ok((select item_deep_dive((select wings from ids)) -> 'nutrition') = 'null'::jsonb, 'restaurant nutrition stays hidden when the restaurant did not disclose it');
select tests.ok((select item_deep_dive('00000000-0000-4000-9500-00000000000b') ->> 'estimate') like '%Not a recipe from the truck%', 'VYBR8 estimates are labeled as estimates');
select tests.ok(jsonb_array_length(item_deep_dive((select wings from ids)) -> 'chefs') = 1, 'MAX sees the verified chef');
select tests.ok((select count(*) from public.item_swaps((select fries from ids))) >= 2, 'Better Swap finds similar items');
select tests.logout();

select tests.login((select admin from ids));
select public.grant_plan((select marcus from ids), 'plus', 30);
select tests.ok(private.user_plan((select marcus from ids)) = 'plus', 'admin grants a plan (until payments are live)');
select tests.logout();

-- ── Alcohol and ratings ───────────────────────────────────────────────
select tests.login((select kay from ids));
select tests.ok((select count(*) from public.menu_items where id = (select martini from ids)) = 0, 'cocktails are hidden from under-21 members');
select tests.ok(item_deep_dive((select martini from ids)) is null, 'and so is their Deep Dive');
select tests.ok(tests.affected($$insert into public.item_ratings (menu_item_id, score) values ('00000000-0000-4000-9500-00000000000e', 8.5)$$) = 1, 'anyone rates a lemonade, free');
select tests.logout();

select tests.login((select owner from ids));
select tests.fails($$insert into public.item_ratings (menu_item_id, user_id, score) values ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a4', 1)$$, 'cannot rate as someone else');
select tests.ok(tests.affected($$update public.menu_items set price_cents = 1 where id = '00000000-0000-4000-9500-000000000002'$$) = 0, 'only the place edits its menu');
select tests.logout();

-- ── Chefs ─────────────────────────────────────────────────────────────
select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.chef_profiles (user_id, slug, professional_name, city_slug) values ('00000000-0000-4000-8000-0000000000a3', 'marcus-mixes', 'Marcus Mixes', 'charlotte')$$) = 1, 'anyone can create their own chef profile, free');
select tests.fails($$insert into public.chef_profiles (user_id, slug, professional_name) values ('00000000-0000-4000-8000-0000000000a4', 'fake-tia', 'Fake Tia')$$, 'cannot create a chef profile for someone else');
select tests.fails($$update public.chef_profiles set verification = 'verified' where slug = 'marcus-mixes'$$, 'chefs cannot verify themselves');
select tests.ok(tests.affected($$insert into public.chef_business_relationships (chef_id, business_id, role) select id, '00000000-0000-4000-9000-0000000000b2', 'Bar Chef' from public.chef_profiles where slug = 'marcus-mixes'$$) = 1, 'chefs can self-report a workplace');
select tests.fails($$insert into public.chef_business_relationships (chef_id, business_id, role, verification_status) select id, '00000000-0000-4000-9000-0000000000b2', 'Bar Chef', 'business_confirmed' from public.chef_profiles where slug = 'marcus-mixes'$$, 'but cannot mark it confirmed');
select tests.fails($$insert into public.chef_menu_item_attributions (chef_id, menu_item_id, attribution_type, verification_status) select id, '00000000-0000-4000-9500-000000000006', 'creator', 'business_confirmed' from public.chef_profiles where slug = 'marcus-mixes'$$, 'chefs cannot credit themselves with a dish');
select tests.fails($$insert into public.chef_reviews (chef_id, service, food_quality) select id, 'restaurant_chef', 9 from public.chef_profiles where slug = 'andre-coleman-demo'$$, 'restaurant experiences are rated on the place, not the chef');
select tests.fails($$insert into public.chef_reviews (chef_id, service, food_quality) select id, 'private_chef', 10 from public.chef_profiles where slug = 'marcus-mixes'$$, 'chefs cannot review themselves');
select tests.ok(tests.affected($$insert into public.chef_reviews (chef_id, service, food_quality, would_book_again) values ('00000000-0000-4000-9600-000000000002', 'catering', 9, true)$$) = 1, 'members review a chef service');
select tests.ok((select count(*) from public.chef_business_relationships r where r.chef_id = '00000000-0000-4000-9600-000000000001' and public.chef_relationship_is_current(r)) = 1, 'a past workplace is not shown as current');
select tests.logout();

-- ── Food trucks ───────────────────────────────────────────────────────
select tests.login((select marcus from ids));
select tests.fails($$insert into public.food_truck_schedules (business_id, location_name, start_at, end_at) values ('00000000-0000-4000-9000-0000000000b8', 'Fake stop', now(), now() + interval '2 hours')$$, 'only the operator posts stops');
select tests.ok(tests.affected($$insert into public.food_truck_follows (business_id) values ('00000000-0000-4000-9000-0000000000b8')$$) = 1, 'follow a truck');
select tests.fails($$insert into public.food_truck_follows (business_id) values ('00000000-0000-4000-9000-0000000000b1')$$, 'only trucks can be followed as trucks');
select tests.logout();

-- Make the owner the Birria Bus operator.
insert into public.business_members (business_id, user_id, role) values ((select truck from ids), (select owner from ids), 'owner');
select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.food_truck_schedules (business_id, location_name, city_slug, start_at, end_at, status) values ('00000000-0000-4000-9000-0000000000b8', 'Stadium lot', 'charlotte', now() + interval '3 days', now() + interval '3 days 4 hours', 'scheduled')$$) = 1, 'operator posts a stop');
select tests.fails($$insert into public.food_truck_live_status (business_id, latitude, longitude, expires_at) values ('00000000-0000-4000-9000-0000000000b8', 35.2, -80.8, now() + interval '2 days')$$, 'WE''RE HERE cannot last more than 8 hours');
select tests.ok(tests.affected($$insert into public.food_truck_live_status (business_id, latitude, longitude, city_slug, expires_at) values ('00000000-0000-4000-9000-0000000000b8', 35.2, -80.8, 'charlotte', now() + interval '3 hours')$$) = 1, 'operator marks WE''RE HERE');
select tests.fails($$insert into public.place_ratings (business_id, overall) values ('00000000-0000-4000-9000-0000000000b8', 10)$$, 'operators cannot rate their own truck');
select tests.logout();
select tests.ok((select count(*) from public.notifications where kind = 'truck.stop' and user_id = (select marcus from ids)) = 1, 'followers get notified about a new stop');

select tests.anon();
select tests.ok((select bool_and(not is_live or start_at <= now()) from public.food_trucks_in_city('charlotte')), 'a future stop is never shown as here now');
select tests.ok((select count(*) from public.food_trucks_in_city('charlotte')) = 2, 'both demo trucks show in Charlotte');
select tests.logout();
update public.food_truck_live_status set started_at = now() - interval '5 hours', expires_at = now() - interval '1 hour';
select tests.anon();
select tests.ok((select count(*) from public.food_truck_live_status) = 0, 'an expired WE''RE HERE disappears');
select tests.logout();

-- ── Promotions ────────────────────────────────────────────────────────
select tests.login((select owner from ids));
select tests.fails($$insert into public.promotion_campaigns (business_id, placement, status) values ('00000000-0000-4000-9000-0000000000b8', 'promoted_food_truck', 'draft')$$, 'campaigns need the Growth plan');
select tests.logout();
insert into public.business_subscriptions (business_id, plan_code, source) values ((select truck from ids), 'business_growth', 'admin_grant');
select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.promotion_campaigns (business_id, placement, status, label) values ('00000000-0000-4000-9000-0000000000b8', 'promoted_food_truck', 'draft', 'Promoted')$$) = 1, 'Growth businesses draft a campaign');
select tests.fails($$update public.promotion_campaigns set status = 'active' where business_id = '00000000-0000-4000-9000-0000000000b8'$$, 'only the VYBR8 Team activates paid placement');
select tests.fails($$insert into public.promotion_campaigns (business_id, placement, label) values ('00000000-0000-4000-9000-0000000000b8', 'promoted_food_truck', 'Top pick')$$, 'paid placements are always labeled Promoted or Sponsored');
select tests.ok(private.business_can((select truck from ids), 'business_advanced_analytics'), 'Growth includes Pro');
select tests.logout();

rollback;
