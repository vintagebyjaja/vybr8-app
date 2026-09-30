-- My Vybe Schedule, three check-ins a day, and check-in reminders.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.activity_goals (usual_wake, usual_bed) values ('15:00', '07:00') on conflict (user_id) do update set usual_wake = '15:00', usual_bed = '07:00'$$) = 1, 'a night-shift rhythm');
select tests.ok(tests.affected($$insert into public.vybe_schedule (label, level, days, start_time, end_time) values ('Night shift', 'active', '{1,2,3,4,5}', '22:00', '06:00')$$) = 1, 'an overnight work block');
select tests.fails($$insert into public.vybe_schedule (label, level, days, start_time, end_time) values ('Oops', 'sitting', '{8}', '09:00', '17:00')$$, 'only real weekdays');
select tests.fails($$insert into public.vybe_schedule (label, level, days, start_time, end_time) values ('Oops', 'sitting', '{1}', '09:00', '09:00')$$, 'a block has to have a length');
select tests.ok(tests.affected($$insert into public.activity_checkins (day, part, level) values (current_date, 'morning', 'light')$$) = 1, 'morning check-in');
select tests.ok(tests.affected($$insert into public.activity_checkins (day, part, level) values (current_date, 'night', 'gaming')$$) = 1, 'and a night check-in the same day');
select tests.fails($$insert into public.activity_checkins (day, part, level) values (current_date, 'brunch', 'light')$$, 'only morning, midday or night');
select tests.ok(public.checkin_reminder(current_date, 'midday'), 'reminder for the midday check-in not done yet');
select tests.ok(not public.checkin_reminder(current_date, 'midday'), 'only once');
select tests.ok(not public.checkin_reminder(current_date, 'morning'), 'no reminder once checked in');
select tests.ok((select count(*) from public.notifications where kind = 'health.checkin') = 1, 'the reminder is in the alerts');
select tests.ok(tests.affected($$update public.activity_goals set reminders = '{morning}'$$) = 1, 'turn reminders off for later parts');
select tests.ok(not public.checkin_reminder(current_date - 1, 'night'), 'no reminder when it is off');
select tests.fails($$update public.activity_goals set reminders = '{brunch}'$$, 'only known reminders');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.vybe_schedule) = 0, 'no one else sees your schedule');
select tests.ok(not public.checkin_reminder(current_date, 'midday'), 'no reminders before using Active Vybe');
select tests.logout();

select tests.ok(not (select has_function_privilege('anon', 'public.checkin_reminder(date, text)', 'execute')), 'signed-out visitors can''t call it');

rollback;
