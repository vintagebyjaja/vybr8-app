-- ─────────────────────────────────────────────────────────────────────
-- VYBR8 DEVELOPMENT SEED DATA
-- Every person and business below is FICTIONAL and flagged is_demo = true.
-- Addresses use fictional street numbers. Do not load into production.
-- Demo password for all accounts: vybr8-demo-only
-- ─────────────────────────────────────────────────────────────────────

-- Fixed UUIDs keep tests and docs stable.
-- 000…a1 admin · a2 jaja · a3 marcus · a4 tia · a5 chris · a6 owner (claims Ember & Oak)

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email,
       extensions.crypt('vybr8-demo-only', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('username', v.username, 'display_name', v.display_name, 'is_demo', true, 'birthdate', v.birthdate),
       now(), now()
from (values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@demo.vybr8.test',  'demo_admin',  'VYBR8 Admin (demo)',  '1988-03-14'),
  ('00000000-0000-4000-8000-0000000000a2', 'jaja@demo.vybr8.test',   'demo_jaja',   'Jaja (demo)',         '1994-10-05'),
  ('00000000-0000-4000-8000-0000000000a3', 'marcus@demo.vybr8.test', 'demo_marcus', 'Marcus (demo)',       '1991-12-20'),
  ('00000000-0000-4000-8000-0000000000a4', 'tia@demo.vybr8.test',    'demo_tia',    'Tia (demo)',          '1996-02-29'),
  ('00000000-0000-4000-8000-0000000000a5', 'chris@demo.vybr8.test',  'demo_chris',  'Chris (demo)',        '1990-07-04'),
  ('00000000-0000-4000-8000-0000000000a6', 'owner@demo.vybr8.test',  'demo_owner',  'Dana Owner (demo)',   '1985-05-22'),
  ('00000000-0000-4000-8000-0000000000a7', 'kay@demo.vybr8.test',    'demo_kay',    'Kay (demo, age 16)',  (current_date - interval '16 years')::date::text)
) as v(id, email, username, display_name, birthdate);

update public.profiles set home_city = 'Charlotte', home_region = 'NC' where is_demo;

-- Chris keeps a friends-only profile to exercise privacy rules.
update public.privacy_settings set profile_visibility = 'friends', ratings_visibility = 'friends'
 where user_id = '00000000-0000-4000-8000-0000000000a5';

insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin');

-- Friend graph: Jaja ↔ Marcus, Jaja ↔ Tia, Jaja ↔ Chris (accepted); Marcus → Tia (pending)
insert into public.friendships (requester_id, addressee_id, status, responded_at) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', 'accepted', now()),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a2', 'accepted', now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a5', 'accepted', now()),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4', 'pending',  null);

