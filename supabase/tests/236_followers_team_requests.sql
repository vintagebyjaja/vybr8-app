-- Followers / following / mutuals, follow alerts, and answering team join requests.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as founder,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia;
grant select on ids to anon, authenticated, service_role;
update public.profiles set is_demo = false where id in ((select marcus from ids), (select tia from ids));
delete from public.follows where follower_id in ((select founder from ids), (select marcus from ids), (select tia from ids))
                              or followee_id in ((select founder from ids), (select marcus from ids), (select tia from ids));
delete from public.notifications where kind = 'follow.new';

-- Tia follows Marcus and the founder; Marcus follows the founder.
select tests.login((select tia from ids));
insert into public.follows (follower_id, followee_id) values ((select tia from ids), (select marcus from ids)), ((select tia from ids), (select founder from ids));
select tests.logout();
select tests.login((select marcus from ids));
insert into public.follows (follower_id, followee_id) values ((select marcus from ids), (select founder from ids));
select tests.ok((select count(*) from public.notifications where kind = 'follow.new') = 1, 'Marcus hears that Tia followed him');
select tests.logout();

select tests.login((select tia from ids));
select tests.ok((select count(*) from public.profile_connections((select founder from ids), 'followers')) = 2, 'founder has 2 followers');
select tests.ok((select total from public.profile_connections((select founder from ids), 'followers', 1)) = 2, 'total comes back even on a short page');
select tests.ok((select count(*) from public.profile_connections((select tia from ids), 'following')) = 2, 'Tia follows 2 people');
select tests.ok((select username from public.profile_connections((select founder from ids), 'mutual')) = (select username::text from public.profiles where id = (select marcus from ids)),
  'mutuals: Marcus, whom Tia follows, also follows the founder');
select tests.ok((select count(*) from public.profile_connections((select founder from ids), 'mutual')) = 1, 'Tia never counts as her own mutual');
select tests.ok((select i_follow from public.profile_connections((select founder from ids), 'followers') where id = (select marcus from ids)), 'shows who you already follow');
select tests.logout();

-- A private profile drops out of lists for people who can't see it.
update public.privacy_settings set profile_visibility = 'private' where user_id = (select marcus from ids);
select tests.login((select tia from ids));
select tests.ok((select count(*) from public.profile_connections((select founder from ids), 'followers')) = 1, 'private profiles stay hidden in lists');
select tests.logout();
update public.privacy_settings set profile_visibility = 'public' where user_id = (select marcus from ids);

-- Team join requests.
select tests.login((select tia from ids));
insert into public.support_tickets (email, topic, message) values ('tia@example.com', 'team', 'Want to help with the Charlotte market');
select tests.ok((select count(*) from public.team_join_requests()) = 0, 'only the founder sees join requests');
select tests.fails($$select public.team_answer_request((select id from public.support_tickets where topic = 'team' limit 1), true)$$, 'only the founder answers them');
select tests.logout();

select tests.login((select founder from ids));
select tests.ok((select count(*) from public.team_join_requests() where user_id = (select tia from ids)) = 1, 'the founder sees Tia''s request');
select public.team_answer_request((select ticket_id from public.team_join_requests() where user_id = (select tia from ids)), true, 'moderator', 'Charlotte Market');
select tests.ok((select title from public.team_members where user_id = (select tia from ids)) = 'Charlotte Market', 'accepting adds her with that title');
select tests.ok((select role::text from public.user_roles where user_id = (select tia from ids)) = 'moderator', 'as a Moderator');
select tests.ok((select count(*) from public.team_join_requests() where user_id = (select tia from ids)) = 0, 'and the request leaves the list');
select tests.fails($$select public.team_answer_request((select id from public.support_tickets where topic = 'team' and user_id = (select tia from ids) limit 1), false)$$, 'can''t answer twice');
select tests.logout();

select tests.login((select marcus from ids));
insert into public.support_tickets (email, topic, message) values ('marcus@example.com', 'team', 'I can help with the Atlanta timeline');
select tests.logout();
select tests.login((select founder from ids));
select public.team_answer_request((select ticket_id from public.team_join_requests() where user_id = (select marcus from ids)), false);
select tests.ok(not exists (select 1 from public.team_members where user_id = (select marcus from ids)), 'declining adds no one');
select tests.logout();
select tests.login((select marcus from ids));
select tests.ok((select status from public.support_tickets where topic = 'team') = 'closed', 'Marcus sees his request was answered');
select tests.ok((select count(*) from public.notifications where kind = 'team.request') = 1, 'and gets a kind note');
select tests.logout();

rollback;
