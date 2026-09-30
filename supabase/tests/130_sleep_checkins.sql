-- Sleep and activity check-ins are private.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.sleep_logs (day, bed_time, wake_time, minutes, quality) values (current_date, '23:15', '07:05', 470, 4)$$) = 1, 'log last night''s sleep');
select tests.fails($$insert into public.sleep_logs (day, bed_time, wake_time, minutes) values (current_date - 1, '23:00', '23:05', 5)$$, 'sleep has to be at least 30 minutes');
select tests.ok(tests.affected($$insert into public.activity_checkins (day, level, activities, steps_band) values (current_date, 'gaming', '{gaming,desk_work}', 'under_3k')$$) = 1, 'check in a gaming day');
select tests.fails($$insert into public.activity_checkins (day, level) values (current_date - 1, 'couch_potato')$$, 'only known activity levels');
select tests.ok(tests.affected($$insert into public.activity_goals (sleep_goal_minutes) values (450)$$) = 1, 'set a sleep goal');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.sleep_logs) = 0, 'no one else sees your sleep');
select tests.ok((select count(*) from public.activity_checkins) = 0, 'or your check-ins');
select tests.ok(tests.affected($$update public.sleep_logs set minutes = 600$$) = 0, 'or changes them');
select tests.logout();

rollback;
