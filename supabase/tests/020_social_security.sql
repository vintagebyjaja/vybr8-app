-- Social layer security tests: team, creators, follows, posts, photos, vybes, comments, reports.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,     -- founder + admin in seed
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,   -- verified Liquid Lover
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,      -- verified Big Back
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris,    -- friends-only profile, pending application
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,
  '00000000-0000-4000-9300-0000000000e1'::uuid as wings_post,
  '00000000-0000-4000-9300-0000000000e6'::uuid as chris_post,
  '00000000-0000-4000-9300-0000000000e7'::uuid as hidden_post,
  '00000000-0000-4000-9200-0000000000d3'::uuid as chris_app;
grant select on ids to anon, authenticated;

-- ── Team roster ───────────────────────────────────────────────────────
select tests.anon();
select tests.ok((select title from public.team_members where user_id = (select jaja from ids)) = 'Founder', 'anyone can see the founder on the team roster');
select tests.logout(); select tests.login((select tia from ids));
select tests.fails($$insert into public.team_members (user_id, title) values ('00000000-0000-4000-8000-0000000000a4', 'Founder')$$, 'users cannot add themselves to the team');

-- ── Creator verification ──────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.creator_profiles) = 2, 'verified creators are public');
select tests.ok((select count(*) from public.creator_applications) = 0, 'anon cannot read applications');

select tests.logout(); select tests.login((select owner from ids));
select tests.ok((select count(*) from public.creator_applications) = 0, 'users cannot read other people''s applications');
select tests.fails($$insert into public.creator_profiles (user_id, creator_type) values ('00000000-0000-4000-8000-0000000000a6', 'big_back')$$, 'users cannot self-verify');
select tests.fails($$insert into public.creator_applications (creator_type, pitch, links) values ('liquid_lover', 'I love cocktails and want to share them with everyone.', '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$, 'Liquid Lover applicants must confirm they are 21+');
select tests.ok(tests.affected($$insert into public.creator_applications (creator_type, pitch, is_21_plus_attested, links) values ('liquid_lover', 'I love cocktails and want to share them with everyone.', true, '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$) = 1, 'user applies to be a Liquid Lover');
select tests.fails($$insert into public.creator_applications (creator_type, pitch, links) values ('big_back', 'A second pending application should be refused.', '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$, 'only one pending application at a time');
select tests.fails($$update public.creator_applications set status = 'approved' where user_id = '00000000-0000-4000-8000-0000000000a6'$$, 'applicants cannot approve themselves');
select tests.fails($$select public.approve_creator_application('00000000-0000-4000-9200-0000000000d3')$$, 'non-team users cannot verify creators');

select tests.logout(); select tests.login((select tia from ids));
select tests.fails($$insert into public.creator_applications (creator_type, pitch, links) values ('big_back', 'Already verified, applying again should fail.', '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$, 'verified creators cannot re-apply');

select tests.logout(); select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.creator_applications where status = 'pending') = 2, 'founder sees the verification queue');
select tests.logout(); select tests.login((select admin from ids));
select tests.fails($$select public.approve_creator_application('00000000-0000-4000-9200-0000000000d3')$$, 'the team must confirm social proof before approving');
select public.confirm_creator_proof((select chris_app from ids));
select tests.ok((select proof_confirmed_by from public.creator_applications where id = (select chris_app from ids)) = (select admin from ids), 'team confirms the proof code');
select tests.logout(); select tests.login((select jaja from ids));
select public.approve_creator_application((select chris_app from ids), 'Great sample posts (demo)');
select tests.ok(private.is_verified_creator((select chris from ids)), 'founder verifies a creator');
select tests.ok((select count(*) from public.audit_logs where action = 'creator.verified') = 1, 'verification is audited');
select tests.fails($$select public.reject_creator_application((select id from public.creator_applications where user_id = '00000000-0000-4000-8000-0000000000a6' and status = 'pending'), '')$$, 'rejection needs a reason');
select public.set_creator_status((select marcus from ids), 'suspended', 'Test suspension (demo)');
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.creator_profiles where user_id = (select marcus from ids)) = 0, 'suspended creators lose their public badge');
select tests.logout(); select tests.login((select jaja from ids));
select public.set_creator_status((select marcus from ids), 'verified', null);

-- ── Follows ───────────────────────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a3')$$) = 1, 'user follows a creator');
select tests.fails($$insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a5')$$, 'cannot follow a profile you cannot see');
select tests.fails($$insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4')$$, 'cannot create follows for someone else');
select tests.ok(tests.affected($$delete from public.follows where follower_id = '00000000-0000-4000-8000-0000000000a2'$$) = 0, 'cannot remove other people''s follows');

-- ── Posts: visibility ─────────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.posts where id = (select wings_post from ids)) = 1, 'anon sees public posts');
select tests.ok((select count(*) from public.posts where id = (select chris_post from ids)) = 0, 'anon cannot see friends-only posts');
select tests.ok((select count(*) from public.posts where id = (select hidden_post from ids)) = 0, 'moderated posts are hidden from the public');
select tests.ok((select count(*) from public.post_media where post_id = (select chris_post from ids)) = 0, 'photos follow post visibility');
select tests.ok((select vybe_count from public.post_stats where post_id = (select wings_post from ids)) = 2, 'vybe counts are visible');

select tests.logout(); select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.posts where id = (select chris_post from ids)) = 0, 'non-friends cannot see friends-only posts');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.posts where id = (select hidden_post from ids)) = 1, 'authors still see their own moderated posts');

-- Check the friendship path, not the staff path: temporarily drop Jaja's admin role.
select tests.logout();
delete from public.user_roles where user_id = (select jaja from ids);
select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.posts where id = (select chris_post from ids)) = 1, 'friends see friends-only posts');
select tests.logout();
insert into public.user_roles (user_id, role) values ((select jaja from ids), 'admin');

