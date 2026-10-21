-- Shared chain menus, location copies, overrides and repeat imports.

begin;

insert into public.businesses (id, slug, name, kind, status) values
  ('00000000-0000-4000-9900-000000000001', 'zesty-chicken-test-1', 'Zesty Chicken', 'restaurant', 'active'),
  ('00000000-0000-4000-9900-000000000002', 'zesty-chicken-test-2', 'ZESTY CHICKEN®', 'restaurant', 'active'),
  ('00000000-0000-4000-9900-000000000003', 'zesty-chickenhouse-test', 'Zesty Chicken House', 'restaurant', 'active');

select tests.ok((private.import_brand_menu('zesty-chicken', 'Zesty Chicken', 'https://zesty.example/menu', array['zestychicken'],
  '[{"section":"Chicken","name":"Zesty Sandwich","category":"food","dish_type":"chicken-sandwich"},
    {"section":"Sides","name":"Waffle Fries","category":"food","dish_type":"fries"},
    {"section":"Drinks","name":"Sweet Tea","category":"drink","dish_type":"tea"}]'::jsonb, current_date) ->> 'locations')::int = 2,
  'both spellings of the chain join the brand, a different restaurant does not');
select tests.ok((select count(*) from public.menu_items where business_id = '00000000-0000-4000-9900-000000000002' and source = 'brand') = 3,
  'each location gets the shared menu');
select tests.ok(not exists (select 1 from public.menu_items where business_id = '00000000-0000-4000-9900-000000000003'), 'similar names are not merged');

-- A location's own price is a local override.
update public.menu_items set price_cents = 699, price_is_local = true
 where business_id = '00000000-0000-4000-9900-000000000001' and name = 'Waffle Fries';
insert into public.item_ratings (menu_item_id, user_id, score)
select id, '00000000-0000-4000-8000-0000000000a3', 9 from public.menu_items where business_id = '00000000-0000-4000-9900-000000000001' and name = 'Sweet Tea';

-- Refresh: tea dropped, a new item added, fries renamed section.
select private.import_brand_menu('zesty-chicken', 'Zesty Chicken', 'https://zesty.example/menu', array['zestychicken'],
  '[{"section":"Chicken","name":"Zesty Sandwich","category":"food","dish_type":"chicken-sandwich"},
    {"section":"Fries & Sides","name":"Waffle Fries","category":"food","dish_type":"fries"},
    {"section":"Chicken","name":"Zesty Nuggets","category":"food","dish_type":"chicken-nuggets"}]'::jsonb, current_date);
select tests.ok((select count(*) from public.menu_items where business_id = '00000000-0000-4000-9900-000000000001') = 4, 'a refresh adds new items without duplicating old ones');
select tests.ok((select section = 'Fries & Sides' and price_cents = 699 from public.menu_items
  where business_id = '00000000-0000-4000-9900-000000000001' and name = 'Waffle Fries'), 'shared fields refresh, the local price stays');
select tests.ok((select not is_available from public.menu_items where business_id = '00000000-0000-4000-9900-000000000001' and name = 'Sweet Tea'),
  'dropped items go unavailable instead of being deleted');
select tests.ok(exists (select 1 from public.item_ratings r join public.menu_items m on m.id = r.menu_item_id where m.name = 'Sweet Tea'
  and m.business_id = '00000000-0000-4000-9900-000000000001'), 'ratings on a dropped item are kept');

-- A restaurant's own dated menu.
select tests.ok(private.import_place_menu('00000000-0000-4000-9900-000000000003',
  '[{"section":"Plates","name":"Half Chicken","price":"14.50"},{"section":"Plates","name":"Half Chicken","price":"14.50"}]'::jsonb,
  'https://house.example/menu', current_date) = 1, 'duplicate rows in an import collapse');
select tests.ok((select price_cents = 1450 and price_is_local from public.menu_items where business_id = '00000000-0000-4000-9900-000000000003'),
  'restaurant prices are stored as that location''s price');
select private.import_place_menu('00000000-0000-4000-9900-000000000003', '[{"section":"Plates","name":"Half Chicken","price":"15.00"}]'::jsonb, 'https://house.example/menu', current_date);
select tests.ok((select count(*) = 1 and max(price_cents) = 1500 from public.menu_items where business_id = '00000000-0000-4000-9900-000000000003'),
  'a newer import updates the price in place');

select tests.ok((private.import_menu_links('[{"business_id":"00000000-0000-4000-9900-000000000003","website":"https://house.example","menu_url":"https://house.example/menu"}]'::jsonb) ->> 'menu_links_added')::int = 1,
  'menu links import onto existing places');

select tests.login('00000000-0000-4000-8000-0000000000a3');
select tests.fails($$select public.admin_import_brand_menu('x', 'X', null, array['x'], '[{"name":"a"}]'::jsonb)$$, 'only admins import menus');
select tests.fails($$select private.import_brand_menu('x', 'X', null, array['x'], '[{"name":"a"}]'::jsonb, current_date)$$, 'the private importer is not callable from the app');
select tests.ok((select count(*) from public.admin_menu_coverage()) = 0, 'menu coverage is Team-only');
select tests.ok(exists (select 1 from public.brand_menu_items where name = 'Zesty Nuggets'), 'everyone can see shared menus');
select tests.logout();

rollback;