-- Fictional venues in Charlotte, NC
insert into public.businesses (id, slug, name, kind, description, price_level, status, is_claimed, is_demo) values
  ('00000000-0000-4000-9000-0000000000b1', 'ember-and-oak',        'Ember & Oak (demo)',        'restaurant',      'Wood-fired Southern plates and a serious wing program.', 2, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b2', 'velvet-hour',          'Velvet Hour (demo)',        'cocktail_lounge', 'Low-lit cocktail lounge with a rotating seasonal menu.',  3, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b3', 'noni-pasta-bar',       'Noni Pasta Bar (demo)',     'restaurant',      'Fresh pasta, Sunday gravy spaghetti, late-night kitchen.', 2, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b4', 'cloud-nine-hookah',    'Cloud Nine Hookah (demo)',  'hookah_lounge',   'Hookah, small plates, and DJs Thursday to Saturday.',     2, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b5', 'the-humidor-room',     'The Humidor Room (demo)',   'cigar_lounge',    'Walk-in humidor, bourbon flights, leather chairs.',       3, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b6', 'saltline-seafood',     'Saltline Seafood (demo)',   'restaurant',      'Fried fish baskets, low-country boils, raw bar.',         2, 'active', false, true),
  ('00000000-0000-4000-9000-0000000000b7', 'rooftop-at-the-crest', 'Rooftop at The Crest (demo)','bar',            'Skyline rooftop with margaritas and a happy hour.',       3, 'pending', false, true);

insert into public.business_locations (business_id, label, address_line1, city, region, postal_code, latitude, longitude, is_primary, is_demo) values
  ('00000000-0000-4000-9000-0000000000b1', 'South End',  '0101 Demo Blvd',   'Charlotte', 'NC', '28203', 35.2120, -80.8590, true, true),
  ('00000000-0000-4000-9000-0000000000b2', 'Uptown',     '0202 Demo St',     'Charlotte', 'NC', '28202', 35.2270, -80.8430, true, true),
  ('00000000-0000-4000-9000-0000000000b3', 'NoDa',       '0303 Demo Ave',    'Charlotte', 'NC', '28205', 35.2460, -80.8120, true, true),
  ('00000000-0000-4000-9000-0000000000b4', 'Plaza Midwood','0404 Demo Rd',   'Charlotte', 'NC', '28205', 35.2210, -80.8100, true, true),
  ('00000000-0000-4000-9000-0000000000b5', 'Ballantyne', '0505 Demo Pkwy',   'Charlotte', 'NC', '28277', 35.0530, -80.8500, true, true),
  ('00000000-0000-4000-9000-0000000000b6', 'Dilworth',   '0606 Demo Ln',     'Charlotte', 'NC', '28203', 35.2050, -80.8490, true, true),
  ('00000000-0000-4000-9000-0000000000b7', 'Uptown',     '0707 Demo Tower',  'Charlotte', 'NC', '28202', 35.2280, -80.8420, true, true);

-- A pending claim from the demo owner, for exercising the admin approval flow.
insert into public.business_claims (id, business_id, claimant_id, claimant_role, evidence) values
  ('00000000-0000-4000-9100-0000000000c1', '00000000-0000-4000-9000-0000000000b1',
   '00000000-0000-4000-8000-0000000000a6', 'Owner', '{"note":"demo claim"}');

-- ─────────────────────────────────────────────────────────────────────
-- VYBR8 Team, creators, Plates & Pours (all demo)
-- ─────────────────────────────────────────────────────────────────────

-- Demo Jaja is the founder and an admin, so the team tools can be tried locally.
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000a2', 'admin');
insert into public.team_members (user_id, title, bio, position, is_founder) values
  ('00000000-0000-4000-8000-0000000000a2', 'Founder', 'Started VYBR8 to find the best actual plate in the city. (demo)', 1, true),
  ('00000000-0000-4000-8000-0000000000a1', 'Community Team', 'Keeps the timeline tasty and honest. (demo)', 2, false);

-- Demo profile photos (illustrations bundled with the app).
update public.profiles set avatar_url = '/demo/avatars/' || case id
    when '00000000-0000-4000-8000-0000000000a1' then 'admin' when '00000000-0000-4000-8000-0000000000a2' then 'jaja'
    when '00000000-0000-4000-8000-0000000000a3' then 'marcus' when '00000000-0000-4000-8000-0000000000a4' then 'tia'
    when '00000000-0000-4000-8000-0000000000a5' then 'chris' when '00000000-0000-4000-8000-0000000000a6' then 'owner'
    else 'kay' end || '.svg'
  where is_demo;

-- Tia: verified Big Back. Marcus: verified Liquid Lover. Chris: pending application.
insert into public.creator_applications (id, user_id, creator_type, city, pitch, links, is_21_plus_attested, status, reviewed_by, reviewed_at) values
  ('00000000-0000-4000-9200-0000000000d1', '00000000-0000-4000-8000-0000000000a4', 'big_back', 'Charlotte',
   'I eat my way through every wing spot in Charlotte and post honest ratings. (demo)', '[{"platform":"instagram","url":"https://instagram.com/example"}]', false,
   'approved', '00000000-0000-4000-8000-0000000000a2', now()),
  ('00000000-0000-4000-9200-0000000000d2', '00000000-0000-4000-8000-0000000000a3', 'liquid_lover', 'Charlotte',
   'Cocktail nerd. I rate martinis on strength, balance and presentation. (demo)', '[]', true,
   'approved', '00000000-0000-4000-8000-0000000000a2', now()),
  ('00000000-0000-4000-9200-0000000000d3', '00000000-0000-4000-8000-0000000000a5', 'big_back', 'Charlotte',
   'Seafood and soul food every weekend. Want to share the best fried fish spots. (demo)', '[{"platform":"TikTok","url":"https://www.tiktok.com/@example"}]', false,
   'pending', null, null);

insert into public.creator_profiles (user_id, creator_type, application_id, verified_by) values
  ('00000000-0000-4000-8000-0000000000a4', 'big_back',     '00000000-0000-4000-9200-0000000000d1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3', 'liquid_lover', '00000000-0000-4000-9200-0000000000d2', '00000000-0000-4000-8000-0000000000a2');

insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a4');

insert into public.posts (id, author_id, kind, business_id, item_name, caption, rating, price_cents, visibility, status, is_demo, created_at) values
  ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-8000-0000000000a4', 'plate', '00000000-0000-4000-9000-0000000000b1', 'Hot Honey Wings',
   'Crispy, sticky, a little heat at the end. Big Back approved. (demo)', 9.4, 1699, 'public', 'published', true, now() - interval '2 hours'),
  ('00000000-0000-4000-9300-0000000000e2', '00000000-0000-4000-8000-0000000000a4', 'plate', '00000000-0000-4000-9000-0000000000b3', 'Sunday Gravy Spaghetti',
   'Portion could feed two. I did not share. (demo)', 9.1, 2200, 'public', 'published', true, now() - interval '1 day'),
  ('00000000-0000-4000-9300-0000000000e3', '00000000-0000-4000-8000-0000000000a3', 'pour', '00000000-0000-4000-9000-0000000000b2', 'Velvet Espresso Martini',
   'Strong, smooth, perfect foam. Liquid Lover certified. (demo)', 9.6, 1600, 'public', 'published', true, now() - interval '5 hours'),
  ('00000000-0000-4000-9300-0000000000e4', '00000000-0000-4000-8000-0000000000a3', 'pour', '00000000-0000-4000-9000-0000000000b4', 'Mango Chili Margarita',
   'Sweet heat. Happy hour price is a steal. (demo)', 8.8, 900, 'public', 'published', true, now() - interval '2 days'),
  ('00000000-0000-4000-9300-0000000000e5', '00000000-0000-4000-8000-0000000000a2', 'spot', '00000000-0000-4000-9000-0000000000b5', null,
   'Leather chairs, low lights, great bourbon list. (demo)', 8.9, null, 'public', 'published', true, now() - interval '3 days'),
  ('00000000-0000-4000-9300-0000000000e6', '00000000-0000-4000-8000-0000000000a5', 'plate', '00000000-0000-4000-9000-0000000000b6', 'Fried Whiting Basket',
   'Friends-only post for privacy testing. (demo)', 8.5, 1400, 'friends', 'published', true, now() - interval '6 hours'),
  ('00000000-0000-4000-9300-0000000000e7', '00000000-0000-4000-8000-0000000000a4', 'plate', '00000000-0000-4000-9000-0000000000b1', 'Five-Cheese Mac',
   'Hidden by moderation for testing. (demo)', 7.0, 900, 'public', 'hidden', true, now() - interval '4 days');

