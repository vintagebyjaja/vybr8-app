-- Phase 1 security tests: identity, privacy, friendships, businesses, claims.
-- Runs inside one transaction and rolls back, so seed data stays intact.

begin;

-- Shorthand ids (see seed.sql)
create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris,
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,
  '00000000-0000-4000-9000-0000000000b1'::uuid as ember,
  '00000000-0000-4000-9000-0000000000b2'::uuid as velvet,
  '00000000-0000-4000-9000-0000000000b7'::uuid as rooftop,
  '00000000-0000-4000-9100-0000000000c1'::uuid as claim;
grant select on ids to anon, authenticated;

-- Phase 1 tests treat demo Jaja as a regular consumer (the seed also makes her founder/admin).
delete from public.user_roles where user_id = (select jaja from ids);

-- ── Sign-up trigger ───────────────────────────────────────────────────
select tests.ok((select count(*) from public.profiles where is_demo) = 7, 'seed users got profiles via sign-up trigger');
select tests.ok((select count(*) from public.privacy_settings) = (select count(*) from public.profiles), 'every profile has privacy settings');
select tests.ok((select count(*) from public.user_settings) = (select count(*) from public.profiles), 'every profile has user settings');

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000ff', 'dupe@demo.vybr8.test', '{"username":"demo_jaja"}');
select tests.ok((select username::text like 'vyber\_%' from public.profiles where id = '00000000-0000-4000-8000-0000000000ff'),
  'taken username falls back to a generated one');

-- ── Profiles and privacy ──────────────────────────────────────────────
select tests.anon();
select tests.ok((select count(*) from public.profiles where id = (select jaja from ids)) = 1, 'anon sees a public profile');
select tests.ok((select count(*) from public.profiles where id = (select chris from ids)) = 0, 'anon cannot see a friends-only profile');
select tests.ok((select count(*) from public.user_settings) = 0, 'anon reads no user settings');
select tests.ok((select count(*) from public.business_claims) = 0, 'anon reads no business claims');

select tests.logout(); select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.profiles where id = (select chris from ids)) = 0, 'non-friend cannot see friends-only profile');
select tests.ok((select count(*) from public.user_settings) = 1, 'user reads only own settings');
select tests.ok(not private.can_view((select jaja from ids), 'health'), 'health data is never visible to others');

select tests.logout(); select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.profiles where id = (select chris from ids)) = 1, 'friend can see friends-only profile');
select tests.ok(tests.affected($$update public.profiles set display_name = 'Jaja!' where id = '00000000-0000-4000-8000-0000000000a2'$$) = 1, 'user updates own profile');
select tests.ok(tests.affected($$update public.profiles set display_name = 'hacked' where id = '00000000-0000-4000-8000-0000000000a3'$$) = 0, 'user cannot update another profile');
select tests.fails($$update public.profiles set is_demo = false where id = '00000000-0000-4000-8000-0000000000a2'$$, 'user cannot change own demo flag');
select tests.fails($$insert into public.profiles (id, username) values (gen_random_uuid(), 'sneaky')$$, 'user cannot insert profiles directly');
select tests.ok((select count(*) from public.privacy_settings) = 1, 'user reads only own privacy settings');
select tests.fails($$update public.privacy_settings set health_visibility = 'friends' where user_id = '00000000-0000-4000-8000-0000000000a2'$$, 'health visibility cannot be relaxed');
select tests.ok(tests.affected($$update public.privacy_settings set saves_visibility = 'public' where user_id = '00000000-0000-4000-8000-0000000000a3'$$) = 0, 'user cannot edit another user''s privacy');

-- ── Platform roles ────────────────────────────────────────────────────
select tests.ok(not private.is_admin(), 'regular user is not admin');
select tests.fails($$insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000a2', 'admin')$$, 'user cannot grant themselves admin');
select tests.ok((select count(*) from public.user_roles) = 0, 'user sees no roles they do not hold');
select tests.logout(); select tests.login((select admin from ids));
select tests.ok(private.is_admin(), 'admin is admin');
select tests.ok((select count(*) from public.user_roles) >= 1, 'admin reads roles');
select tests.ok(not private.can_view((select jaja from ids), 'health'), 'even admins cannot view health data');

-- ── Friendships ───────────────────────────────────────────────────────
select tests.logout(); select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.friendships) = 3, 'user sees own friendships');
select tests.logout(); select tests.login((select chris from ids));
select tests.ok((select count(*) from public.friendships where status = 'pending') = 0, 'user cannot see other people''s requests');

