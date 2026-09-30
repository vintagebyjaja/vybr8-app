-- Importing real places.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.fails($$select public.import_places('charlotte', '[]')$$, 'only admins import places');
select tests.logout();

select tests.login((select admin from ids));
select tests.ok((select (public.import_places('charlotte', $j$[
  {"ext":"node/1","name":"Mert's Heart and Soul","kind":"restaurant","lat":35.2289,"lng":-80.8412,"address":"214 N College St","postal":"28202","website":"https://mertscharlotte.com","cuisines":["soul_food"],
   "hours":[{"weekday":1,"opens":"11:00","closes":"21:00"},{"weekday":6,"opens":"09:00","closes":"22:00"}]},
  {"ext":"node/2","name":"Chick-fil-A","kind":"restaurant","lat":35.2101,"lng":-80.8601,"address":"1200 South Blvd","brand":"Chick-fil-A"},
  {"ext":"node/3","name":"Chick-fil-A","kind":"restaurant","lat":35.1502,"lng":-80.8321,"address":"4400 Sharon Rd","brand":"Chick-fil-A"},
  {"ext":"node/4","name":"Somewhere in Ohio","kind":"bar","lat":39.96,"lng":-82.99},
  {"ext":"node/5","name":"","kind":"bar","lat":35.22,"lng":-80.84},
  {"ext":"node/6","name":"Mystery Spot","kind":"not_a_kind","lat":35.22,"lng":-80.84}
]$j$) ->> 'added')::int = 3), 'three real places added, bad rows skipped');
select tests.ok((select count(*) from public.businesses where source = 'osm' and status = 'active') = 3, 'imported places are listed right away');
select tests.ok((select bool_and(not is_claimed and approved_at is null) from public.businesses where source = 'osm'), 'but not VYBR8 Approved until claimed');
select tests.ok((select count(distinct branch_name) = 2 and count(distinct brand_id) = 1 from public.businesses where name = 'Chick-fil-A' and source = 'osm'), 'franchise locations share a brand and are told apart by street');
select tests.ok((select count(*) from public.business_hours h join public.business_locations l on l.id = h.location_id join public.businesses b on b.id = l.business_id where b.name = 'Mert''s Heart and Soul') = 2, 'hours come along');
select tests.ok((select (public.import_places('charlotte', '[{"ext":"node/1","name":"Mert''s Heart and Soul","kind":"restaurant","lat":35.2289,"lng":-80.8412}]') ->> 'known')::int = 1), 'importing again never duplicates');
select tests.ok((select (public.import_places('charlotte', '[{"ext":"way/99","name":"Merts Heart & Soul","kind":"restaurant","lat":35.2290,"lng":-80.8413}]') ->> 'matched')::int = 1), 'the same place under another id is matched to the existing listing');
select tests.ok((select count(*) from public.businesses where private.norm_name(name) like 'merts%') = 1, 'still one Mert''s');
select tests.ok((select count(*) from public.city_place_counts() where city_slug = 'charlotte' and imported = 3) = 1, 'the import page sees the counts');
select tests.ok((select count(*) from public.map_location_ids('charlotte', 1000)) <= 400, 'the map loads a capped number of places');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.city_place_counts()) = 0, 'import counts are admin only');
select tests.ok((select count(*) from public.businesses where source = 'osm') = 3, 'everyone can see the imported places');
select tests.logout();

rollback;
