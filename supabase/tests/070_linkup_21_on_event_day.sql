-- Drinks Link Ups: you must be 21 on the day it happens.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'bday@demo.vybr8.test',
   jsonb_build_object('username', 'bday_host', 'birthdate', (current_date - interval '21 years' + interval '10 days')::date)),
  ('00000000-0000-4000-8000-0000000000e2', 'friend@demo.vybr8.test',
   jsonb_build_object('username', 'young_friend', 'birthdate', (current_date - interval '21 years' + interval '30 days')::date));

update public.profiles set avatar_url = '/demo/avatars/kay.svg' where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');
create temp table t (id uuid); grant all on t to anon, authenticated, service_role;

select tests.login('00000000-0000-4000-8000-0000000000e1');
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity, is_alcoholic, visibility)
  values ('Pregame', 'charlotte', 'Uptown', now() + interval '2 days', now() + interval '2 days 3 hours', 4, true, 'public')$$,
  'cannot host a drinks Link Up before turning 21');
with x as (insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity, is_alcoholic, visibility, join_mode)
  values ('My 21st birthday bar crawl', 'charlotte', 'South End', now() + interval '12 days', now() + interval '12 days 4 hours', 6, true, 'public', 'open') returning id) insert into t select id from x;
select tests.ok((select count(*) from t) = 1, 'can plan a drinks Link Up for the day after turning 21');
select tests.fails($$update public.linkups set starts_at = now() + interval '3 days', ends_at = now() + interval '3 days 4 hours' where id = (select id from t)$$,
  'cannot move it to before the 21st birthday');
select tests.logout();

-- Someone who is 21+ can join; someone who won't be 21 by then can't see or join it.
select tests.login('00000000-0000-4000-8000-0000000000a3');
select tests.ok(public.join_linkup((select id from t)) = 'going', 'a 21+ member can join');
select tests.logout();

select tests.login('00000000-0000-4000-8000-0000000000e2');
select tests.ok((select count(*) from public.linkups where id = (select id from t)) = 0, 'someone not 21 by the event day cannot see it');
select tests.fails($$select public.join_linkup((select id from t))$$, 'and cannot join it');
select tests.logout();

-- Guests: judged on the event day too.
select tests.login('00000000-0000-4000-8000-0000000000e1');
create temp table tok (v text); grant all on tok to anon, authenticated, service_role;
insert into tok select public.create_guest_invite((select id from t), 'Cousin');
insert into tok select public.create_guest_invite((select id from t), 'Little sis');
select tests.logout();
select tests.anon();
select tests.fails($$select public.guest_accept_invite((select v from tok offset 1 limit 1), 'Sis', (current_date - interval '20 years')::date)$$,
  'a guest who will not be 21 by the event day is refused');
select public.guest_accept_invite((select v from tok limit 1), 'Cousin', (current_date - interval '21 years' + interval '11 days')::date);
select tests.ok((select invite_status from (select public.guest_view_invite((select v from tok limit 1)) ->> 'invite_status' as invite_status) x) = 'accepted',
  'a guest who turns 21 before the event day can accept');
select tests.logout();

rollback;