select tests.logout(); select tests.login((select marcus from ids));
select tests.fails($$update public.friendships set status = 'accepted' where requester_id = '00000000-0000-4000-8000-0000000000a3' and addressee_id = '00000000-0000-4000-8000-0000000000a4'$$, 'requester cannot accept own request');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok(tests.affected($$update public.friendships set status = 'accepted' where requester_id = '00000000-0000-4000-8000-0000000000a3' and addressee_id = '00000000-0000-4000-8000-0000000000a4'$$) = 1, 'addressee accepts request');

select tests.logout(); select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a2')$$) = 1, 'user sends a friend request');
select tests.fails($$insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a5')$$, 'user cannot send requests on someone else''s behalf');
select tests.fails($$insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a5', 'accepted')$$, 'user cannot create an accepted friendship');
select tests.logout(); select tests.login((select jaja from ids));
select tests.fails($$insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a6')$$, 'duplicate reverse request is rejected');

select tests.ok(tests.affected($$update public.friendships set status = 'blocked' where '00000000-0000-4000-8000-0000000000a5' in (requester_id, addressee_id)$$) = 1, 'user blocks a friend');
select tests.logout(); select tests.login((select chris from ids));
select tests.ok(tests.affected($$delete from public.friendships where '00000000-0000-4000-8000-0000000000a2' in (requester_id, addressee_id)$$) = 0, 'blocked person cannot remove the block');
select tests.fails($$update public.friendships set status = 'accepted' where '00000000-0000-4000-8000-0000000000a2' in (requester_id, addressee_id)$$, 'blocked person cannot un-block by accepting');
select tests.logout(); select tests.login((select jaja from ids));
select tests.ok(tests.affected($$delete from public.friendships where '00000000-0000-4000-8000-0000000000a5' in (requester_id, addressee_id)$$) = 1, 'blocker can remove the block');

-- ── Businesses ────────────────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.businesses) = 8, 'anon sees only active businesses');
select tests.ok((select count(*) from public.business_locations where business_id = (select rooftop from ids)) = 0, 'locations of hidden or pending businesses are hidden');

select tests.logout(); select tests.login((select jaja from ids));
select tests.fails($$insert into public.businesses (slug, name, kind) values ('fake-spot', 'Fake', 'bar')$$, 'consumer cannot create businesses');
select tests.ok(tests.affected($$update public.businesses set name = 'Mine now' where slug = 'ember-and-oak'$$) = 0, 'consumer cannot edit a business');
select tests.ok(tests.affected($$update public.business_locations set city = 'Nowhere'$$) = 0, 'consumer cannot edit locations');

select tests.logout(); select tests.login((select admin from ids));
select tests.ok((select count(*) from public.businesses) = 9, 'admin sees pending businesses');
select tests.ok(tests.affected($$insert into public.businesses (slug, name, kind, status) values ('admin-added', 'Admin Added', 'cafe', 'active')$$) = 1, 'admin creates a business');

-- ── Claims ────────────────────────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok((select count(*) from public.business_claims) = 1, 'claimant sees own claim');
select tests.fails($$select public.approve_business_claim('00000000-0000-4000-9100-0000000000c1')$$, 'claimant cannot approve own claim');
select tests.fails($$update public.business_claims set status = 'approved'$$, 'claimant cannot mark own claim approved');

select tests.logout(); select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.business_claims) = 0, 'users cannot see other people''s claims or evidence');
select tests.ok(tests.affected($$insert into public.business_claims (business_id, claimant_role) values ('00000000-0000-4000-9000-0000000000b2', 'Manager')$$) = 1, 'user files a claim');
select tests.fails($$insert into public.business_claims (business_id) values ('00000000-0000-4000-9000-0000000000b7')$$, 'cannot claim a pending business');
select tests.fails($$insert into public.business_claims (business_id, status) values ('00000000-0000-4000-9000-0000000000b3', 'approved')$$, 'cannot file a pre-approved claim');
select tests.ok(tests.affected($$update public.business_claims set status = 'withdrawn' where business_id = '00000000-0000-4000-9000-0000000000b2'$$) = 1, 'claimant withdraws own pending claim');
select tests.fails($$update public.business_claims set status = 'pending' where business_id = '00000000-0000-4000-9000-0000000000b2'$$, 'withdrawn claim cannot be reopened');

