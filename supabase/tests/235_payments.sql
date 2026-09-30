-- Stripe payments: only the webhook (service role) changes plans, and the plan follows Stripe's state.

begin;

create temp table ids as select '00000000-0000-4000-8000-0000000000a3'::uuid as marcus;
grant select on ids to anon, authenticated, service_role;

select tests.login((select marcus from ids));
select tests.fails($$select public.billing_apply_stripe_subscription((select marcus from ids), 'max', 'active', 'sub_Fake1', now() + interval '30 days')$$,
  'people can''t give themselves a paid plan');
select tests.ok((select (public.my_plan())->>'plan') = 'free', 'still on Free');
select tests.logout();

set local role service_role;
select public.billing_apply_stripe_subscription((select marcus from ids), 'plus', 'incomplete', 'sub_Test1', now() + interval '30 days');
reset role;
select tests.ok(not exists (select 1 from public.user_subscriptions where provider_ref = 'sub_Test1'), 'an unfinished checkout grants nothing');

set local role service_role;
select public.billing_apply_stripe_subscription((select marcus from ids), 'plus', 'active', 'sub_Test1', now() + interval '30 days');
select public.billing_apply_stripe_subscription((select marcus from ids), 'plus', 'active', 'sub_Test1', now() + interval '30 days');
select tests.fails($$select public.billing_apply_stripe_subscription((select marcus from ids), 'business_pro', 'active', 'sub_Test2', null)$$, 'only consumer plans');
select tests.fails($$select public.billing_apply_stripe_subscription((select marcus from ids), 'plus', 'active', 'not-a-sub', null)$$, 'real Stripe ids only');
reset role;
select tests.ok((select count(*) from public.user_subscriptions where provider_ref = 'sub_Test1') = 1, 'the same event twice makes one subscription');

select tests.login((select marcus from ids));
select tests.ok((select (public.my_plan())->>'plan') = 'plus', 'paid: on VYBR8+');
select tests.ok((select (public.my_billing())->>'stripe_plan') = 'plus', 'billing shows the Stripe plan');
select tests.ok((select count(*) from public.notifications where kind = 'billing.active') = 1, 'one welcome note, not two');
select tests.logout();

set local role service_role;
select public.billing_apply_stripe_subscription((select marcus from ids), 'max', 'active', 'sub_Test1', now() + interval '30 days');
reset role;
select tests.login((select marcus from ids));
select tests.ok((select (public.my_plan())->>'plan') = 'max', 'upgrade in the billing portal moves them to MAX');
select tests.logout();

set local role service_role;
select public.billing_apply_stripe_subscription((select marcus from ids), 'max', 'canceled', 'sub_Test1', now() - interval '1 day');
reset role;
select tests.login((select marcus from ids));
select tests.ok((select (public.my_plan())->>'plan') = 'free', 'canceled: back on Free');
select tests.ok((select (public.my_billing())->>'stripe_plan') is null, 'no active Stripe plan');
select tests.ok((select count(*) from public.notifications where kind = 'billing.ended') = 1, 'told their plan ended');
select tests.fails($$insert into public.stripe_customers (user_id, customer_id) values ((select marcus from ids), 'cus_Fake')$$, 'people can''t write customer ids');
select tests.logout();

rollback;
