-- Vybe Map + Link Ups: visibility, spots, requests, guest invites, chat lifetime.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,    -- admin; friends with marcus, tia
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,   -- not friends with anyone
  '00000000-0000-4000-8000-0000000000a7'::uuid as kay,     -- 16
  '00000000-0000-4000-9400-0000000000f1'::uuid as girls,   -- public, request, 21+ (host tia)
  '00000000-0000-4000-9400-0000000000f2'::uuid as brunch,  -- friends-only, open (host jaja), marcus going
  '00000000-0000-4000-9400-0000000000f3'::uuid as fish;    -- public, open, 3 spots (host marcus)
grant select on ids to anon, authenticated, service_role;

-- Jaja is admin in the seed; test her as a regular host.
delete from public.user_roles where user_id = (select jaja from ids);

-- ── Cities and statuses ───────────────────────────────────────────────
select tests.anon();
select tests.ok((select count(*) from public.cities) = 11, 'the 11 launch cities are public');
select tests.ok((select count(*) from public.vybe_statuses) = 0, 'signed-out visitors see no one''s status');
select tests.logout(); select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.vybe_statuses) = 2, 'friends see each other''s vybe status');
select tests.logout(); select tests.login((select owner from ids));
select tests.ok((select count(*) from public.vybe_statuses) = 0, 'non-friends see no statuses');
select tests.ok(tests.affected($$insert into public.vybe_statuses (user_id, intent, city_slug, expires_at) values ('00000000-0000-4000-8000-0000000000a6', 'eat', 'atlanta', now() + interval '2 hours')$$) = 1, 'user sets own status');
select tests.fails($$insert into public.vybe_statuses (user_id, intent, city_slug, expires_at) values ('00000000-0000-4000-8000-0000000000a4', 'eat', 'atlanta', now() + interval '2 hours')$$, 'cannot set a status for someone else');
select tests.fails($$update public.vybe_statuses set expires_at = now() + interval '2 days' where user_id = '00000000-0000-4000-8000-0000000000a6'$$, 'statuses expire within 12 hours');
select tests.logout();
update public.vybe_statuses set created_at = now() - interval '5 hours', expires_at = now() - interval '1 hour' where user_id = (select tia from ids);
select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.vybe_statuses where user_id = (select tia from ids)) = 0, 'expired statuses disappear');

-- ── Link Up visibility ────────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.linkups) = 0, 'signed-out visitors do not see Link Ups (sign in first)');
select tests.logout(); select tests.login((select kay from ids));
select tests.ok((select count(*) from public.linkups where id = (select girls from ids)) = 0, 'under-21 members do not see drinks Link Ups');
select tests.ok((select count(*) from public.linkups where id = (select fish from ids)) = 0, 'under-18 members do not see public Link Ups (they bring strangers together)');
select tests.fails($$select public.join_linkup('00000000-0000-4000-9400-0000000000f3')$$, 'under-18 members cannot join public Link Ups');
select tests.logout(); select tests.login((select owner from ids));
select tests.ok((select count(*) from public.linkups where id = (select brunch from ids)) = 0, 'friends-only Link Ups are hidden from non-friends');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.linkups where id = (select brunch from ids)) = 1, 'friends see friends-only Link Ups');

select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.linkup_spots(array['00000000-0000-4000-9400-0000000000f1','00000000-0000-4000-9400-0000000000f3']::uuid[])) = 0, 'spot counts only for Link Ups the viewer can see');