-- ── Posts: writing ────────────────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.posts (id, kind, business_id, item_name, caption, rating) values ('00000000-0000-4000-9300-0000000000f1', 'plate', '00000000-0000-4000-9000-0000000000b1', 'Brisket', 'Test post', 8.0)$$) = 1, 'user posts a plate');
select tests.fails($$insert into public.posts (author_id, kind) values ('00000000-0000-4000-8000-0000000000a4', 'plate')$$, 'cannot post as someone else');
select tests.fails($$insert into public.posts (kind, is_demo) values ('plate', true)$$, 'users cannot create demo posts');
select tests.fails($$insert into public.posts (kind, business_id) values ('plate', '00000000-0000-4000-9000-0000000000b7')$$, 'cannot tag a business that is not public');
select tests.fails($$insert into public.posts (kind, rating) values ('pour', 11)$$, 'ratings stay between 0 and 10');
select tests.ok(tests.affected($$insert into public.post_media (post_id, storage_path, position) values ('00000000-0000-4000-9300-0000000000f1', '00000000-0000-4000-8000-0000000000a6/abc.jpg', 0)$$) = 1, 'author attaches a photo from own folder');
select tests.fails($$insert into public.post_media (post_id, storage_path, position) values ('00000000-0000-4000-9300-0000000000f1', '00000000-0000-4000-8000-0000000000a4/stolen.jpg', 1)$$, 'cannot attach someone else''s upload');
select tests.fails($$insert into public.post_media (post_id, storage_path, position) values ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-8000-0000000000a6/x.jpg', 5)$$, 'cannot add photos to someone else''s post');
select tests.ok(tests.affected($$update public.posts set caption = 'Edited' where id = '00000000-0000-4000-9300-0000000000f1'$$) = 1, 'author edits caption');
select tests.ok(tests.affected($$update public.posts set caption = 'hacked' where id = '00000000-0000-4000-9300-0000000000e1'$$) = 0, 'cannot edit someone else''s post');
select tests.ok(tests.affected($$update public.posts set deleted_at = now() where id = '00000000-0000-4000-9300-0000000000f1'$$) = 1, 'author deletes own post');
select tests.fails($$update public.posts set deleted_at = null where id = '00000000-0000-4000-9300-0000000000f1'$$, 'deleted posts cannot be restored by the author');

select tests.logout(); select tests.login((select tia from ids));
select tests.fails($$update public.posts set status = 'published' where id = '00000000-0000-4000-9300-0000000000e7'$$, 'authors cannot un-hide moderated posts');
select tests.fails($$select public.moderate_post('00000000-0000-4000-9300-0000000000e7', 'published', 'nope')$$, 'non-team users cannot moderate');

-- ── Vybes, comments, reports ──────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.post_vybes (post_id) values ('00000000-0000-4000-9300-0000000000e1')$$) = 1, 'user vybes a post');
select tests.fails($$insert into public.post_vybes (post_id, user_id) values ('00000000-0000-4000-9300-0000000000e3', '00000000-0000-4000-8000-0000000000a4')$$, 'cannot vybe on someone else''s behalf');
select tests.fails($$insert into public.post_vybes (post_id) values ('00000000-0000-4000-9300-0000000000e6')$$, 'cannot vybe a post you cannot see');
select tests.ok(tests.affected($$insert into public.post_comments (post_id, body) values ('00000000-0000-4000-9300-0000000000e1', 'Need these now')$$) = 1, 'user comments on a visible post');
select tests.fails($$insert into public.post_comments (post_id, body) values ('00000000-0000-4000-9300-0000000000e6', 'sneaky')$$, 'cannot comment on a post you cannot see');
select tests.fails($$update public.post_comments set status = 'hidden' where author_id = '00000000-0000-4000-8000-0000000000a6'$$, 'commenters cannot change moderation status');
select tests.ok(tests.affected($$update public.post_comments set body = 'hacked' where author_id = '00000000-0000-4000-8000-0000000000a2'$$) = 0, 'cannot edit other people''s comments');
select tests.ok(tests.affected($$insert into public.reports (target_type, target_id, reason) values ('post', '00000000-0000-4000-9300-0000000000e4', 'misleading')$$) = 1, 'user reports a post');
select tests.fails($$insert into public.reports (target_type, target_id, reason, status) values ('post', '00000000-0000-4000-9300-0000000000e3', 'spam', 'dismissed')$$, 'reporters cannot pre-resolve reports');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.reports) = 0, 'users cannot read other people''s reports');