-- Drink posts contain alcohol: only 21+ members see them.
update public.posts set is_alcoholic = true where kind = 'pour' and is_demo;

insert into public.post_media (post_id, storage_path, position, width, height, alt_text) values
  ('00000000-0000-4000-9300-0000000000e1', 'demo/plate-wings.webp',      0, 1080, 1080, 'Illustration of glazed wings on a plate (demo)'),
  ('00000000-0000-4000-9300-0000000000e2', 'demo/plate-spaghetti.webp',  0, 1080, 1080, 'Illustration of spaghetti with red sauce (demo)'),
  ('00000000-0000-4000-9300-0000000000e3', 'demo/pour-martini.webp',     0, 1080, 1080, 'Illustration of an espresso martini (demo)'),
  ('00000000-0000-4000-9300-0000000000e4', 'demo/pour-margarita.webp',   0, 1080, 1080, 'Illustration of a mango margarita (demo)'),
  ('00000000-0000-4000-9300-0000000000e5', 'demo/spot-lounge.webp',      0, 1080, 1080, 'Illustration of a dim lounge interior (demo)'),
  ('00000000-0000-4000-9300-0000000000e6', 'demo/plate-fish.webp',       0, 1080, 1080, 'Illustration of a fried fish basket (demo)'),
  ('00000000-0000-4000-9300-0000000000e7', 'demo/plate-mac.webp',        0, 1080, 1080, 'Illustration of mac and cheese (demo)');

insert into public.post_vybes (post_id, user_id) values
  ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-9300-0000000000e3', '00000000-0000-4000-8000-0000000000a2');

insert into public.post_comments (post_id, author_id, body) values
  ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-8000-0000000000a2', 'Adding this to Want to Try. (demo)'),
  ('00000000-0000-4000-9300-0000000000e3', '00000000-0000-4000-8000-0000000000a4', 'Saving this for Friday. (demo)');

-- ─────────────────────────────────────────────────────────────────────
-- Birthday Perks (demo venues only; real perks come from businesses and reviewed community tips)
-- ─────────────────────────────────────────────────────────────────────
insert into public.birthday_perks (business_id, title, details, perk_type, redeem_window, requirements, is_alcoholic, source, status, last_confirmed_at, is_demo) values
  ('00000000-0000-4000-9000-0000000000b1', 'Free Hot Honey Wings (6 pc)', 'Six wings on the house with any entrée. (demo)', 'free_food', 'week', 'Show ID · dine-in only', false, 'business', 'active', now() - interval '3 days', true),
  ('00000000-0000-4000-9000-0000000000b3', 'Free tiramisu + candle', 'The staff sings, you eat. (demo)', 'free_food', 'day', 'Show ID', false, 'business', 'active', now() - interval '10 days', true),
  ('00000000-0000-4000-9000-0000000000b2', 'Birthday martini on us', 'Any signature martini, one per guest of honor. (demo)', 'free_drink', 'day', '21+ · show ID', true, 'business', 'active', now() - interval '5 days', true),
  ('00000000-0000-4000-9000-0000000000b4', '50% off a hookah', 'Half off one hookah for the birthday table. (demo)', 'discount', 'week', 'Party of 4+ · show ID', false, 'community', 'active', now() - interval '20 days', true),
  ('00000000-0000-4000-9000-0000000000b5', 'Complimentary bourbon pour', 'A 1 oz pour from the house list. (demo)', 'free_drink', 'month', '21+ · members only', true, 'business', 'active', now() - interval '40 days', true),
  ('00000000-0000-4000-9000-0000000000b6', '20% off your bill', 'For the whole table on your birthday. (demo)', 'discount', 'day', 'Show ID · up to 6 guests', false, 'community', 'pending', null, true);

