-- New cities, and places in nearby towns keep their real address.

begin;
create temp table ids as select '00000000-0000-4000-8000-0000000000a3'::uuid as marcus;
grant select on ids to anon, authenticated, service_role;

select tests.ok((select count(*) from public.cities where slug in ('chicago', 'la', 'philly')) = 3, 'Chicago, Los Angeles and Philadelphia are live');

select tests.login((select marcus from ids));
select tests.ok((public.submit_place('Concord Test Kitchen', 'restaurant', 'charlotte', '100 Union St S', null, '28025', 35.4088, -80.5795, null, false, null, null, 'Concord', 'nc')) ->> 'status' = 'created',
  'a spot in Concord can go under Charlotte');
select tests.ok((select l.city || ', ' || l.region from public.business_locations l join public.businesses b on b.id = l.business_id where b.name = 'Concord Test Kitchen') = 'Concord, NC',
  'and its page shows Concord, NC');
select tests.ok((select l.city_slug from public.business_locations l join public.businesses b on b.id = l.business_id where b.name = 'Concord Test Kitchen') = 'charlotte',
  'while it lives in the Charlotte bubble');
select tests.fails($$select public.submit_place('Too Far Grill', 'restaurant', 'charlotte', '1 Peachtree St', null, null, 33.749, -84.388, null, false, null, null, null, null)$$,
  'a pin in another state is too far');
select tests.fails($$select public.submit_place('Bad Town Cafe', 'restaurant', 'charlotte', '5 Main St', null, null, null, null, null, false, null, null, '<script>', null)$$,
  'town names are letters only');
select tests.logout();
rollback;