-- ── Creating ──────────────────────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity) values ('Too big', 'atlanta', 'Downtown', now() + interval '1 day', now() + interval '1 day 2 hours', 11)$$, 'no more than 10 spots');
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity) values ('Solo', 'atlanta', 'Downtown', now() + interval '1 day', now() + interval '1 day 2 hours', 1)$$, 'at least 2 spots');
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity) values ('Yesterday', 'atlanta', 'Downtown', now() - interval '1 day', now() - interval '20 hours', 4)$$, 'cannot start in the past');
select tests.fails($$insert into public.linkups (host_id, title, city_slug, meet_point, starts_at, ends_at, capacity) values ('00000000-0000-4000-8000-0000000000a4', 'Fake host', 'atlanta', 'Downtown', now() + interval '1 day', now() + interval '1 day 2 hours', 4)$$, 'cannot host as someone else');
select tests.ok(tests.affected($$insert into public.linkups (id, title, occasion, city_slug, meet_point, starts_at, ends_at, capacity, is_alcoholic) values ('00000000-0000-4000-9400-0000000000f9', 'Rooftop drinks', 'drinks', 'atlanta', 'Ponce City Market', now() + interval '1 day', now() + interval '1 day 3 hours', 5, true)$$) = 1, 'adult creates a drinks Link Up with 5 spots');
select tests.ok((select status = 'going' and is_host from public.linkup_members where linkup_id = '00000000-0000-4000-9400-0000000000f9' and user_id = (select owner from ids)), 'host is added as the first member');
select tests.fails($$insert into public.linkup_members (linkup_id, user_id, status) values ('00000000-0000-4000-9400-0000000000f1', '00000000-0000-4000-8000-0000000000a6', 'going')$$, 'members cannot be added directly');
select tests.logout(); select tests.login((select kay from ids));
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity, is_alcoholic, visibility) values ('Drinks', 'atlanta', 'Downtown', now() + interval '1 day', now() + interval '1 day 2 hours', 4, true, 'friends')$$, 'under-21 members cannot host drinks Link Ups');
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity) values ('Mall meetup', 'atlanta', 'Downtown', now() + interval '1 day', now() + interval '1 day 2 hours', 4)$$, 'under-18 members cannot host public Link Ups');
select tests.ok(tests.affected($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity, visibility) values ('Study snacks', 'atlanta', 'Library cafe', now() + interval '1 day', now() + interval '1 day 2 hours', 4, 'friends')$$) = 1, 'under-18 members can host friends-only Link Ups');
select tests.logout(); select tests.login('00000000-0000-4000-8000-0000000000a1'::uuid);
update public.profiles set avatar_url = null where id = '00000000-0000-4000-8000-0000000000a1'::uuid;
select tests.fails($$select public.join_linkup('00000000-0000-4000-9400-0000000000f3')$$, 'you need a profile photo to join a Link Up');
update public.profiles set avatar_url = '/demo/avatars/admin.svg' where id = '00000000-0000-4000-8000-0000000000a1'::uuid;

-- ── Joining, requests and spots ───────────────────────────────────────
select tests.ok(public.join_linkup((select fish from ids)) = 'going', 'open Link Up: join straight away');
select tests.logout(); select tests.login((select owner from ids));
select tests.ok(public.join_linkup((select fish from ids)) = 'going', 'second person joins (3 of 3 spots)');
select tests.logout(); select tests.login((select tia from ids));
select tests.fails($$select public.join_linkup('00000000-0000-4000-9400-0000000000f3')$$, 'cannot join once all spots are taken');

select tests.logout(); select tests.login((select owner from ids));
select tests.ok(public.join_linkup((select girls from ids)) = 'requested', 'approval-required Link Up: joining sends a request');
select tests.fails($$select public.respond_to_request('00000000-0000-4000-9400-0000000000f1', '00000000-0000-4000-8000-0000000000a6', true)$$, 'only the host approves requests');
select tests.logout(); select tests.login((select kay from ids));
select tests.fails($$select public.join_linkup('00000000-0000-4000-9400-0000000000f1')$$, 'under-21 members cannot join drinks Link Ups');
select tests.logout(); select tests.login((select tia from ids));
select public.respond_to_request((select girls from ids), (select owner from ids), true);
select tests.ok((select status = 'going' from public.linkup_members where linkup_id = (select girls from ids) and user_id = (select owner from ids)), 'host approves a request');
select tests.fails($$update public.linkups set capacity = 1 where id = '00000000-0000-4000-9400-0000000000f1'$$, 'host cannot shrink spots below who is going');

-- Friend invites
select tests.logout(); select tests.login((select jaja from ids));
select tests.fails($$select public.invite_to_linkup('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a6')$$, 'can only invite friends (others get a guest link)');
select public.invite_to_linkup((select brunch from ids), (select tia from ids));
select tests.ok((select count(*) from public.notifications where user_id = (select tia from ids) and kind = 'linkup.invited') = 0, 'invite notifications are private to the invitee');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.notifications where kind = 'linkup.invited') = 1, 'invited friend gets an alert');
select tests.ok(public.join_linkup((select brunch from ids)) = 'going', 'invited friend accepts');

