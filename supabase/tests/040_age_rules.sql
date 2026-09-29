-- Age rules: VYBR8 is 13+; alcohol content, drink perks and Liquid Lovers are 21+.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a2'::uuid as jaja,     -- adult, admin
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,   -- adult Liquid Lover
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,      -- adult
  '00000000-0000-4000-8000-0000000000a7'::uuid as kay,      -- 16
  '00000000-0000-4000-9300-0000000000e3'::uuid as martini,  -- alcoholic pour, public
  '00000000-0000-4000-9300-0000000000e1'::uuid as wings;    -- plate, public
grant select on ids to anon, authenticated, service_role;

-- ── Sign-up ───────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000c1', 'teen@demo.vybr8.test',
  jsonb_build_object('username', 'teen_ok', 'birthdate', (current_date - interval '15 years')::date));
select tests.ok((select count(*) from public.profiles where username = 'teen_ok') = 1, '15-year-olds can join VYBR8');

-- ── Alcohol posts are hidden from under-21 and signed-out visitors ───
select tests.anon();
select tests.ok((select count(*) from public.posts where id = (select martini from ids)) = 0, 'signed-out visitors do not see cocktail posts');
select tests.ok((select count(*) from public.posts where id = (select wings from ids)) = 1, 'signed-out visitors still see food posts');
select tests.ok((select count(*) from public.post_media where post_id = (select martini from ids)) = 0, 'cocktail photos are hidden too');

select tests.logout(); select tests.login((select kay from ids));
select tests.ok(not private.viewer_is_21_plus(), 'a 16-year-old is not 21+');
select tests.ok((select count(*) from public.posts where is_alcoholic) = 0, 'under-21 members see no alcohol posts');
select tests.ok((select count(*) from public.posts where id = (select wings from ids)) = 1, 'under-21 members see food posts');
select tests.fails($$insert into public.post_vybes (post_id) values ('00000000-0000-4000-9300-0000000000e3')$$, 'under-21 members cannot vybe cocktail posts');
select tests.fails($$insert into public.post_comments (post_id, body) values ('00000000-0000-4000-9300-0000000000e3', 'yum')$$, 'under-21 members cannot comment on cocktail posts');

select tests.ok(tests.affected($$insert into public.posts (id, kind, item_name) values ('00000000-0000-4000-9300-0000000000f7', 'plate', 'Smash burger')$$) = 1, 'under-21 members post plates');
select tests.ok(tests.affected($$insert into public.posts (kind, item_name) values ('pour', 'Mango smoothie')$$) = 1, 'under-21 members post non-alcoholic drinks');
select tests.fails($$insert into public.posts (kind, item_name, is_alcoholic) values ('pour', 'Margarita', true)$$, 'under-21 members cannot post alcohol');
select tests.fails($$update public.posts set is_alcoholic = true where item_name = 'Mango smoothie'$$, 'under-21 members cannot flag a post as alcohol later');

select tests.fails($$insert into public.creator_applications (creator_type, pitch, is_21_plus_attested, links) values ('liquid_lover', 'I love cocktails and want to share them with everyone.', true, '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$, 'under-21 members cannot become Liquid Lovers, even by ticking the box');
select tests.ok(tests.affected($$insert into public.creator_applications (creator_type, pitch, links) values ('big_back', 'Burgers and wings after school, honest ratings every week.', '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$) = 1, 'under-21 members can apply as Big Backs');

select tests.ok((select count(*) from public.birthday_perks where is_alcoholic) = 0, 'under-21 members see no drink birthday perks');
select tests.ok((select count(*) from public.birthday_perks) >= 3, 'under-21 members still see food and discount perks');
select tests.fails($$insert into public.birthday_perks (business_id, title, perk_type, is_alcoholic) values ('00000000-0000-4000-9000-0000000000b2', 'Free shot', 'free_drink', true)$$, 'under-21 members cannot suggest drink perks');

-- ── Adults ────────────────────────────────────────────────────────────
select tests.logout(); select tests.login((select tia from ids));
select tests.ok(private.viewer_is_21_plus(), 'adult members are 21+');
select tests.ok((select count(*) from public.posts where id = (select martini from ids)) = 1, 'adults see cocktail posts');
select tests.ok(tests.affected($$insert into public.posts (kind, item_name, is_alcoholic) values ('pour', 'Old Fashioned', true)$$) = 1, 'adults post cocktails');
select tests.ok((select count(*) from public.birthday_perks where is_alcoholic) = 2, 'adults see drink birthday perks');
select tests.fails($$insert into public.posts (kind, is_alcoholic) values ('plate', true)$$, 'only drink posts can be marked as alcohol');

-- ── Team can't verify an under-21 Liquid Lover ────────────────────────
select tests.logout();
update public.creator_applications set status = 'withdrawn' where user_id = (select kay from ids) and creator_type = 'big_back';
insert into public.creator_applications (id, user_id, creator_type, pitch, is_21_plus_attested)
values ('00000000-0000-4000-9200-0000000000d9', (select kay from ids), 'both', 'Sneaky application written directly to the database.', true);
select tests.login((select jaja from ids));
select tests.fails($$select public.approve_creator_application('00000000-0000-4000-9200-0000000000d9')$$, 'the team cannot verify an under-21 Liquid Lover');

select tests.logout();
rollback;
