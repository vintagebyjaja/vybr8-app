-- Adding and fixing opening hours.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus;
grant select on ids to anon, authenticated, service_role;

select tests.login((select admin from ids));
select public.import_places('charlotte', '[{"ext":"node/h1","name":"Bodrick''s BBQ","kind":"restaurant","lat":35.24,"lng":-80.82}]');
create temp table loc as select l.id from public.business_locations l join public.businesses b on b.id = l.business_id where b.name = 'Bodrick''s BBQ';
grant select on loc to anon, authenticated, service_role;
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(public.submit_place_hours((select id from loc), '[{"weekday":1,"opens":"11:00","closes":"21:00"},{"weekday":5,"opens":"11:00","closes":"23:00"}]', 'walked by today') = 'suggested', 'anyone can suggest hours');
select tests.ok((select count(*) from public.business_hours where location_id = (select id from loc)) = 0, 'a suggestion isn''t live until the team checks it');
select tests.fails($$select public.submit_place_hours((select id from loc), '[{"weekday":9,"opens":"11:00","closes":"21:00"}]')$$, 'only real weekdays');
select tests.fails($$select public.submit_place_hours((select id from loc), '[{"weekday":1,"opens":"25:00","closes":"21:00"}]')$$, 'only real times');
select tests.fails($$insert into public.business_hours (location_id, weekday, opens_at, closes_at) select id, 2, '09:00', '17:00' from loc$$, 'no writing hours directly');

select tests.ok((select count(*) from public.hours_suggestion_queue()) = 0, 'the queue is for the team only');
select tests.ok(not public.can_edit_place((select business_id from public.business_locations where id = (select id from loc))), 'not the owner');
select tests.logout();
select tests.login((select admin from ids));
select tests.ok((select count(*) from public.hours_suggestion_queue()) = 1, 'the team sees suggested hours');
select public.review_hours_suggestion((select id from public.hours_suggestions where note = 'walked by today'), true);
select tests.ok((select count(*) from public.business_hours where location_id = (select id from loc)) = 2, 'approving puts the hours live');
select tests.ok(public.submit_place_hours((select id from loc), '[{"weekday":0,"opens":"12:00","closes":"20:00"}]') = 'saved', 'the team sets hours directly');
select tests.ok((select count(*) from public.business_hours where location_id = (select id from loc)) = 1, 'new hours replace the old ones');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$select public.review_hours_suggestion(gen_random_uuid(), true)$$, 'only the team approves');
select tests.logout();

rollback;
