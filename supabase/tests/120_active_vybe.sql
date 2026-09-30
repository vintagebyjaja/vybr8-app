-- Active Vybe (activity, private) and Your Vybe Plan (MAX).

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

-- ── Activity is private ───────────────────────────────────────────────
select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.activity_days (day, steps, active_calories, distance_m, active_minutes) values (current_date, 12482, 612, 8690, 85)$$) = 1, 'log today''s steps by hand');
select tests.fails($$insert into public.activity_days (day, source, steps) values (current_date, 'apple_health', 99999)$$, 'cannot pretend a manual entry came from Apple Health');
select tests.ok(tests.affected($$insert into public.activity_goals (step_goal) values (12000)$$) = 1, 'set a step goal');
select tests.ok(tests.affected($$insert into public.health_connections (provider) values ('apple_health')$$) = 1, 'ask for Apple Health');
select tests.fails($$insert into public.health_connections (provider, status) values ('garmin', 'connected')$$, 'cannot mark an app connected yourself');
select tests.fails($$select public.suggest_meal_plan('charlotte', current_date)$$, 'Your Vybe Plan is MAX');
select tests.fails($$insert into public.meal_plan_items (day, slot, at_time, name) values (current_date, 'lunch', '12:30', 'Salad')$$, 'or adding plan meals by hand without MAX');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.activity_days) = 0, 'no one else sees your activity');
select tests.ok((select count(*) from public.activity_goals) = 0, 'or your goals');
select tests.ok((select count(*) from public.health_connections) = 0, 'or your connected apps');
select tests.logout();

-- ── Vybe Plan ─────────────────────────────────────────────────────────
select tests.login((select jaja from ids));
create temp table planned (n int); grant all on planned to authenticated;
insert into planned select public.suggest_meal_plan('charlotte', current_date, 'high_energy');
select tests.ok((select n from planned) >= 1, 'MAX members get a day of meals from real menus nearby');
select tests.ok((select bool_and(calories is not null) from public.meal_plan_items), 'every planned meal has known calories');
select tests.ok((select count(*) from public.meal_plan_items m join public.menu_items i on i.id = m.menu_item_id where i.is_alcoholic) = 0, 'no alcohol in a meal plan');
select tests.ok((select day_type from public.day_plans where day = current_date) = 'high_energy', 'the day type is saved');
select public.eat_planned_meal((select id from public.meal_plan_items order by at_time limit 1));
select tests.ok((select count(*) from public.food_logs f join public.meal_plan_items m on m.menu_item_id is not distinct from f.menu_item_id and m.eaten_at is not null) >= 1, 'eating a planned meal logs it');
insert into planned select public.suggest_meal_plan('charlotte', current_date, 'rest');
select tests.ok((select count(*) from public.meal_plan_items where eaten_at is not null) = 1, 're-planning keeps what you already ate');
select tests.fails($$select public.suggest_meal_plan('charlotte', current_date + 30)$$, 'plans go up to two weeks ahead');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.meal_plan_items) = 0, 'meal plans are private');
select tests.fails($$select public.eat_planned_meal((select id from public.meal_plan_items limit 1))$$, 'and cannot be touched by others');
select tests.logout();

rollback;
