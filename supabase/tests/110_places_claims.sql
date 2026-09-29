-- Places: community submissions, franchise locations, claims and the VYBR8 Approved badge; chef profile claims.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a4'::uuid as tia,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;
create temp table r (k text primary key, v jsonb);
grant all on r to anon, authenticated, service_role;

-- ── Helpers ───────────────────────────────────────────────────────────
select tests.ok(private.norm_address('1200 South Boulevard, Suite 4') = private.norm_address('1200 south blvd'), 'addresses match however they are typed');
select tests.ok(private.norm_address('1200 South Blvd') <> private.norm_address('4400 Sharon Rd'), 'different streets are different places');
select tests.ok(private.street_name('1200 South Blvd') = 'South Blvd', 'branch name comes from the street');
select tests.ok(private.norm_name('The Ember & Oak!') = 'emberoak', 'names compare without punctuation');

-- ── Anyone can add a place; it waits for review ───────────────────────
select tests.anon();
select tests.fails($$select public.submit_place('Chick-fil-A', 'restaurant', 'charlotte', '1200 South Blvd')$$, 'signed-out visitors cannot add places');
select tests.logout();

select tests.login((select marcus from ids));
insert into r select 'a', public.submit_place('Chick-fil-A', 'restaurant', 'charlotte', '1200 South Blvd', null, '28203', 35.2101, -80.8601);
select tests.ok((select v->>'status' from r where k = 'a') = 'created', 'a member adds a place');
select tests.ok((select status from public.businesses where slug = (select v->>'slug' from r where k = 'a')) = 'pending', 'it waits for the VYBR8 Team');
select tests.ok((select source from public.businesses where slug = (select v->>'slug' from r where k = 'a')) = 'community', 'marked as added by the community');
select tests.ok((select branch_name from public.businesses where slug = (select v->>'slug' from r where k = 'a')) = 'South Blvd', 'branch named after the street');
select tests.ok((select v->>'slug' from r where k = 'a') = 'chick-fil-a-south-blvd-charlotte', 'slug includes the branch and city');

insert into r select 'dup', public.submit_place('chick fil a', 'restaurant', 'charlotte', '1200 South Boulevard');
select tests.ok((select v->>'status' from r where k = 'dup') = 'duplicate', 'same name at the same address is caught as a duplicate');
insert into r select 'dup2', public.submit_place('Chick-fil-A', 'restaurant', 'charlotte', '1210 South Blvd', null, null, 35.2102, -80.8602);
select tests.ok((select v->>'status' from r where k = 'dup2') = 'duplicate', 'same name within 150 m is a duplicate too');

insert into r select 'b', public.submit_place('Chick-fil-A', 'restaurant', 'charlotte', '4400 Sharon Rd');
select tests.ok((select v->>'status' from r where k = 'b') = 'created', 'the same franchise at another address is its own location');
select tests.ok((select branch_name from public.businesses where slug = (select v->>'slug' from r where k = 'b')) = 'Sharon Rd', 'told apart by its street');