-- ─────────────────────────────────────────────────────────────────────
-- Vybe Map + Link Ups (demo)
-- ─────────────────────────────────────────────────────────────────────
update public.business_locations set city_slug = 'charlotte' where is_demo;

insert into public.business_hours (location_id, weekday, opens_at, closes_at)
select l.id, d, h.opens, h.closes
from public.business_locations l
join (values
  ('00000000-0000-4000-9000-0000000000b1'::uuid, '11:00'::time, '23:00'::time),
  ('00000000-0000-4000-9000-0000000000b2'::uuid, '17:00'::time, '02:00'::time),
  ('00000000-0000-4000-9000-0000000000b3'::uuid, '11:30'::time, '01:00'::time),
  ('00000000-0000-4000-9000-0000000000b4'::uuid, '18:00'::time, '02:00'::time),
  ('00000000-0000-4000-9000-0000000000b5'::uuid, '16:00'::time, '00:00'::time),
  ('00000000-0000-4000-9000-0000000000b6'::uuid, '11:00'::time, '21:00'::time)
) as h(business_id, opens, closes) on h.business_id = l.business_id
cross join generate_series(0, 6) as d
where l.is_demo;

-- Friends' "what's your vybe" statuses
insert into public.vybe_statuses (user_id, intent, city_slug, business_id, note, created_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000a3', 'drink', 'charlotte', '00000000-0000-4000-9000-0000000000b2', 'Martini hour, who''s in? (demo)', now(), now() + interval '3 hours'),
  ('00000000-0000-4000-8000-0000000000a4', 'eat',   'charlotte', null, 'Craving wings tonight (demo)', now(), now() + interval '4 hours');

insert into public.linkups (id, host_id, title, occasion, description, city_slug, business_id, starts_at, ends_at, capacity, visibility, join_mode, open_to_new_friends, is_alcoholic, is_demo) values
  ('00000000-0000-4000-9400-0000000000f1', '00000000-0000-4000-8000-0000000000a4', 'Girls Night Out: wings + cocktails', 'girls_night',
   'Dress cute, bring your appetite. Looking to meet new friends! (demo)', 'charlotte', '00000000-0000-4000-9000-0000000000b1',
   date_trunc('day', now()) + interval '1 day 19 hours', date_trunc('day', now()) + interval '1 day 23 hours', 6, 'public', 'request', true, true, true),
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a2', 'Sunday brunch crew', 'brunch',
   'Pasta for brunch? Yes. (demo)', 'charlotte', '00000000-0000-4000-9000-0000000000b3',
   date_trunc('day', now()) + interval '2 days 11 hours', date_trunc('day', now()) + interval '2 days 14 hours', 4, 'friends', 'open', false, false, true),
  ('00000000-0000-4000-9400-0000000000f3', '00000000-0000-4000-8000-0000000000a3', 'Fried fish Friday, meet new people', 'meet_new_friends',
   'Casual dinner, all welcome. (demo)', 'charlotte', '00000000-0000-4000-9000-0000000000b6',
   date_trunc('day', now()) + interval '3 days 18 hours', date_trunc('day', now()) + interval '3 days 20 hours', 3, 'public', 'open', true, false, true);

insert into public.linkup_members (linkup_id, user_id, status) values
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a3', 'going');

insert into public.linkup_messages (linkup_id, user_id, body) values
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a2', 'Reservation is at 11. Who wants the tiramisu? (demo)'),
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a3', 'Me. Obviously. (demo)');

-- Demo guest link: /i/demo-guest-token  (only works locally with seed data)
insert into public.linkup_invites (linkup_id, created_by, token_hash, label) values
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a2', encode(sha256(convert_to('demo-guest-token', 'UTF8')), 'hex'), 'Aaliyah');
-- ─────────────────────────────────────────────────────────────────────
-- Expansion demo data: menus, food intelligence, chefs, food trucks (all fictional, is_demo)
-- No accounts here, so this part is also used in supabase/setup/2_demo_places.sql.
-- ─────────────────────────────────────────────────────────────────────

-- Food trucks are businesses too.
insert into public.businesses (id, slug, name, kind, description, price_level, status, is_demo) values
  ('00000000-0000-4000-9000-0000000000b8', 'birria-bus',         'Birria Bus (demo)',          'food_truck', 'Quesabirria, consommé and street tacos.', 1, 'active', true),
  ('00000000-0000-4000-9000-0000000000b9', 'lemon-drop-truck',   'Lemon Drop Lemonade (demo)', 'food_truck', 'Fresh lemonades, matcha lemonade, funnel cake bites.', 1, 'active', true);
