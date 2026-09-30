-- Saved places and "Never again".

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia;
grant select on ids to anon, authenticated, service_role;

select tests.login((select admin from ids));
select public.import_places('nashville', $j$[
  {"ext":"node/n1","name":"Bad Wings","kind":"restaurant","lat":36.1600,"lng":-86.7800},
  {"ext":"node/n2","name":"Great Tacos","kind":"restaurant","lat":36.1610,"lng":-86.7810}
]$j$);
select tests.logout();
create temp table p as select (select id from public.businesses where name = 'Bad Wings') as bad, (select id from public.businesses where name = 'Great Tacos') as good;
grant select on p to anon, authenticated, service_role;

-- Tia hosts a Link Up at Bad Wings that Marcus is going to; they're also in a group with a plan there.
insert into public.linkups (id, host_id, title, city_slug, business_id, starts_at, ends_at, capacity, visibility)
values ('00000000-0000-4000-8000-00000000c001', (select tia from ids), 'Wing night', 'nashville', (select bad from p), now() + interval '2 days', now() + interval '2 days 3 hours', 6, 'friends');
insert into public.linkup_members (linkup_id, user_id, status) values ('00000000-0000-4000-8000-00000000c001', (select marcus from ids), 'going');
insert into public.groups (id, owner_id, name, kind) values ('00000000-0000-4000-8000-00000000c002', (select tia from ids), 'Crew', 'friends');
insert into public.group_members (group_id, user_id, role, status)
select '00000000-0000-4000-8000-00000000c002', (select tia from ids), 'owner', 'active'
 where not exists (select 1 from public.group_members where group_id = '00000000-0000-4000-8000-00000000c002' and user_id = (select tia from ids));
insert into public.group_members (group_id, user_id, role, status) values ('00000000-0000-4000-8000-00000000c002', (select marcus from ids), 'member', 'active');
insert into public.group_plans (group_id, title, business_id, planned_for, created_by)
values ('00000000-0000-4000-8000-00000000c002', 'Friday wings', (select bad from p), now() + interval '3 days', (select tia from ids));

select tests.login((select marcus from ids));
select tests.ok(public.set_place_list((select good from p), 'saved') = 'saved', 'save a place');
select tests.ok((select saved from public.places_near('nashville') where name = 'Great Tacos'), 'saved places are marked in the list');
select tests.ok((select count(*) from public.places_near('nashville', p_saved_only => true)) = 1, 'and can be listed on their own');
select tests.ok(public.set_place_list((select bad from p), 'never', 'food poisoning') = 'never', 'mark a place Never again');
select tests.ok((select count(*) from public.places_near('nashville') where name = 'Bad Wings') = 0, 'it disappears from your recommendations');
select tests.ok((select count(*) from public.place_lists) = 2, 'your lists are yours');
select tests.logout();

select tests.login((select tia from ids));
select tests.ok((select count(*) from public.places_near('nashville') where name = 'Bad Wings') = 1, 'other people still see the place');
select tests.ok((select count(*) from public.place_lists) = 0, 'and never see anyone else''s lists');
select tests.ok((select count(*) from public.notifications where kind = 'linkup.never_again') = 1, 'the Link Up host gets a heads-up');
select tests.ok((select count(*) from public.notifications where kind = 'group.never_again') = 1, 'so does the group');
select tests.ok((select body from public.notifications where kind = 'linkup.never_again') not like '%poisoning%', 'the private reason is never shared');
select tests.ok((select count(*) from public.group_never_places('00000000-0000-4000-8000-00000000c002')) = 1, 'group suggestions know to skip it');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(public.set_place_list((select bad from p), null) = 'cleared', 'changed your mind? clear it');
select tests.ok((select count(*) from public.places_near('nashville') where name = 'Bad Wings') = 1, 'and it''s back');
select tests.logout();

rollback;
