-- Birthdays, 21+ gate, notifications, Birthday Perks.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,    -- founder/admin, birthday Oct 5
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,  -- birthday Dec 20
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,     -- birthday Feb 29
  '00000000-0000-4000-8000-0000000000a6'::uuid as owner,
  '00000000-0000-4000-9000-0000000000b1'::uuid as ember,
  '00000000-0000-4000-9000-0000000000b2'::uuid as velvet;
grant select on ids to anon, authenticated, service_role;

-- ── 13+ at sign-up ────────────────────────────────────────────────────
select tests.fails($$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'teen@demo.vybr8.test',
  jsonb_build_object('username', 'too_young', 'birthdate', (current_date - interval '12 years')::date))$$, 'under-13 sign-ups are refused');
select tests.ok((select count(*) from public.profiles where username = 'too_young') = 0, 'no profile is created for an under-13 sign-up');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000b0', 'adult@demo.vybr8.test',
  jsonb_build_object('username', 'just_13', 'birthdate', (current_date - interval '13 years')::date));
select tests.ok((select count(*) from public.user_birthdays where user_id = '00000000-0000-4000-8000-0000000000b0') = 1, 'turning 13 today is allowed and the birthday is saved');
select tests.fails($$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'bad@demo.vybr8.test', '{"birthdate":"not-a-date"}')$$, 'invalid birthdates are refused');
select tests.ok((select count(*) from public.user_birthdays) = 8, 'seed users have birthdays');

-- ── Birthday privacy ──────────────────────────────────────────────────
select tests.anon();
select tests.ok((select count(*) from public.user_birthdays) = 0, 'anon cannot read birthdays');
select tests.logout(); select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.user_birthdays) = 1, 'users read only their own birthday');
select tests.fails($$update public.user_birthdays set birthdate = '1991-10-01' where user_id = '00000000-0000-4000-8000-0000000000a3'$$, 'users cannot change their birthday after sign-up');
select tests.ok(tests.affected($$update public.user_birthdays set birthdate = '1990-01-01' where user_id = '00000000-0000-4000-8000-0000000000a2'$$) = 0, 'users cannot edit someone else''s birthday');

-- A user without a birthday (future social login) sets it once, and must be 13+.
select tests.logout();
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000b9', 'oauth@demo.vybr8.test');
select tests.login('00000000-0000-4000-8000-0000000000b9');
select tests.fails($$insert into public.user_birthdays (user_id, birthdate) values ('00000000-0000-4000-8000-0000000000b9', current_date - interval '12 years')$$, 'confirming a birthday still requires 13+');
select tests.ok(tests.affected($$insert into public.user_birthdays (user_id, birthdate) values ('00000000-0000-4000-8000-0000000000b9', '1995-06-01')$$) = 1, 'user confirms birthday once');
select tests.fails($$insert into public.user_birthdays (user_id, birthdate) values ('00000000-0000-4000-8000-0000000000a3', '1995-06-01')$$, 'cannot set a birthday for someone else');

-- ── Leap-day birthdays ────────────────────────────────────────────────
select tests.ok(private.next_birthday('1996-02-29', '2027-02-01') = '2027-02-28', 'Feb 29 birthdays land on Feb 28 in non-leap years');
select tests.ok(private.next_birthday('1996-02-29', '2028-02-01') = '2028-02-29', 'Feb 29 birthdays stay on Feb 29 in leap years');
select tests.ok(private.next_birthday('1994-10-05', '2026-10-06') = '2027-10-05', 'next birthday rolls to next year once passed');

-- ── Birthday alerts ───────────────────────────────────────────────────
select tests.logout(); select tests.login((select jaja from ids));
select tests.fails($$select public.queue_birthday_notifications('2026-09-28')$$, 'users cannot trigger the alert job');
select tests.fails($$insert into public.notifications (user_id, kind, title) values ('00000000-0000-4000-8000-0000000000a2', 'birthday.today', 'fake')$$, 'users cannot create notifications');