-- ── Group chat ────────────────────────────────────────────────────────
select tests.logout(); select tests.login((select owner from ids));
select tests.ok((select count(*) from public.linkup_messages where linkup_id = (select brunch from ids)) = 0, 'people outside the Link Up cannot read its chat');
select tests.fails($$insert into public.linkup_messages (linkup_id, user_id, body) values ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a6', 'hi')$$, 'people outside the Link Up cannot post in its chat');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.linkup_chat((select brunch from ids))) = 2, 'members read the chat');
select tests.ok(tests.affected($$insert into public.linkup_messages (linkup_id, user_id, body) values ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a4', 'Count me in')$$) = 1, 'members post in the chat');
select tests.fails($$insert into public.linkup_messages (linkup_id, user_id, body) values ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a3', 'impersonating')$$, 'cannot post as someone else');

-- ── Guest invites ─────────────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((public.guest_view_invite('demo-guest-token') ->> 'title') = 'Sunday brunch crew', 'guest link shows the Link Up details');
select tests.ok(public.guest_view_invite('wrong-token') is null, 'a wrong link shows nothing');
select tests.ok((select count(*) from public.guest_messages('demo-guest-token')) = 0, 'guests see the chat only after accepting');
select tests.fails($$select public.guest_send_message('demo-guest-token', 'hi')$$, 'guests cannot chat before accepting');
select tests.fails($$select public.guest_accept_invite('demo-guest-token', 'Aaliyah', (current_date - interval '12 years')::date)$$, 'guests must be 13+');
select tests.fails($$select public.guest_accept_invite('demo-guest-token', '', (current_date - interval '25 years')::date)$$, 'guests must give a name');
select public.guest_accept_invite('demo-guest-token', 'Aaliyah', (current_date - interval '25 years')::date);
select tests.ok((public.guest_view_invite('demo-guest-token') ->> 'invite_status') = 'accepted', 'guest accepts without an account');
select tests.ok((select count(*) from public.guest_messages('demo-guest-token')) = 3, 'guest joins the group chat');
select public.guest_send_message('demo-guest-token', 'Hey everyone, Aaliyah here!');
select tests.ok((select count(*) from public.guest_messages('demo-guest-token') where is_me and is_guest) = 1, 'guest posts in the chat');
select tests.ok((select count(*) from public.linkup_invites) = 0, 'anon cannot list invites');

select tests.logout(); select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.linkup_chat((select brunch from ids)) where is_guest) = 1, 'members see guest messages');
select tests.fails($$select public.create_guest_invite('00000000-0000-4000-9400-0000000000f2', 'x')$$, 'only the host creates guest links');
select tests.ok((select count(*) from public.linkup_invites) = 0, 'members cannot read guest invite records');

select tests.logout(); select tests.login((select tia from ids));
select tests.ok(length(public.create_guest_invite((select girls from ids), 'Bestie')) = 48, 'host creates a guest link');
select tests.ok((select count(*) from public.linkup_invites where token_hash ~ '^[0-9a-f]{64}$') = 1, 'only a hash of the link is stored');

-- Drinks Link Up guest must be 21+
select tests.logout();
insert into public.linkup_invites (linkup_id, created_by, token_hash) values ((select girls from ids), (select tia from ids), encode(sha256(convert_to('girls-token', 'UTF8')), 'hex'));
select tests.anon();
select tests.fails($$select public.guest_accept_invite('girls-token', 'Sam', (current_date - interval '19 years')::date)$$, 'guests must be 21+ for drinks Link Ups');

-- ── Chat disappears when the Link Up ends ─────────────────────────────
select tests.logout();
update public.linkups set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 minute' where id = (select brunch from ids);
select tests.login((select tia from ids));
select tests.ok((select count(*) from public.linkup_messages where linkup_id = (select brunch from ids)) = 0, 'chat is hidden as soon as the Link Up ends');
select tests.fails($$insert into public.linkup_messages (linkup_id, user_id, body) values ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-8000-0000000000a4', 'late')$$, 'no new messages after it ends');
select tests.logout(); select tests.anon();
select tests.fails($$select public.guest_send_message('demo-guest-token', 'late')$$, 'guests cannot post after it ends');
select tests.logout();
set local role service_role;
select tests.ok(public.purge_ended_linkup_chats() = 4, 'cleanup deletes the ended chat');
reset role;
select tests.ok((select count(*) from public.linkup_messages where linkup_id = (select brunch from ids)) = 0, 'ended chat is gone from the database');
select tests.ok((select guest_birthdate is null from public.linkup_invites where label = 'Aaliyah'), 'guest birthdates are cleared after the event');
select tests.login((select tia from ids));
select tests.fails($$select public.purge_ended_linkup_chats()$$, 'users cannot run the cleanup job');

select tests.logout();
rollback;