select tests.logout(); select tests.login((select jaja from ids));
select public.moderate_post('00000000-0000-4000-9300-0000000000e4', 'hidden', 'Reported as misleading (demo)');
select tests.ok((select status = 'actioned' from public.reports where target_id = '00000000-0000-4000-9300-0000000000e4'), 'moderating a post closes its reports');
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.posts where id = '00000000-0000-4000-9300-0000000000e4') = 0, 'moderated post disappears for everyone');

-- ── Photo storage ─────────────────────────────────────────────────────
select tests.logout();
insert into storage.objects (bucket_id, name, owner) values
  ('post-media', '00000000-0000-4000-8000-0000000000a5/fish.jpg', '00000000-0000-4000-8000-0000000000a5'),
  ('post-media', '00000000-0000-4000-8000-0000000000a4/wings.jpg', '00000000-0000-4000-8000-0000000000a4');
update public.post_media set storage_path = '00000000-0000-4000-8000-0000000000a5/fish.jpg' where post_id = '00000000-0000-4000-9300-0000000000e6';
update public.post_media set storage_path = '00000000-0000-4000-8000-0000000000a4/wings.jpg' where post_id = '00000000-0000-4000-9300-0000000000e1';

select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into storage.objects (bucket_id, name) values ('post-media', '00000000-0000-4000-8000-0000000000a6/new.jpg')$$) = 1, 'user uploads to own folder');
select tests.fails($$insert into storage.objects (bucket_id, name) values ('post-media', '00000000-0000-4000-8000-0000000000a4/fake.jpg')$$, 'cannot upload into someone else''s folder');
select tests.ok((select count(*) from storage.objects where name like '%wings.jpg') = 1, 'photos of public posts are readable');
select tests.ok((select count(*) from storage.objects where name like '%fish.jpg') = 0, 'photos of friends-only posts are private');
select tests.ok(tests.affected($$delete from storage.objects where name like '%wings.jpg'$$) = 0, 'cannot delete someone else''s photos');

select tests.logout();
rollback;
