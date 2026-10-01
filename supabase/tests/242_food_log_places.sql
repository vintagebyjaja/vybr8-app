-- "Ate out?" menu calories and journal entries linked to a place.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-9000-0000000000b1'::uuid as b1;
grant select on ids to anon, authenticated, service_role;

select tests.anon();
select tests.fails($$select * from public.menu_calories((select b1 from ids))$$, 'sign in to see menu calories');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.menu_calories((select b1 from ids))) = 3, 'shared and labeled-estimate calories show');
select tests.ok(not exists (select 1 from public.menu_calories((select b1 from ids)) where menu_item_id = '00000000-0000-4000-9500-000000000001'),
  'restaurant numbers they chose not to publish stay hidden');
select tests.ok((select calories from public.menu_calories((select b1 from ids)) where menu_item_id = '00000000-0000-4000-9500-000000000002') = 520, 'published calories come through');
insert into public.food_logs (user_id, day, kind, time_slot, name, business_id, menu_item_id, calories, nutrition_source)
values ((select marcus from ids), current_date, 'food', 'dinner', 'House Fries (demo)', (select b1 from ids), '00000000-0000-4000-9500-000000000002', 520, 'restaurant_provided');
select tests.ok((select count(*) from public.food_logs where business_id = (select b1 from ids)) = 1, 'a journal entry can remember the place');
select tests.logout();

select tests.login('00000000-0000-4000-8000-0000000000a2'::uuid);
select tests.ok((select count(*) from public.food_logs where business_id = (select b1 from ids)) = 0, 'nobody else sees what you ate there, not even the Team');
select tests.logout();

rollback;
