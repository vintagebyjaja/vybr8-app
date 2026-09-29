-- 21st-birthday early access: Pours unlock 5 days before the 21st birthday.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'soon@demo.vybr8.test',
   jsonb_build_object('username', 'turns21_soon', 'birthdate', (current_date - interval '21 years' + interval '5 days')::date)),
  ('00000000-0000-4000-8000-0000000000d2', 'later@demo.vybr8.test',
   jsonb_build_object('username', 'turns21_later', 'birthdate', (current_date - interval '21 years' + interval '6 days')::date));

-- 5 days before the 21st birthday
select tests.login('00000000-0000-4000-8000-0000000000d1');
select tests.ok(not private.viewer_is_21_plus(), 'still not 21 five days before the birthday');
select tests.ok(private.viewer_has_pour_access(), 'Pours unlock five days before the 21st birthday');
select tests.ok((select count(*) from public.posts where id = '00000000-0000-4000-9300-0000000000e3') = 1, 'can see cocktail posts to plan a 21st');
select tests.ok(tests.affected($$insert into public.post_comments (post_id, body) values ('00000000-0000-4000-9300-0000000000e3', 'Going here for my 21st!')$$) = 1, 'can comment on cocktail posts');
select tests.ok(tests.affected($$insert into public.post_vybes (post_id) values ('00000000-0000-4000-9300-0000000000e3')$$) = 1, 'can vybe cocktail posts');
select tests.ok(tests.affected($$insert into public.posts (kind, item_name, is_alcoholic) values ('pour', 'Birthday margarita', true)$$) = 1, 'can post a pour review');
select tests.ok((select count(*) from public.birthday_perks where is_alcoholic) > 0, 'can see drink birthday perks');
select tests.fails($$insert into public.creator_applications (creator_type, pitch, is_21_plus_attested, links) values ('liquid_lover', 'Cocktail reviews every weekend, honest and detailed.', true, '[{"platform":"Instagram","url":"https://instagram.com/example"}]')$$, 'cannot become a Liquid Lover until actually 21');
select tests.fails($$insert into public.linkups (title, city_slug, meet_point, starts_at, ends_at, capacity, is_alcoholic) values ('Bar hop', 'charlotte', 'Downtown', now() + interval '1 day', now() + interval '1 day 3 hours', 4, true)$$, 'cannot host a drinks Link Up until actually 21');
select tests.logout();

-- 6 days before
select tests.login('00000000-0000-4000-8000-0000000000d2');
select tests.ok(not private.viewer_has_pour_access(), 'Pours stay locked six days before');
select tests.ok((select count(*) from public.posts where is_alcoholic) = 0, 'no cocktail posts six days before');
select tests.fails($$insert into public.post_comments (post_id, body) values ('00000000-0000-4000-9300-0000000000e3', 'yum')$$, 'cannot comment six days before');
select tests.fails($$insert into public.posts (kind, item_name, is_alcoholic) values ('pour', 'Margarita', true)$$, 'cannot post alcohol six days before');
select tests.ok((select count(*) from public.businesses where kind in ('bar', 'cocktail_lounge')) > 0, 'bars themselves are visible to everyone');
select tests.logout();

rollback;