insert into public.food_truck_profiles (business_id, cuisine, ordering_url, catering_available, home_city_slug) values
  ('00000000-0000-4000-9000-0000000000b8', 'Mexican · Birria', null, true, 'charlotte'),
  ('00000000-0000-4000-9000-0000000000b9', 'Lemonade · Sweets', null, false, 'charlotte');

-- Stops relative to "now" so the demo always has something today, tonight and this weekend.
insert into public.food_truck_schedules (business_id, location_name, address, latitude, longitude, city_slug, start_at, end_at, event_name, status, source, verified_at) values
  ('00000000-0000-4000-9000-0000000000b8', 'Uptown Lunch Spot (demo)', 'Trade & Tryon, Charlotte', 35.2271, -80.8431, 'charlotte', now() - interval '1 hour', now() + interval '2 hours', null, 'open', 'operator', now()),
  ('00000000-0000-4000-9000-0000000000b8', 'Friday Night Market (demo)', 'South End Rail Trail', 35.2130, -80.8575, 'charlotte', now() + interval '6 hours', now() + interval '10 hours', 'Friday Night Market', 'scheduled', 'operator', now()),
  ('00000000-0000-4000-9000-0000000000b8', 'Brewery pop-up (demo)', 'NoDa', 35.2455, -80.8125, 'charlotte', now() + interval '1 day 5 hours', now() + interval '1 day 9 hours', null, 'scheduled', 'operator', null),
  ('00000000-0000-4000-9000-0000000000b9', 'Freedom Park (demo)', 'Dilworth', 35.1930, -80.8430, 'charlotte', now() + interval '1 day', now() + interval '1 day 5 hours', 'Weekend in the Park', 'scheduled', 'operator', null);

-- Menus
insert into public.menu_items (id, business_id, name, description, category, dish_type, section, price_cents, is_alcoholic, position, is_demo) values
  ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-9000-0000000000b1', 'Hot Honey Wings (demo)', 'Smoked then fried, hot honey glaze.', 'food', 'wings', 'Wings', 1400, false, 1, true),
  ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-9000-0000000000b1', 'House Fries (demo)', 'Double-fried, house seasoning.', 'food', 'fries', 'Sides', 700, false, 5, true),
  ('00000000-0000-4000-9500-000000000003', '00000000-0000-4000-9000-0000000000b1', 'Roasted Potatoes (demo)', 'Herb-roasted, olive oil.', 'food', 'potatoes', 'Sides', 600, false, 6, true),
  ('00000000-0000-4000-9500-000000000004', '00000000-0000-4000-9000-0000000000b1', 'Shrimp & Grits (demo)', 'Stone-ground grits, andouille gravy.', 'food', 'shrimp-and-grits', 'Plates', 2200, false, 2, true),
  ('00000000-0000-4000-9500-000000000005', '00000000-0000-4000-9000-0000000000b1', 'Loaded Fries (demo)', 'Cheese sauce, bacon, scallions.', 'food', 'fries', 'Sides', 1400, false, 7, true),
  ('00000000-0000-4000-9500-000000000006', '00000000-0000-4000-9000-0000000000b2', 'Velvet Espresso Martini (demo)', 'Vodka, cold brew, vanilla.', 'drink', 'espresso-martini', 'Cocktails', 1600, true, 1, true),
  ('00000000-0000-4000-9500-000000000007', '00000000-0000-4000-9000-0000000000b2', 'Spicy Margarita (demo)', 'Tequila, lime, jalapeño.', 'drink', 'margarita', 'Cocktails', 1400, true, 2, true),
  ('00000000-0000-4000-9500-000000000008', '00000000-0000-4000-9000-0000000000b2', 'Espresso Tonic (demo)', 'Zero-proof: espresso, tonic, orange.', 'drink', 'mocktail', 'Zero proof', 900, false, 3, true),
  ('00000000-0000-4000-9500-000000000009', '00000000-0000-4000-9000-0000000000b3', 'Sunday Gravy Spaghetti (demo)', 'Slow-cooked red gravy, meatballs.', 'food', 'spaghetti', 'Pasta', 1900, false, 1, true),
  ('00000000-0000-4000-9500-00000000000a', '00000000-0000-4000-9000-0000000000b6', 'Fried Fish Basket (demo)', 'Whiting, fries, hush puppies.', 'food', 'fried-fish', 'Baskets', 1600, false, 1, true),
  ('00000000-0000-4000-9500-00000000000b', '00000000-0000-4000-9000-0000000000b8', 'Quesabirria Tacos (demo)', 'Three tacos, consommé.', 'food', 'birria-taco', 'Tacos', 1300, false, 1, true),
  ('00000000-0000-4000-9500-00000000000c', '00000000-0000-4000-9000-0000000000b8', 'Birria Ramen (demo)', 'Ramen in birria consommé.', 'food', 'birria-ramen', 'Bowls', 1400, false, 2, true),
  ('00000000-0000-4000-9500-00000000000d', '00000000-0000-4000-9000-0000000000b9', 'Matcha Lemonade (demo)', 'Ceremonial matcha, fresh lemonade.', 'drink', 'lemonade', 'Lemonade', 700, false, 1, true),
  ('00000000-0000-4000-9500-00000000000e', '00000000-0000-4000-9000-0000000000b9', 'Strawberry Lemonade (demo)', 'Fresh strawberries.', 'drink', 'lemonade', 'Lemonade', 600, false, 2, true);

