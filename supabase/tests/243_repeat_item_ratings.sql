-- Rating a dish again on another visit.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-9500-000000000002'::uuid as fries;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
delete from public.item_ratings where user_id = (select marcus from ids) and menu_item_id = (select fries from ids);
insert into public.item_ratings (menu_item_id, user_id, score) values ((select fries from ids), (select marcus from ids), 7);
select tests.fails($$insert into public.item_ratings (menu_item_id, user_id, score) values ((select fries from ids), (select marcus from ids), 9)$$, 'one rating per dish per day');
select tests.fails($$insert into public.item_ratings (menu_item_id, user_id, score, rated_on) values ((select fries from ids), (select marcus from ids), 9, current_date - 30)$$, 'no backdating a rating to stack the charts');
select tests.logout();

-- An earlier visit (as if made last week).
alter table public.item_ratings disable trigger item_ratings_day;
insert into public.item_ratings (menu_item_id, user_id, score, rated_on) values ((select fries from ids), (select marcus from ids), 9, current_date - 7);
alter table public.item_ratings enable trigger item_ratings_day;

select tests.login((select marcus from ids));
select tests.ok((select count(*) from public.item_ratings where user_id = (select marcus from ids) and menu_item_id = (select fries from ids)) = 2, 'each visit is its own rating');
update public.item_ratings set score = 8, rated_on = current_date - 100 where user_id = (select marcus from ids) and menu_item_id = (select fries from ids)
  and rated_on = (now() at time zone 'America/New_York')::date;
select tests.ok(not exists (select 1 from public.item_ratings where user_id = (select marcus from ids) and rated_on = current_date - 100), 'changing a rating can''t move its day');
select tests.logout();

select tests.ok((select rating_count from public.menu_item_stats where menu_item_id = (select fries from ids))
  = (select count(*) from public.item_ratings where menu_item_id = (select fries from ids) and status = 'published'), 'every rating counts toward the score');

rollback;