select tests.logout(); select tests.anon();
select tests.fails($$select public.approve_business_claim('00000000-0000-4000-9100-0000000000c1')$$, 'anon cannot call admin RPC');

select tests.logout(); select tests.login((select admin from ids));
select tests.fails($$select public.reject_business_claim('00000000-0000-4000-9100-0000000000c1', '  ')$$, 'rejection requires a reason');
select public.approve_business_claim((select claim from ids), 'Verified by phone (demo)');
select tests.ok((select is_claimed from public.businesses where id = (select ember from ids)), 'approval marks business claimed');
select tests.ok((select role = 'owner' from public.business_members where business_id = (select ember from ids) and user_id = (select owner from ids)), 'approval makes claimant owner');
select tests.ok((select count(*) from public.audit_logs where action = 'business_claim.approved') = 1, 'approval is audited');
select tests.fails($$select public.approve_business_claim('00000000-0000-4000-9100-0000000000c1')$$, 'claim cannot be approved twice');

-- ── Business owner powers and limits ─────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok(tests.affected($$update public.businesses set description = 'Updated by owner' where slug = 'ember-and-oak'$$) = 1, 'owner edits business profile');
select tests.fails($$update public.businesses set status = 'hidden' where slug = 'ember-and-oak'$$, 'owner cannot change moderation status');
select tests.fails($$update public.businesses set is_claimed = false where slug = 'ember-and-oak'$$, 'owner cannot change claim flag');
select tests.ok(tests.affected($$update public.businesses set description = 'x' where slug = 'velvet-hour'$$) = 0, 'owner cannot edit another business');
select tests.ok(tests.affected($$insert into public.business_locations (business_id, city, region) values ('00000000-0000-4000-9000-0000000000b1', 'Charlotte', 'NC')$$) = 1, 'owner adds a location');
select tests.fails($$insert into public.business_locations (business_id, city, region, is_demo) values ('00000000-0000-4000-9000-0000000000b1', 'Charlotte', 'NC', true)$$, 'owner cannot create demo records');
select tests.ok(tests.affected($$insert into public.business_members (business_id, user_id, role) values ('00000000-0000-4000-9000-0000000000b1', '00000000-0000-4000-8000-0000000000a2', 'manager')$$) = 1, 'owner adds a manager');
select tests.fails($$insert into public.business_members (business_id, user_id, role) values ('00000000-0000-4000-9000-0000000000b1', '00000000-0000-4000-8000-0000000000a3', 'owner')$$, 'owner cannot mint another owner');
select tests.ok((select count(*) from public.audit_logs) = 0, 'business owners cannot read audit logs');

select tests.logout(); select tests.login((select jaja from ids));
select tests.ok(tests.affected($$update public.businesses set description = 'Manager edit' where slug = 'ember-and-oak'$$) = 1, 'manager edits business profile');
select tests.fails($$insert into public.business_members (business_id, user_id, role) values ('00000000-0000-4000-9000-0000000000b1', '00000000-0000-4000-8000-0000000000a3', 'staff')$$, 'manager cannot add team members');
select tests.ok(tests.affected($$delete from public.business_members where business_id = '00000000-0000-4000-9000-0000000000b1' and role = 'owner'$$) = 0, 'manager cannot remove the owner');

select tests.logout(); select tests.login((select marcus from ids));
select tests.ok(tests.affected($$update public.business_locations set city = 'Nowhere' where business_id = '00000000-0000-4000-9000-0000000000b1'$$) = 0, 'outsider cannot edit claimed business locations');
select tests.ok((select count(*) from public.business_members) = 0, 'outsider cannot see business teams');

select tests.logout();
rollback;
