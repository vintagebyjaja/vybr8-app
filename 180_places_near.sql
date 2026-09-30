-- "What Should I Eat?" lists every place near you.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus;
grant select on ids to anon, authenticated, service_role;

select tests.login((select admin from ids));
select public.import_places('miami', $j$[
  {"ext":"node/m1","name":"Sushi Spot","kind":"restaurant","lat":25.7700,"lng":-80.1900,"cuisines":["sushi","japanese"],"hours":[{"weekday":0,"opens":"00:00","closes":"23:59"},{"weekday":1,"opens":"00:00","closes":"23:59"},{"weekday":2,"opens":"00:00","closes":"23:59"},{"weekday":3,"opens":"00:00","closes":"23:59"},{"weekday":4,"opens":"00:00","closes":"23:59"},{"weekday":5,"opens":"00:00","closes":"23:59"},{"weekday":6,"opens":"00:00","closes":"23:59"}]},
  {"ext":"node/m2","name":"Wing Palace","kind":"restaurant","lat":25.8000,"lng":-80.2000,"cuisines":["chicken","wings"]},
  {"ext":"node/m3","name":"Bay Brews","kind":"cafe","lat":25.7620,"lng":-80.1920,"cuisines":["coffee_shop"]},
  {"ext":"node/m4","name":"Night Owl Club","kind":"nightlife","lat":25.7900,"lng":-80.1300}
]$j$);
select tests.logout();

select tests.anon();
select tests.ok((select count(*) from public.places_near('miami')) = 4, 'every place shows, with or without VYBR8 ratings');
select tests.ok((select name from public.places_near('miami', 25.7617, -80.1918) limit 1) = 'Bay Brews', 'closest to you comes first');
select tests.ok((select count(*) from public.places_near('miami', p_kinds => array['cafe'])) = 1, 'filter by kind of place');
select tests.ok((select count(*) from public.places_near('miami', p_cuisine => 'wings')) = 1, 'filter by cuisine');
select tests.ok((select count(*) from public.places_near('miami', p_q => 'palace')) = 1, 'search by name');
select tests.ok((select count(*) from public.places_near('miami', p_open_now => true)) = 1, 'open now uses real hours (places without hours are left out)');
select tests.ok((select name from public.places_near('miami', p_likes => array['wings'], p_sort => 'for_you') limit 1) = 'Wing Palace', 'your tastes come first');
select tests.ok((select count(*) from public.places_near('miami', p_likes => array['wings'], p_sort => 'for_you')) = 4, 'but the rest are still listed');
select tests.ok((select match from public.places_near('miami', p_dislikes => array['sushi']) where name = 'Sushi Spot') < 0, 'places you won''t eat at sink');
select tests.ok((select cuisine from public.city_cuisines('miami') limit 1) is not null, 'cuisine chips come from the city''s places');
select tests.logout();

rollback;
