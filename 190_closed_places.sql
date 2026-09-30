-- Permanently closed places.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

select tests.login((select admin from ids));
select public.import_places('charlotte', $j$[
  {"ext":"node/c1","name":"Nubian Queens","kind":"restaurant","lat":35.2051,"lng":-80.7702,"address":"413 Eastway Dr"},
  {"ext":"node/c2","name":"Gone Grill","kind":"restaurant","lat":35.2151,"lng":-80.8002,"address":"100 Main St"}
]$j$);
create temp table p as select (select id from public.businesses where name = 'Nubian Queens') as nq, (select id from public.businesses where name = 'Gone Grill') as gg;
grant select on p to anon, authenticated, service_role;
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(public.report_place_closed((select gg from p)) = 'reported', 'one report doesn''t hide a place');
select tests.ok(public.report_place_closed((select gg from p)) = 'reported', 'the same person reporting twice still counts once');
select tests.ok(tests.affected($$update public.businesses set status = 'hidden' where name = 'Gone Grill'$$) = 0, 'people can''t hide places directly');
select tests.logout();
select tests.login((select tia from ids));
select tests.ok(public.report_place_closed((select gg from p)) = 'reported', 'two people');
select tests.logout();
select tests.login((select chris from ids));
select tests.ok(public.report_place_closed((select gg from p)) = 'closed', 'three different people hide it');
select tests.ok((select count(*) from public.businesses where name = 'Gone Grill') = 0, 'closed places disappear for everyone');
select tests.ok((select count(*) from public.places_near('charlotte') where name = 'Gone Grill') = 0, 'including What Should I Eat?');
select tests.ok((select count(*) from public.closure_report_queue()) = 0, 'only the team sees the report queue');
select tests.logout();

select tests.login((select admin from ids));
select tests.ok(public.report_place_closed((select nq from p)) = 'closed', 'the team closes a place in one tap');
select tests.ok((select closed_at is not null and status = 'hidden' from public.businesses where name = 'Nubian Queens'), 'marked closed, not deleted');
select tests.ok((select count(*) from public.closure_report_queue()) = 2, 'both show in the Admin queue');
select public.review_place_closure((select gg from p), false);
select tests.ok((select status = 'active' and closed_at is null from public.businesses where name = 'Gone Grill'), 'a place reported by mistake comes back');
select tests.ok((select count(*) from public.place_closure_reports where business_id = (select gg from p)) = 0, 'and its reports are cleared');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$select public.review_place_closure((select nq from p), false)$$, 'only the team reopens places');
select tests.logout();

rollback;
