-- VYBR8 · Payments (Stripe)
--
-- People upgrade to VYBR8+ or MAX through Stripe Checkout. Stripe tells us what happened through a signed webhook;
-- only the server (service role) writes subscriptions. The app never trusts the browser about payment.

-- One Stripe customer per VYBR8 account (so upgrades, downgrades and receipts stay in one place).
create table public.stripe_customers (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  customer_id  text not null unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at   timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
create policy "stripe_customers: owner reads" on public.stripe_customers for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes: service role only.

-- One row per Stripe subscription.
create unique index user_subscriptions_stripe_ref_idx on public.user_subscriptions (provider_ref) where source = 'stripe';

-- Called by the Stripe webhook with the subscription's CURRENT state (fetched fresh from Stripe, so event order doesn't matter).
create or replace function public.billing_apply_stripe_subscription(
  p_user uuid, p_plan text, p_status text, p_ref text, p_period_end timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_prev   text;
begin
  if p_ref is null or p_ref !~ '^sub_[A-Za-z0-9]+$' then raise exception 'bad subscription id' using errcode = '22023'; end if;
  if not exists (select 1 from public.plans where code = p_plan and audience = 'consumer' and code <> 'free') then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  v_status := case p_status
    when 'active' then 'active' when 'trialing' then 'trialing' when 'past_due' then 'past_due'
    else 'canceled' end::public.subscription_status;

  select plan_code || ':' || status into v_prev from public.user_subscriptions where source = 'stripe' and provider_ref = p_ref;

  if v_prev is null then
    if p_status = 'incomplete' then return; end if;        -- checkout not finished yet; wait for the next event
    if not exists (select 1 from public.profiles where id = p_user) then raise exception 'unknown user' using errcode = '22023'; end if;
    insert into public.user_subscriptions (user_id, plan_code, status, source, provider_ref, current_period_end)
    values (p_user, p_plan, v_status, 'stripe', p_ref, p_period_end);
  else
    update public.user_subscriptions
       set plan_code = p_plan, status = v_status, current_period_end = p_period_end, updated_at = now()
     where source = 'stripe' and provider_ref = p_ref;
  end if;

  -- Tell them once when they're in, and once if it ends.
  if v_status in ('active', 'trialing') and (v_prev is null or v_prev <> p_plan || ':' || v_status) then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select (select user_id from public.user_subscriptions where source = 'stripe' and provider_ref = p_ref),
           'billing.active', 'You''re on ' || p.name, 'Thanks for supporting VYBR8. Your new features are on.', '/pricing',
           'billing:' || p_ref || ':' || p_plan
      from public.plans p where p.code = p_plan
    on conflict do nothing;
  elsif v_status = 'canceled' and v_prev is not null and v_prev not like '%:canceled' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select user_id, 'billing.ended', 'Your plan ended', 'You''re back on VYBR8 Free. Rating is always free. Upgrade again anytime.', '/pricing',
           'billing:' || p_ref || ':ended'
      from public.user_subscriptions where source = 'stripe' and provider_ref = p_ref
    on conflict do nothing;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  select null, 'billing.stripe_sync', 'profile', user_id, jsonb_build_object('plan', p_plan, 'status', p_status, 'ref', p_ref)
    from public.user_subscriptions where source = 'stripe' and provider_ref = p_ref;
end;
$$;
revoke execute on function public.billing_apply_stripe_subscription(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_stripe_subscription(uuid, text, text, text, timestamptz) to service_role;

-- What the pricing page needs: is this person paying through Stripe right now?
create or replace function public.my_billing()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'has_customer', exists (select 1 from public.stripe_customers where user_id = (select auth.uid())),
    'stripe_plan', (select s.plan_code from public.user_subscriptions s
                     where s.user_id = (select auth.uid()) and s.source = 'stripe' and s.status in ('active', 'trialing', 'past_due')
                     order by s.updated_at desc limit 1),
    'past_due', exists (select 1 from public.user_subscriptions s
                     where s.user_id = (select auth.uid()) and s.source = 'stripe' and s.status = 'past_due'),
    'renews', (select s.current_period_end from public.user_subscriptions s
                     where s.user_id = (select auth.uid()) and s.source = 'stripe' and s.status in ('active', 'trialing')
                     order by s.updated_at desc limit 1));
$$;
revoke execute on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;