-- Food intelligence with provenance.
insert into public.menu_item_intel (menu_item_id, recipe_level, disclose_ingredients, disclose_preparation, disclose_nutrition, disclose_allergens, preparation_steps, allergens, kitchen_note, source_note, estimate_text) values
  ('00000000-0000-4000-9500-000000000002', 'preparation_info', true, true, true, true, array['Cut and soaked', 'Fried twice', 'Seasoned after frying'], array['May share fryer with fish'], 'We double-fry so they stay crisp in to-go boxes. (demo)', 'Ember & Oak kitchen (demo)', null),
  ('00000000-0000-4000-9500-000000000001', 'verified_ingredients', true, true, false, true, array['Dry-rubbed', 'Smoked 90 minutes', 'Fried to order', 'Tossed in hot honey'], array['Contains honey'], 'Hickory, never frozen. (demo)', 'Ember & Oak kitchen (demo)', null),
  ('00000000-0000-4000-9500-00000000000b', 'vybr8_estimate', false, false, false, false, null, null, null, null, 'Based on the menu description and how birria is usually made: beef slow-braised with dried chiles and spices, shredded into tortillas with cheese, griddled, served with the braising broth. Not a recipe from the truck. (demo)');
insert into public.menu_item_ingredients (menu_item_id, name, detail, position, source) values
  ('00000000-0000-4000-9500-000000000002', 'Russet potatoes', null, 1, 'verified_ingredients'),
  ('00000000-0000-4000-9500-000000000002', 'Frying oil', 'peanut-free', 2, 'verified_ingredients'),
  ('00000000-0000-4000-9500-000000000002', 'House seasoning', 'salt, paprika, garlic', 3, 'verified_ingredients'),
  ('00000000-0000-4000-9500-000000000001', 'Chicken wings', null, 1, 'verified_ingredients'),
  ('00000000-0000-4000-9500-000000000001', 'Hot honey', 'honey, chile', 2, 'verified_ingredients'),
  ('00000000-0000-4000-9500-000000000001', 'Dry rub', null, 3, 'verified_ingredients');
insert into public.menu_item_nutrition (menu_item_id, calories, protein_g, carbs_g, fat_g, sodium_mg, source, source_note) values
  ('00000000-0000-4000-9500-000000000002', 520, 6, 64, 26, 780, 'restaurant_provided', 'Ember & Oak (demo)'),
  ('00000000-0000-4000-9500-000000000003', 340, 5, 48, 14, 420, 'estimated', 'VYBR8 estimate from a typical portion'),
  ('00000000-0000-4000-9500-000000000005', 780, 22, 70, 46, 1540, 'estimated', 'VYBR8 estimate from a typical portion'),
  ('00000000-0000-4000-9500-000000000001', 890, 58, 40, 54, 1900, 'restaurant_provided', 'Ember & Oak (demo), not published yet'),
  ('00000000-0000-4000-9500-00000000000b', 720, 38, 52, 38, 1450, 'estimated', 'VYBR8 estimate from a typical portion'),
  ('00000000-0000-4000-9500-00000000000d', 180, 1, 44, 0, 10, 'estimated', 'VYBR8 estimate, 16 oz');

-- Chefs (not claimed by an account yet; the VYBR8 Team created them)
insert into public.chef_profiles (id, slug, professional_name, headline, bio, city_slug, service_area, years_experience, culinary_background,
                                  accepting_clients, available_events, available_catering, available_private_dining, available_meal_prep, restaurant_only,
                                  starting_price_cents, per_person_cents, hourly_cents, custom_quote, min_guests, max_guests, verification, is_demo, created_by) values
  ('00000000-0000-4000-9600-000000000001', 'andre-coleman-demo', 'Chef Andre Coleman (demo)', 'Executive Chef', 'Southern plates, smoke and fire. Fictional demo chef.', 'charlotte', 'Charlotte', 14, 'Johnson & Wales (demo)',
   false, true, false, false, false, true, null, null, null, true, null, null, 'verified', true, null),
  ('00000000-0000-4000-9600-000000000002', 'simone-reyes-demo', 'Chef Simone Reyes (demo)', 'Private Chef & Caterer', 'Soul food and Caribbean menus for birthdays, showers and dinner parties. Fictional demo chef.', 'charlotte', 'Charlotte + 30 miles, Rock Hill', 9, 'Catering since 2017 (demo)',
   true, true, true, true, true, false, 45000, 6500, 9000, true, 2, 80, 'verified', true, null);
