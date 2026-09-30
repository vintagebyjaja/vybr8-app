-- Owner & cause badges are always verified by the team.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia;
grant select on ids to anon, authenticated, service_role;

select tests.login((select admin from ids));
select public.import_places('atlanta', $j$[
  {"ext":"node/b1","name":"Soul Kitchen ATL","kind":"restaurant","lat":33.7500,"lng":-84.3900},
  {"ext":"node/b2","name":"Corner Cafe","kind":"cafe","lat":33.7510,"lng":-84.3910}
]$j$);
create temp table p as select (select id from public.businesses where name = 'Soul Kitchen ATL') as sk;
grant select on p to anon, authenticated, service_role;
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(public.claim_place_badge((select sk from p), 'black_owned', 'Featured in the AJC list of Black-owned spots') = 'pending', 'anyone can suggest a badge');
select tests.fails($$select public.claim_place_badge((select sk from p), 'best_food', null)$$, 'only known badges');
select tests.ok((select count(*) from public.places_near('atlanta', p_badge => 'black_owned')) = 0, 'nothing shows until the team verifies it');
select tests.logout();

select tests.login((select tia from ids));
select tests.ok(public.claim_place_badge((select sk from p), 'black_owned', null) = 'pending', 'more people can back it up');
select tests.ok((select count(*) from public.place_badges where status = 'pending') = 0, 'other people don''t see pending suggestions');
select tests.logout();

select tests.login((select admin from ids));
select tests.ok((select suggestions from public.badge_queue() where badge = 'black_owned') = 2, 'the team sees how many people suggested it');
select public.review_place_badge((select sk from p), 'black_owned', true);
select tests.ok(public.claim_place_badge((select sk from p), 'woman_owned', 'Owner is Keisha Brown') = 'verified', 'the team can add a verified badge directly');
select tests.logout();

select tests.anon();
select tests.ok((select count(*) from public.places_near('atlanta', p_badge => 'black_owned')) = 1, 'the Black-owned filter shows verified places');
select tests.ok((select badges from public.places_near('atlanta') where name = 'Soul Kitchen ATL') = array['black_owned', 'woman_owned'], 'cards carry their verified badges');
select tests.ok((select count(*) from public.place_badges) = 2, 'everyone sees verified badges');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$select public.review_place_badge((select sk from p), 'black_owned', false)$$, 'only the team verifies');
select tests.logout();

rollback;
