-- Founder outranks the team; profile photos; identity badges.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,   -- team (not founder)
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,    -- founder
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-9300-0000000000e1'::uuid as wings;
grant select on ids to anon, authenticated, service_role;

-- ── Team removes, founder vetoes ──────────────────────────────────────
select tests.login((select tia from ids));
select tests.fails($$select public.team_remove('post', '00000000-0000-4000-9300-0000000000e1', 'spam')$$, 'regular members cannot remove content');
select tests.fails($$insert into public.team_members (user_id, title, is_founder) values ('00000000-0000-4000-8000-0000000000a4', 'Founder', true)$$, 'no one else can make themselves founder');
select tests.logout();

select tests.login((select admin from ids));
select tests.ok(not private.is_founder(), 'team admin is not the founder');
create temp table act (id uuid); grant all on act to authenticated;
insert into act select public.team_remove('post', (select wings from ids), 'Photo is not food (test)');
select tests.ok((select status = 'removed' from public.posts where id = (select wings from ids)), 'team removes a post');
select tests.fails($$select public.founder_decide((select id from act), 'vetoed')$$, 'team cannot make founder decisions');
select tests.fails($$insert into public.team_members (user_id, title) values ('00000000-0000-4000-8000-0000000000a4', 'Mod')$$, 'only the founder adds team members');
select tests.logout();

select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.moderation_actions where founder_decision is null) = 1, 'founder sees the team''s decision waiting');
select public.founder_decide((select id from act), 'vetoed', 'This is a plate, keep it (test)');
select tests.ok((select status = 'published' from public.posts where id = (select wings from ids)), 'founder veto restores the post');
select tests.logout();

select tests.login((select admin from ids));
select tests.fails($$select public.team_remove('post', '00000000-0000-4000-9300-0000000000e1', 'Trying again')$$, 'team cannot overrule the founder''s veto');
select tests.logout();

select tests.login((select jaja from ids));
select public.founder_decide((select id from act), 'upheld', 'Changed my mind: remove (test)');
select tests.ok((select status = 'removed' from public.posts where id = (select wings from ids)), 'founder can double down and remove');
select tests.ok((select count(*) from public.audit_logs where action like 'moderation.%') = 3, 'every decision is audited');
select tests.logout();

-- ── Profile photos ────────────────────────────────────────────────────
select tests.login((select tia from ids));
select tests.fails($$update public.profiles set avatar_url = '00000000-0000-4000-8000-0000000000a2/me.webp' where id = '00000000-0000-4000-8000-0000000000a4'$$, 'cannot point your photo at someone else''s folder');
select tests.ok(tests.affected($$update public.profiles set avatar_url = '00000000-0000-4000-8000-0000000000a4/me.webp' where id = '00000000-0000-4000-8000-0000000000a4'$$) = 1, 'set your own profile photo');
select tests.logout();

-- ── Identity badge ────────────────────────────────────────────────────
insert into public.identity_verifications (user_id, provider, status, verified_at) values ((select tia from ids), 'test', 'verified', now());
select tests.anon();
select tests.ok((select count(*) from public.identity_verifications) = 0, 'verification records are private');
select tests.ok((select count(*) from public.identity_verified(array['00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a2']::uuid[])) = 1, 'anyone can see who has the ID-verified badge');
select tests.logout();

rollback;