insert into public.chef_services (chef_id, service) values
  ('00000000-0000-4000-9600-000000000001', 'restaurant_chef'), ('00000000-0000-4000-9600-000000000001', 'events'),
  ('00000000-0000-4000-9600-000000000002', 'private_chef'), ('00000000-0000-4000-9600-000000000002', 'catering'),
  ('00000000-0000-4000-9600-000000000002', 'meal_prep'), ('00000000-0000-4000-9600-000000000002', 'events');
insert into public.chef_specialties (chef_id, cuisine, is_dietary) values
  ('00000000-0000-4000-9600-000000000001', 'Southern', false), ('00000000-0000-4000-9600-000000000001', 'BBQ', false),
  ('00000000-0000-4000-9600-000000000002', 'Soul Food', false), ('00000000-0000-4000-9600-000000000002', 'Caribbean', false),
  ('00000000-0000-4000-9600-000000000002', 'Gluten-free options', true);
insert into public.chef_service_areas (chef_id, city_slug) values
  ('00000000-0000-4000-9600-000000000001', 'charlotte'), ('00000000-0000-4000-9600-000000000002', 'charlotte');
insert into public.chef_business_relationships (chef_id, business_id, role, start_date, end_date, verification_status) values
  ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9000-0000000000b1', 'Executive Chef', '2023-03-01', null, 'business_confirmed'),
  ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9000-0000000000b6', 'Sous Chef', '2019-01-01', '2022-12-31', 'admin_verified');
insert into public.chef_menu_item_attributions (chef_id, menu_item_id, attribution_type, verification_status) values
  ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9500-000000000001', 'creator', 'business_confirmed'),
  ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9500-000000000004', 'executive_chef', 'business_confirmed'),
  ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9500-000000000002', 'executive_chef', 'business_confirmed');
insert into public.chef_service_packages (chef_id, name, description, price_type, price_cents, min_guests, max_guests, position) values
  ('00000000-0000-4000-9600-000000000002', 'Birthday dinner at home', 'Three courses cooked in your kitchen. (demo)', 'per_person', 6500, 4, 12, 1),
  ('00000000-0000-4000-9600-000000000002', 'Party trays', 'Wings, mac & cheese, jerk chicken. (demo)', 'package', 45000, 20, 50, 2),
  ('00000000-0000-4000-9600-000000000002', 'Weekly meal prep', '10 meals, your macros. (demo)', 'starting', 12000, 1, 1, 3),
  ('00000000-0000-4000-9600-000000000002', 'Weddings & big events', 'Menus for 50+. (demo)', 'custom_quote', null, 50, 200, 4);
insert into public.chef_availability (chef_id, day, status) values
  ('00000000-0000-4000-9600-000000000002', current_date + 5, 'available'),
  ('00000000-0000-4000-9600-000000000002', current_date + 6, 'limited');
-- Expansion demo data that needs demo accounts (local development only).
insert into public.item_ratings (menu_item_id, user_id, score, note)
select m, u, s, null from (values
  ('00000000-0000-4000-9500-000000000001'::uuid, '00000000-0000-4000-8000-0000000000a2'::uuid, 9.6), ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-8000-0000000000a3', 9.4),
  ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-8000-0000000000a4', 9.8), ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-8000-0000000000a5', 9.1),
  ('00000000-0000-4000-9500-000000000004', '00000000-0000-4000-8000-0000000000a2', 9.4), ('00000000-0000-4000-9500-000000000004', '00000000-0000-4000-8000-0000000000a4', 9.2),
  ('00000000-0000-4000-9500-000000000004', '00000000-0000-4000-8000-0000000000a5', 9.5),
  ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a2', 8.9), ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a4', 8.7),
  ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a3', 9.0),
  ('00000000-0000-4000-9500-00000000000b', '00000000-0000-4000-8000-0000000000a2', 9.7), ('00000000-0000-4000-9500-00000000000b', '00000000-0000-4000-8000-0000000000a3', 9.8),
  ('00000000-0000-4000-9500-00000000000b', '00000000-0000-4000-8000-0000000000a4', 9.6), ('00000000-0000-4000-9500-00000000000b', '00000000-0000-4000-8000-0000000000a7', 9.5),
  ('00000000-0000-4000-9500-000000000006', '00000000-0000-4000-8000-0000000000a2', 9.3), ('00000000-0000-4000-9500-000000000006', '00000000-0000-4000-8000-0000000000a3', 9.5),
  ('00000000-0000-4000-9500-000000000006', '00000000-0000-4000-8000-0000000000a5', 9.0),
  ('00000000-0000-4000-9500-000000000009', '00000000-0000-4000-8000-0000000000a2', 9.2), ('00000000-0000-4000-9500-000000000009', '00000000-0000-4000-8000-0000000000a4', 9.0),
  ('00000000-0000-4000-9500-000000000009', '00000000-0000-4000-8000-0000000000a6', 8.8),
  ('00000000-0000-4000-9500-00000000000d', '00000000-0000-4000-8000-0000000000a7', 9.1), ('00000000-0000-4000-9500-00000000000d', '00000000-0000-4000-8000-0000000000a4', 8.9),
  ('00000000-0000-4000-9500-00000000000d', '00000000-0000-4000-8000-0000000000a2', 9.0)
) as v(m, u, s);

