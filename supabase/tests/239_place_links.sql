-- Place links: menu, socials, delivery and reservations.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a2'::uuid as founder,
  '00000000-0000-4000-9000-0000000000b1'::uuid as b1;
grant select on ids to anon, authenticated, service_role;

select tests.anon();
select tests.fails($$select public.set_place_link((select b1 from ids), 'doordash', 'https://www.doordash.com/store/x-123')$$, 'sign in to add links');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(public.set_place_link((select b1 from ids), 'doordash', 'doordash.com/store/smoke-pit-123') = 'https://doordash.com/store/smoke-pit-123', 'anyone can add a real DoorDash link');
select tests.ok(public.set_place_link((select b1 from ids), 'instagram', '@smokepit') = 'https://www.instagram.com/smokepit', 'an Instagram handle becomes a link');
select tests.fails($$select public.set_place_link((select b1 from ids), 'doordash', 'https://doordash.scam.example/store')$$, 'only the real DoorDash domain');
select tests.fails($$select public.set_place_link((select b1 from ids), 'opentable', 'https://evil.example/?opentable.com')$$, 'no lookalike links');
select tests.fails($$select public.set_place_link((select b1 from ids), 'menu', 'https://example.com/menu')$$, 'only the business or the Team sets website/menu links');
select tests.fails($$insert into public.place_links (business_id, kind, url, source) values ((select b1 from ids), 'resy', 'https://resy.com/x', 'owner')$$, 'no writing links directly');
select tests.logout();

select tests.anon();
select tests.ok((select count(*) from public.place_links where business_id = (select b1 from ids)) = 2, 'everyone sees the links');
select tests.logout();

select tests.login((select founder from ids));
select public.set_place_link((select b1 from ids), 'doordash', 'https://www.doordash.com/store/smoke-pit-official-9');
select tests.ok((select source from public.place_links where business_id = (select b1 from ids) and kind = 'doordash') = 'team', 'the Team can correct a link');
select public.set_place_link((select b1 from ids), 'menu', 'https://example.com/menu');
select tests.ok(exists (select 1 from public.place_links where business_id = (select b1 from ids) and kind = 'menu'), 'the Team can add a menu link');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$select public.set_place_link((select b1 from ids), 'doordash', 'https://www.doordash.com/store/other-1')$$, 'community can''t overwrite a Team link');
select tests.fails($$select public.remove_place_link((select b1 from ids), 'menu')$$, 'community can''t remove Team links');
select public.remove_place_link((select b1 from ids), 'instagram');
select tests.ok(not exists (select 1 from public.place_links where business_id = (select b1 from ids) and kind = 'instagram'), 'people can take back their own link');
select tests.fails($$select public.import_place_links('[]'::jsonb)$$, 'only admins import links');
select tests.logout();

-- Import fills gaps only.
insert into public.place_external_ids (provider, external_id, business_id) values ('osm', 'node/999001', (select b1 from ids)) on conflict do nothing;
select tests.login((select founder from ids));
select tests.ok(public.import_place_links('[{"ext":"node/999001","links":{"instagram":"https://www.instagram.com/smokepit","doordash":"https://www.doordash.com/store/zzz","grubhub":"https://evil.example"}}]'::jsonb) = 1,
  'import adds missing links, skips existing ones and bad domains');
select tests.ok((select url from public.place_links where business_id = (select b1 from ids) and kind = 'doordash') like '%official%', 'import never overwrites');
select tests.logout();

rollback;