select tests.fails($$select public.submit_place('Somewhere', 'restaurant', 'charlotte', 'Main Street')$$, 'a street address with a number is required');
select tests.fails($$select public.submit_place('Somewhere', 'restaurant', 'charlotte', '1 Main St', null, null, 40.7, -74.0)$$, 'a pin outside the city is refused');
select tests.fails($$select public.submit_place('Taco Truck', 'food_truck', 'charlotte', '1 Main St')$$, 'food trucks use their own flow');
select tests.ok(tests.affected($$update public.businesses set status = 'active' where slug = 'chick-fil-a-south-blvd-charlotte'$$) = 0, 'submitters cannot publish their own place');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.businesses where slug like 'chick-fil-a-%') = 0, 'pending places are hidden from everyone else');
select tests.fails($$select public.start_business_claim((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Owner', 'business_email', 'o@cfa.com')$$, 'no one else can claim a place that is not live');
select tests.fails($$select public.review_place((select id from public.businesses where slug = 'velvet-hour'), true)$$, 'members cannot review places');
select tests.logout();

-- ── The team reviews and links franchise locations ───────────────────
select tests.login((select admin from ids));
select public.review_place((select id from public.businesses where slug = 'chick-fil-a-sharon-rd-charlotte'), true);
select tests.ok((select status from public.businesses where slug = 'chick-fil-a-sharon-rd-charlotte') = 'active', 'the team approves a place');
select public.set_place_brand((select id from public.businesses where slug = 'chick-fil-a-sharon-rd-charlotte'), 'Chick-fil-A');
select public.set_place_brand((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Chick-fil-A');
select tests.ok((select count(distinct brand_id) = 1 and count(*) = 2 from public.businesses where slug like 'chick-fil-a-%' and brand_id is not null), 'both locations share one brand');
select tests.logout();
select tests.ok((select count(*) from public.notifications where kind = 'place.reviewed' and user_id = (select marcus from ids)) = 1, 'the person who added it hears it went live');

select tests.login((select tia from ids));
insert into r select 'c', public.submit_place('Chick-fil-A', 'restaurant', 'atlanta', '100 Peachtree St');
select tests.ok((select brand_id is not null from public.businesses where slug = (select v->>'slug' from r where k = 'c')), 'a new location of a known brand joins it automatically');
select tests.logout();

-- ── Claims ────────────────────────────────────────────────────────────
select tests.login((select marcus from ids));
select tests.fails($$select public.start_business_claim((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Owner', 'document')$$, 'document proof needs an upload');
select tests.fails($$select public.start_business_claim((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Owner', 'document', null, null, '00000000-0000-4000-8000-0000000000a5/license.pdf')$$, 'cannot use someone else''s upload');
insert into r select 'claim', public.start_business_claim((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Owner', 'business_phone', null, '704-555-0100');
select tests.ok((select v->>'code' from r where k = 'claim') ~ '^VYBR8-[0-9A-F]{6}$', 'the claimant gets a proof code');
select tests.fails($$select public.start_business_claim((select id from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'Owner', 'business_phone', null, '704-555-0100')$$, 'one waiting claim per place');
select tests.ok((select count(*) from public.business_claims where claimant_id = (select marcus from ids)) = 1, 'claimants see their own claim');
select tests.fails($$select public.approve_business_claim((select id from public.business_claims where claimant_id = '00000000-0000-4000-8000-0000000000a3'))$$, 'claimants cannot approve themselves');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.business_claims where claimant_id = (select marcus from ids)) = 0, 'claims are private');
select tests.logout();

select tests.login((select admin from ids));
select public.approve_business_claim((select id from public.business_claims where claimant_id = (select marcus from ids)), 'Called the store');
select tests.ok((select is_claimed and approved_at is not null and status = 'active' from public.businesses where slug = 'chick-fil-a-south-blvd-charlotte'), 'approved claim: live, claimed and VYBR8 Approved');
select tests.ok((select role = 'owner' from public.business_members m join public.businesses b on b.id = m.business_id where b.slug = 'chick-fil-a-south-blvd-charlotte' and m.user_id = (select marcus from ids)), 'the claimant becomes the owner');
select tests.ok((select not is_claimed from public.businesses where slug = 'chick-fil-a-sharon-rd-charlotte'), 'other franchise locations stay separate');
select tests.logout();

select tests.login((select marcus from ids));
select tests.fails($$update public.businesses set approved_at = null where slug = 'chick-fil-a-south-blvd-charlotte'$$, 'owners cannot touch the badge');
select tests.fails($$update public.businesses set brand_id = null where slug = 'chick-fil-a-south-blvd-charlotte'$$, 'or the brand link');
select tests.ok(tests.affected($$update public.businesses set description = 'Chicken sandwiches' where slug = 'chick-fil-a-south-blvd-charlotte'$$) = 1, 'owners edit their place');
select tests.logout();

-- ── Chef profile claims ───────────────────────────────────────────────
insert into public.chef_profiles (id, slug, professional_name, city_slug) values ('00000000-0000-4000-9600-0000000000c1', 'chef-nia-test', 'Chef Nia (test)', 'charlotte');

select tests.login((select tia from ids));
select tests.fails($$select public.start_chef_claim('00000000-0000-4000-9600-0000000000c1', 'social')$$, 'social proof needs a link');
insert into r select 'chef', public.start_chef_claim('00000000-0000-4000-9600-0000000000c1', 'social', 'https://instagram.com/chefnia');
select tests.ok((select v->>'code' from r where k = 'chef') like 'VYBR8-%', 'the chef gets a proof code for their bio');
select tests.ok(tests.affected($$update public.chef_profiles set bio = 'mine' where id = '00000000-0000-4000-9600-0000000000c1'$$) = 0, 'a waiting claim gives no edit rights');
select tests.fails($$insert into public.chef_claims (chef_id, proof_method, proof_code) values ('00000000-0000-4000-9600-0000000000c1', 'social', 'X')$$, 'claims only go through the claim flow');
select tests.logout();

select tests.login((select admin from ids));
select public.decide_chef_claim((select id from public.chef_claims where chef_id = '00000000-0000-4000-9600-0000000000c1'), true, 'Code in bio');
select tests.ok((select user_id = (select tia from ids) and verification = 'verified' from public.chef_profiles where id = '00000000-0000-4000-9600-0000000000c1'), 'approved: the chef owns and is verified on the profile');
select tests.logout();

select tests.login((select chris from ids));
select tests.fails($$select public.start_chef_claim('00000000-0000-4000-9600-0000000000c1', 'social', 'https://instagram.com/fake')$$, 'an owned profile cannot be claimed again');
select tests.logout();

rollback;
