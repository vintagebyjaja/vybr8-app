-- Groups: family, dating, friends, organizations, FTK; kid profiles and transfer.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris,
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,
  '00000000-0000-4000-8000-0000000000a7'::uuid as kay,       -- 16
  '00000000-0000-4000-9700-000000000001'::uuid as family,
  '00000000-0000-4000-9700-000000000002'::uuid as dating,
  '00000000-0000-4000-9800-000000000001'::uuid as jack;
grant select on ids to anon, authenticated, service_role;

-- ── Privacy ───────────────────────────────────────────────────────────
select tests.login((select owner from ids));
select tests.ok((select count(*) from public.groups where id in ((select family from ids), (select dating from ids))) = 0, 'outsiders cannot see someone''s groups');
select tests.ok((select count(*) from public.dependents) = 0, 'outsiders cannot see kid profiles');
select tests.ok((select count(*) from public.taste_profiles where dependent_id is not null) = 0, 'or kids'' tastes');
select tests.logout();

select tests.login((select tia from ids));
select tests.ok((select count(*) from public.dependents where id = (select jack from ids)) = 1, 'family members see the kid profile in their group');
select tests.ok((select 'peanuts' = any(allergies) from public.taste_profiles where dependent_id = (select jack from ids)), 'and his allergies, for planning');
select tests.ok(tests.affected($$update public.taste_profiles set likes = '{candy}' where dependent_id = '00000000-0000-4000-9800-000000000001'$$) = 0, 'only guardians edit a kid''s tastes');
select tests.logout();

-- ── Invites must be accepted ──────────────────────────────────────────
select tests.login((select jaja from ids));
create temp table g (id uuid); grant all on g to authenticated;
insert into g select id from (select 1) x, lateral (select gen_random_uuid() as id) y;
select tests.ok(tests.affected($$insert into public.groups (id, name, kind) select id, 'Book club', 'organization' from g$$) = 1, 'anyone makes a group');
select tests.fails($$insert into public.group_members (group_id, user_id, status, invited_by) select id, '00000000-0000-4000-8000-0000000000a5', 'active', '00000000-0000-4000-8000-0000000000a2' from g$$, 'cannot add someone as active: they must accept');
select tests.ok(tests.affected($$insert into public.group_members (group_id, user_id, relationship, invited_by) select id, '00000000-0000-4000-8000-0000000000a5', 'friend', '00000000-0000-4000-8000-0000000000a2' from g$$) = 1, 'invite someone');
select tests.fails($$insert into public.group_members (group_id, user_id, invited_by) values ('00000000-0000-4000-9700-000000000002', '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a2')$$, 'dating groups are for two people');
select tests.logout();
select tests.ok((select count(*) from public.notifications where kind = 'group.invite' and user_id = (select chris from ids)) = 1, 'invitees get an alert');

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.groups where id = (select id from g)) = 1, 'invitee sees the group they were invited to');
select tests.ok(tests.affected($$update public.group_members set status = 'active' where user_id = '00000000-0000-4000-8000-0000000000a5' and group_id = (select id from g)$$) = 1, 'invitee accepts');
select tests.fails($$update public.group_members set role = 'admin' where user_id = '00000000-0000-4000-8000-0000000000a5' and group_id = (select id from g)$$, 'members cannot promote themselves');
select tests.logout();

-- Minors and dating groups.
select tests.login((select kay from ids));
select tests.fails($$insert into public.groups (name, kind) values ('Us', 'dating')$$, 'dating groups are 18+');
select tests.logout();

-- ── Kid profiles ──────────────────────────────────────────────────────
select tests.login((select marcus from ids));
select tests.fails($$insert into public.group_members (group_id, dependent_id, invited_by) values ('00000000-0000-4000-9700-000000000001', '00000000-0000-4000-9800-000000000001', '00000000-0000-4000-8000-0000000000a3')$$, 'only guardians add a kid to a group');
select tests.fails($$insert into public.group_plan_picks (plan_id, member_id, menu_item_id, added_by) values ('00000000-0000-4000-9900-000000000002', (select id from public.group_members limit 1), '00000000-0000-4000-9500-000000000002', '00000000-0000-4000-8000-0000000000a3')$$, 'non-members cannot add picks');
select tests.logout();

select tests.login((select jaja from ids));
select tests.fails($$insert into public.group_plan_picks (plan_id, member_id, menu_item_id, added_by) select '00000000-0000-4000-9900-000000000002', m.id, '00000000-0000-4000-9500-000000000006', '00000000-0000-4000-8000-0000000000a2' from public.group_members m where m.dependent_id = '00000000-0000-4000-9800-000000000001'$$, 'no cocktails picked for kids');
select tests.ok((select count(*) from public.group_plan_picks) >= 1, 'the family sees its plan picks');
create temp table tok (v text); grant all on tok to authenticated;
insert into tok select public.create_dependent_transfer((select jack from ids));
select tests.fails($$select public.redeem_dependent_transfer((select v from tok))$$, 'a parent cannot take over the kid''s profile');
select tests.logout();

-- Jack grows up: a new 13-year-old account redeems the code.
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000f1', 'jack@demo.vybr8.test',
  jsonb_build_object('username', 'jack_grown', 'birthdate', (current_date - interval '13 years')::date));
select tests.login('00000000-0000-4000-8000-0000000000f1');
select tests.fails($$select public.redeem_dependent_transfer('not-a-code')$$, 'wrong codes fail');
select public.redeem_dependent_transfer((select v from tok));
select tests.ok((select status = 'active' and relationship = 'child' from public.group_members where user_id = '00000000-0000-4000-8000-0000000000f1' and group_id = '00000000-0000-4000-9700-000000000001'), 'the kid stays in the family on their own account');
select tests.ok((select 'fries' = any(likes) from public.taste_profiles where user_id = '00000000-0000-4000-8000-0000000000f1'), 'their tastes came with them');
select tests.ok((select count(*) from public.group_plan_picks p join public.group_members m on m.id = p.member_id where m.user_id = '00000000-0000-4000-8000-0000000000f1') = 1, 'and so did their plan picks');
select tests.fails($$select public.redeem_dependent_transfer((select v from tok))$$, 'codes work once');
select tests.logout();

select tests.login((select jaja from ids));
select tests.ok(tests.affected($$update public.dependents set first_name = 'Jackie' where id = '00000000-0000-4000-9800-000000000001'$$) = 0, 'parents cannot edit the profile after the kid takes over');
select tests.ok((select count(*) from public.notifications where kind = 'family.transfer') = 1, 'parents get told');
select tests.logout();

rollback;
