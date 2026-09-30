-- The founder manages the VYBR8 Team.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as founder,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia;
grant select on ids to anon, authenticated, service_role;
update public.profiles set is_demo = false where id in ((select marcus from ids), (select tia from ids));

select tests.login((select marcus from ids));
select tests.fails($$select public.team_set_member((select username from public.profiles where id = (select tia from ids)), 'admin', 'Boss')$$, 'only the founder adds people');
select tests.ok((select count(*) from public.team_roster()) = 0, 'only the founder sees the roster tools');
select tests.logout();

select tests.login((select founder from ids));
select tests.ok(public.team_set_member('@' || (select username from public.profiles where id = (select marcus from ids)), 'moderator', 'Community Team') = (select marcus from ids), 'add someone by username');
select tests.ok((select role::text from public.user_roles where user_id = (select marcus from ids)) = 'moderator', 'with the role picked');
select tests.ok((select title from public.team_members where user_id = (select marcus from ids)) = 'Community Team', 'and their badge title');
select public.team_set_member((select username from public.profiles where id = (select marcus from ids)), 'admin', 'Head of Community');
select tests.ok((select count(*) from public.user_roles where user_id = (select marcus from ids)) = 1 and (select role::text from public.user_roles where user_id = (select marcus from ids)) = 'admin', 'change their role');
select tests.fails($$select public.team_set_member('nobody_here_123', 'moderator', 'Team')$$, 'they have to sign up first');
select tests.fails($$select public.team_remove_member((select founder from ids))$$, 'the founder stays');
select public.team_remove_member((select marcus from ids));
select tests.ok((select count(*) from public.user_roles where user_id = (select marcus from ids)) = 0 and (select count(*) from public.team_members where user_id = (select marcus from ids)) = 0, 'remove someone from the team');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.notifications where kind = 'team.added') >= 1, 'they get a welcome');
select tests.ok(not private.is_staff(), 'and lose team access when removed');
select tests.logout();

rollback;