insert into public.place_ratings (business_id, user_id, overall, service_vybe, value, aesthetic) values
  ('00000000-0000-4000-9000-0000000000b8', '00000000-0000-4000-8000-0000000000a2', 9.3, 9.5, 9.2, 8.0),
  ('00000000-0000-4000-9000-0000000000b8', '00000000-0000-4000-8000-0000000000a4', 9.4, 9.6, 9.3, 7.8),
  ('00000000-0000-4000-9000-0000000000b1', '00000000-0000-4000-8000-0000000000a2', 9.1, 8.9, 8.6, 9.0);

insert into public.chef_reviews (chef_id, reviewer_id, service, food_quality, professionalism, communication, presentation, timeliness, value, would_book_again, body, event_date) values
  ('00000000-0000-4000-9600-000000000002', '00000000-0000-4000-8000-0000000000a4', 'private_chef', 10, 10, 9, 10, 9, 9, true, 'Cooked my birthday dinner for 8. Oxtails were unreal. (demo)', current_date - 30),
  ('00000000-0000-4000-9600-000000000002', '00000000-0000-4000-8000-0000000000a2', 'catering', 9, 10, 10, 9, 10, 9, true, 'Party trays for 40, everything on time. (demo)', current_date - 60);

insert into public.food_truck_follows (user_id, business_id) values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-9000-0000000000b8');

-- Demo founder has MAX so every screen can be tried; demo Tia has VYBR8+.
insert into public.user_subscriptions (user_id, plan_code, source) values
  ('00000000-0000-4000-8000-0000000000a2', 'max', 'admin_grant'),
  ('00000000-0000-4000-8000-0000000000a4', 'plus', 'admin_grant');
insert into public.nutrition_targets (user_id, goal, calories, protein_g) values ('00000000-0000-4000-8000-0000000000a2', 'weight_management', 2000, 140);

-- ─────────────────────────────────────────────────────────────────────
-- Groups & family (demo)
-- ─────────────────────────────────────────────────────────────────────
insert into public.groups (id, owner_id, name, kind, description, city_slug, is_demo) values
  ('00000000-0000-4000-9700-000000000001', '00000000-0000-4000-8000-0000000000a2', 'The Family (demo)', 'family', 'Sunday dinners and birthday plans.', 'charlotte', true),
  ('00000000-0000-4000-9700-000000000002', '00000000-0000-4000-8000-0000000000a2', 'Date Night (demo)', 'dating', 'Our spots and what we always order.', 'charlotte', true);
insert into public.dependents (id, first_name, birthdate, created_by, is_demo) values
  ('00000000-0000-4000-9800-000000000001', 'Jack (demo)', (current_date - interval '8 years')::date, '00000000-0000-4000-8000-0000000000a2', true);
insert into public.group_members (group_id, user_id, dependent_id, role, status, relationship, invited_by) values
  ('00000000-0000-4000-9700-000000000001', '00000000-0000-4000-8000-0000000000a4', null, 'admin', 'active', 'sibling', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-9700-000000000001', null, '00000000-0000-4000-9800-000000000001', 'member', 'active', 'child', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-9700-000000000002', '00000000-0000-4000-8000-0000000000a3', null, 'member', 'active', 'partner', '00000000-0000-4000-8000-0000000000a2');
insert into public.taste_profiles (user_id, dependent_id, likes, dislikes, allergies, dietary, spice, kids_menu) values
  ('00000000-0000-4000-8000-0000000000a2', null, '{wings,pasta,shrimp}', '{olives}', '{}', '{}', 3, false),
  ('00000000-0000-4000-8000-0000000000a3', null, '{espresso martini,seafood,fried fish}', '{}', '{}', '{}', 2, false),
  ('00000000-0000-4000-8000-0000000000a4', null, '{birria,tacos,wings}', '{mushrooms}', '{}', '{}', 4, false),
  (null, '00000000-0000-4000-9800-000000000001', '{fries,wings,lemonade,spaghetti}', '{spicy}', '{peanuts}', '{}', 0, true);
insert into public.group_plans (id, group_id, title, planned_for, business_id, notes, created_by) values
  ('00000000-0000-4000-9900-000000000001', '00000000-0000-4000-9700-000000000002', 'Sunday date night (demo)', now() + interval '5 days', '00000000-0000-4000-9000-0000000000b3', 'Booth by the window.', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-9900-000000000002', '00000000-0000-4000-9700-000000000001', 'Family dinner (demo)', now() + interval '2 days', '00000000-0000-4000-9000-0000000000b1', null, '00000000-0000-4000-8000-0000000000a2');
insert into public.group_plan_picks (plan_id, member_id, menu_item_id, added_by)
select '00000000-0000-4000-9900-000000000002', m.id, '00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a2'
  from public.group_members m where m.dependent_id = '00000000-0000-4000-9800-000000000001';
