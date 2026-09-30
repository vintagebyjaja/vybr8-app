-- CraveZone CZ-1: taxonomy, automatic item tags, item and place search.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-9500-000000000001'::uuid as wings,
  '00000000-0000-4000-9500-000000000002'::uuid as house_fries,
  '00000000-0000-4000-9500-000000000005'::uuid as loaded_fries,
  '00000000-0000-4000-9500-000000000007'::uuid as margarita,
  '00000000-0000-4000-9000-0000000000b1'::uuid as b1;
grant select on ids to anon, authenticated, service_role;
create temp table city as select coalesce((select city_slug from public.business_locations where business_id = '00000000-0000-4000-9000-0000000000b1' and is_primary), 'charlotte') as slug;
grant select on city to anon, authenticated, service_role;

select tests.ok((select count(*) from public.craving_categories where active) >= 18, 'the craving taxonomy is in the database');
select tests.ok(exists (select 1 from public.menu_item_craving_tags t join public.craving_categories c on c.id = t.category_id
                        where t.menu_item_id = (select house_fries from ids) and c.slug = 'salty'), 'fries are tagged salty automatically');
select tests.ok(exists (select 1 from public.menu_item_craving_tags t join public.craving_categories c on c.id = t.category_id
                        where t.menu_item_id = (select loaded_fries from ids) and c.slug = 'cheesy'), 'loaded fries with cheese sauce are cheesy');
select tests.ok(exists (select 1 from public.menu_item_craving_tags t join public.craving_categories c on c.id = t.category_id
                        where t.menu_item_id = (select wings from ids) and c.slug = 'spicy'), 'hot honey wings are spicy');
select tests.ok(private.mentions_any('Chili Cheese Hot Dog', (select exclude_keywords from public.craving_categories where slug = 'spicy')),
  'a hot dog is not counted as spicy');
select tests.ok(not private.mentions_any('Pepperoni Pizza', '{pepper}'), 'whole words only (pepperoni is not pepper)');

-- Renaming an item re-tags it.
update public.menu_items set name = 'Chocolate Brownie (demo)', description = 'Warm, fudge center.', dish_type = 'brownie' where id = (select house_fries from ids);
select tests.ok(exists (select 1 from public.menu_item_craving_tags t join public.craving_categories c on c.id = t.category_id
                        where t.menu_item_id = (select house_fries from ids) and c.slug = 'chocolate')
                and not exists (select 1 from public.menu_item_craving_tags t join public.craving_categories c on c.id = t.category_id
                        where t.menu_item_id = (select house_fries from ids) and c.slug = 'salty' and t.source = 'keyword'),
  'editing an item updates its craving tags');

select tests.anon();
select tests.ok((select item_id from public.crave_items((select slug from city), '{salty,cheesy}') limit 1) = (select loaded_fries from ids),
  'salty + cheesy: the item that hits both comes first');
select tests.ok(not exists (select 1 from public.crave_items((select slug from city), '{spicy}') where item_id = (select margarita from ids)),
  'alcohol stays behind the Pours rule in CraveZone too');
select tests.ok(not exists (select 1 from public.crave_items((select slug from city), '{fried}', '{spicy}') where item_id = (select wings from ids)),
  'excluded cravings drop out');
select tests.ok(exists (select 1 from public.crave_items((select slug from city), '{}', '{}', 'birria')), 'free text finds items with no craving picked');
select tests.ok(not exists (select 1 from public.crave_items((select slug from city), '{salty}', '{}', null, null, null, false, 500)), 'under-$ filter');
select tests.fails($$insert into public.menu_item_craving_tags (menu_item_id, category_id, source) values ((select wings from ids), 1, 'keyword')$$, 'strangers can''t tag items');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$insert into public.saved_menu_items (user_id, menu_item_id) values ('00000000-0000-4000-8000-0000000000a4', (select wings from ids))$$, 'you can only save for yourself');
insert into public.saved_menu_items (menu_item_id) values ((select wings from ids));
select tests.ok((select item_saved from public.crave_items((select slug from city), '{spicy}') where item_id = (select wings from ids)), 'saved cravings show as saved');
select tests.ok((select count(*) from public.crave_items((select slug from city), '{spicy}', '{}', null, null, null, false, null, null, null, false, true)) = 1, 'saved-only filter');
select tests.logout();
insert into public.place_lists (user_id, business_id, list) values ((select marcus from ids), (select b1 from ids), 'never');
select tests.login((select marcus from ids));
select tests.ok(not exists (select 1 from public.crave_items((select slug from city), '{spicy,fried,salty,cheesy}') where business_id = (select b1 from ids)), 'Never-again places never show up');
select tests.logout();

select tests.anon();
select tests.ok((select count(*) from public.crave_places((select slug from city), '{sweet}')) >= 0, 'place search runs for anyone');
select tests.logout();

rollback;
