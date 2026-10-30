-- Link Up ETAs: opt-in, ETA only, the group only, while it's on.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as other,
  '00000000-0000-4000-8000-0000000000a2'::uuid as founder,
  '00000000-0000-4000-9900-00000000e001'::uuid as lu;
grant select on ids to anon, authenticated, service_role;

alter table public.linkups disable trigger user;
insert into public.linkups (id, host_id, title, city_slug, meet_point, starts_at, ends_at, capacity)
values ((select lu from ids), (select marcus from ids), 'Wing night', 'charlotte', 'Freedom Park', now() + interval '1 hour', now() + interval '4 hours', 4);
alter table public.linkups enable trigger user;
alter table public.linkup_members disable trigger user;
insert into public.linkup_members (linkup_id, user_id, status, is_host) values
  ((select lu from ids), (select marcus from ids), 'going', true),
  ((select lu from ids), (select founder from ids), 'going', false);
alter table public.linkup_members enable trigger user;

select tests.login((select founder from ids));
select public.share_linkup_eta((select lu from ids), 12, 'drive');
select tests.fails($$select public.share_linkup_eta((select lu from ids), -5, 'drive')$$, 'no nonsense ETAs');
select tests.fails($$insert into public.linkup_etas (linkup_id, user_id, minutes_away, arrives_at) values ((select lu from ids), (select founder from ids), 1, now())$$, 'no writing ETAs directly');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok((select minutes_away from public.linkup_etas where linkup_id = (select lu from ids)) = 12, 'the host sees who''s on the way');
select tests.ok(not exists (select 1 from information_schema.columns where table_name = 'linkup_etas' and column_name in ('lat', 'lng', 'latitude', 'longitude', 'route')),
  'only an ETA is stored, never a location');
select tests.logout();

select tests.login((select other from ids));
select tests.ok(not exists (select 1 from public.linkup_etas where linkup_id = (select lu from ids)), 'people not going see nothing');
select tests.fails($$select public.share_linkup_eta((select lu from ids), 5, 'walk')$$, 'only people going can share');
select tests.logout();

select tests.anon();
select tests.ok(not exists (select 1 from public.linkup_etas), 'signed-out visitors see nothing');
select tests.logout();

-- Leaving removes your ETA.
update public.linkup_members set status = 'left' where linkup_id = (select lu from ids) and user_id = (select founder from ids);
select tests.ok(not exists (select 1 from public.linkup_etas where user_id = (select founder from ids)), 'leaving the Link Up removes your ETA');

-- A Link Up starting tomorrow doesn't take ETAs yet.
update public.linkup_members set status = 'going' where linkup_id = (select lu from ids) and user_id = (select founder from ids);
alter table public.linkups disable trigger user;
update public.linkups set starts_at = now() + interval '20 hours', ends_at = now() + interval '22 hours' where id = (select lu from ids);
alter table public.linkups enable trigger user;
select tests.login((select founder from ids));
select tests.fails($$select public.share_linkup_eta((select lu from ids), 12, 'drive')$$, 'ETAs open 4 hours before it starts');
select tests.logout();

-- Cancelling removes everyone's ETAs.
alter table public.linkups disable trigger user;
update public.linkups set starts_at = now() + interval '1 hour', ends_at = now() + interval '3 hours' where id = (select lu from ids);
alter table public.linkups enable trigger user;
select tests.login((select founder from ids));
select public.share_linkup_eta((select lu from ids), 9, 'walk');
select public.stop_linkup_eta((select lu from ids));
select tests.ok(not exists (select 1 from public.linkup_etas where user_id = (select founder from ids)), 'turning sharing off removes your ETA');
select public.share_linkup_eta((select lu from ids), 9, 'walk');
select tests.logout();
update public.linkups set status = 'cancelled' where id = (select lu from ids);
select tests.ok(not exists (select 1 from public.linkup_etas where linkup_id = (select lu from ids)), 'cancelling clears all ETAs');

rollback;
