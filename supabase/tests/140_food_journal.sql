-- The food & drink journal is private.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.food_logs (kind, name, ounces, time_slot, day) values ('water', 'Water', 16, 'early_morning', current_date)$$) = 1, 'log a bottle of water');
select tests.ok(tests.affected($$insert into public.food_logs (kind, name, amount, calories, time_slot, day) values ('food', 'Chicken & waffles', '1 plate', 1100, 'breakfast', current_date)$$) = 1, 'log food with an amount');
select tests.ok(tests.affected($$insert into public.food_logs (kind, name, ounces, time_slot, day) values ('drink', 'Margarita', 12, 'happy_hour', current_date)$$) = 1, 'log a drink at happy hour');
select tests.fails($$insert into public.food_logs (kind, name, time_slot, day) values ('water', 'Water', 'lunch', current_date)$$, 'water needs ounces');
select tests.fails($$insert into public.food_logs (kind, name, time_slot, day) values ('food', 'Wings', 'brunchtime', current_date)$$, 'only known times of day');
select tests.fails($$insert into public.food_logs (kind, name, day) values ('snackies', 'Chips', current_date)$$, 'only food, drink or water');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.food_logs where day = current_date) = 0, 'no one else sees what you ate');
select tests.ok(tests.affected($$delete from public.food_logs$$) = 0, 'or deletes it');
select tests.logout();

rollback;