select tests.logout();
-- Keep the job checks independent of today's real date: drop the users created above.
delete from public.user_birthdays where user_id in ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-0000000000a7');
set local role service_role;
select tests.ok(public.queue_birthday_notifications('2026-09-28') = 1, 'job sends the one-week-away alert (Jaja, Oct 5)');
select tests.ok(public.queue_birthday_notifications('2026-09-28') = 0, 'job is safe to run twice');
select tests.ok(public.queue_birthday_notifications('2026-10-05') = 1, 'job sends the happy-birthday alert on the day');
select tests.ok(public.queue_birthday_notifications('2027-02-28') = 1, 'leap-day birthday gets alerted on Feb 28');
reset role;

update public.user_settings set notification_prefs = '{"birthday": false}' where user_id = (select marcus from ids);
set local role service_role;
select tests.ok(public.queue_birthday_notifications('2026-12-20') = 0, 'users who turn birthday alerts off get none');
reset role;

select tests.login((select jaja from ids));
select tests.ok((select count(*) from public.notifications) = 2, 'user sees own birthday alerts');
select tests.ok((select link from public.notifications limit 1) = '/birthday', 'alerts link to Birthday Perks');
select tests.ok(tests.affected($$update public.notifications set read_at = now()$$) = 2, 'user marks alerts read');
select tests.fails($$update public.notifications set title = 'edited'$$, 'user cannot rewrite alerts');
select tests.logout(); select tests.login((select tia from ids));
select tests.ok((select count(*) from public.notifications where user_id = (select jaja from ids)) = 0, 'users cannot see other people''s alerts');

-- ── Birthday Perks ────────────────────────────────────────────────────
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.birthday_perks) = 3, 'active food and discount perks are public; drink perks and pending suggestions are not');

select tests.logout(); select tests.login((select tia from ids));
select tests.ok(tests.affected($$insert into public.birthday_perks (business_id, title, perk_type, status, source) values ('00000000-0000-4000-9000-0000000000b3', 'Free garlic knots', 'free_food', 'active', 'business')$$) = 1, 'anyone can suggest a perk');
select tests.ok((select status = 'pending' and source = 'community' from public.birthday_perks where title = 'Free garlic knots'), 'suggestions are forced to pending community tips');
select tests.fails($$insert into public.birthday_perks (business_id, title, perk_type) values ('00000000-0000-4000-9000-0000000000b7', 'Free fries', 'free_food')$$, 'cannot add perks for a place that is not public');
select tests.ok(tests.affected($$update public.birthday_perks set title = 'Free everything' where business_id = '00000000-0000-4000-9000-0000000000b1'$$) = 0, 'consumers cannot edit a business''s perks');
select tests.fails($$select public.review_birthday_perk((select id from public.birthday_perks where title = 'Free garlic knots'), true)$$, 'consumers cannot approve perks');

select tests.logout();
insert into public.business_members (business_id, user_id, role) values ((select ember from ids), (select owner from ids), 'owner');
select tests.login((select owner from ids));
select tests.ok(tests.affected($$insert into public.birthday_perks (business_id, title, perk_type, redeem_window) values ('00000000-0000-4000-9000-0000000000b1', 'Free cornbread skillet', 'free_food', 'month')$$) = 1, 'business owner publishes a perk');
select tests.ok((select status = 'active' and source = 'business' from public.birthday_perks where title = 'Free cornbread skillet'), 'business perks go live immediately');
select tests.ok(tests.affected($$update public.birthday_perks set status = 'expired' where title = 'Free Hot Honey Wings (6 pc)'$$) = 1, 'business owner expires their own perk');
select tests.fails($$update public.birthday_perks set source = 'vybr8' where title = 'Free cornbread skillet'$$, 'business cannot fake where a perk came from');
select tests.ok(tests.affected($$update public.birthday_perks set status = 'expired' where business_id = '00000000-0000-4000-9000-0000000000b2'$$) = 0, 'business cannot touch another place''s perks');

select tests.logout(); select tests.login((select jaja from ids));
select public.review_birthday_perk((select id from public.birthday_perks where title = 'Free garlic knots'), true);
select tests.logout(); select tests.anon();
select tests.ok((select count(*) from public.birthday_perks where title = 'Free garlic knots') = 1, 'approved community tips become public');

select tests.logout();
rollback;
