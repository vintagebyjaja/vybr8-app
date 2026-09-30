-- Changing your @username.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a2'::uuid as founder;
grant select on ids to anon, authenticated, service_role;
create temp table names as select
  (select username::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a3') as marcus_old,
  (select username::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a4') as tia_name;
grant select on names to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.fails($$update public.profiles set username = 'sneaky_name' where id = (select marcus from ids)$$, 'no changing it behind the rules');
select tests.fails($$select public.change_username((select tia_name from names))$$, 'taken names are blocked (any capitals)');
select tests.fails($$select public.change_username('vybr8_official')$$, 'reserved names are blocked');
select tests.fails($$select public.change_username('ab')$$, 'too short');
select tests.fails($$select public.change_username('.dots')$$, 'no leading period');
select tests.ok(public.change_username('@BigBackMarcus') = 'BigBackMarcus', 'change it (the @ is optional)');
select tests.ok((select username::text from public.profiles where id = (select marcus from ids)) = 'BigBackMarcus', 'saved with their capitals');
select tests.ok(public.username_redirect((select marcus_old from names)) = 'BigBackMarcus', 'old profile links forward to the new @');
select tests.fails($$select public.change_username('marcus_again')$$, 'once every 30 days');
select tests.ok(public.change_username('bigbackmarcus') = 'bigbackmarcus', 'but fixing capitals is always fine');
select tests.logout();

select tests.login((select tia from ids));
select tests.fails($$select public.change_username((select marcus_old from names))$$, 'nobody grabs someone''s old @ right away');
select tests.logout();

select tests.login((select founder from ids));
select tests.ok(public.change_username('vybr8jaja') = 'vybr8jaja', 'the VYBR8 Team can use VYBR8 names');
select tests.logout();

rollback;
