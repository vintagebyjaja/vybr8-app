-- VYBR8 · Permanently closed places
--
-- • The VYBR8 Team marks a place permanently closed in one tap: it disappears from lists, the map and search.
-- • Anyone signed in can report "closed for good". Three different people within 90 days hide it automatically,
--   and it shows on the Admin page so the team can confirm or bring it back.
-- • Nothing is deleted: a place that reopens (or was reported by mistake) comes back with its history.

alter table public.businesses add column closed_at timestamptz;

create table public.place_closure_reports (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);
alter table public.place_closure_reports enable row level security;
create policy "place_closure_reports: see your own, team sees all" on public.place_closure_reports for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
-- Reports are made through report_place_closed() only.

-- Trusted database functions may change a place's status on their own (the guard below lets them through).
create or replace function private.businesses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() or current_setting('vybr8.trusted', true) = 'on' then return new; end if;
  if new.is_claimed  is distinct from old.is_claimed
  or new.is_demo     is distinct from old.is_demo
  or new.slug        is distinct from old.slug
  or new.deleted_at  is distinct from old.deleted_at
  or new.created_by  is distinct from old.created_by
  or new.source      is distinct from old.source
  or new.approved_at is distinct from old.approved_at
  or new.closed_at   is distinct from old.closed_at then
    raise exception 'claim, approval, demo, slug, source, closure and deletion fields are admin-only' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status or new.brand_id is distinct from old.brand_id) and not private.is_staff() then
    raise exception 'publishing a place and linking brands is done by the VYBR8 Team' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- "Closed for good?" The team's report closes it right away; three people's reports close it too.
create or replace function public.report_place_closed(p_business uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n int;
begin
  if me is null then raise exception 'sign in to report a place' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and status = 'active' and deleted_at is null) then
    return 'already_hidden';
  end if;
  if exists (select 1 from public.businesses b where b.id = p_business and b.is_claimed) and not private.is_staff() then
    -- An owner runs this listing: send it to the team instead of hiding it automatically.
    insert into public.place_closure_reports (business_id, user_id) values (p_business, me) on conflict do nothing;
    return 'reported';
  end if;
  insert into public.place_closure_reports (business_id, user_id) values (p_business, me) on conflict do nothing;
  select count(*) into n from public.place_closure_reports where business_id = p_business and created_at > now() - interval '90 days';
  if private.is_staff() or n >= 3 then
    perform set_config('vybr8.trusted', 'on', true);
    update public.businesses set status = 'hidden', closed_at = now() where id = p_business;
    perform set_config('vybr8.trusted', 'off', true);
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (me, 'place.closed', 'business', p_business, jsonb_build_object('reports', n, 'by_team', private.is_staff()));
    return 'closed';
  end if;
  return 'reported';
end;
$$;
revoke all on function public.report_place_closed(uuid) from public, anon;
grant execute on function public.report_place_closed(uuid) to authenticated;

-- The team confirms a closure, or brings the place back (clearing the reports).
create or replace function public.review_place_closure(p_business uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 Team only' using errcode = '42501'; end if;
  perform set_config('vybr8.trusted', 'on', true);
  if p_closed then
    update public.businesses set status = 'hidden', closed_at = coalesce(closed_at, now()) where id = p_business;
  else
    update public.businesses set status = 'active', closed_at = null where id = p_business and deleted_at is null;
    delete from public.place_closure_reports where business_id = p_business;
  end if;
  perform set_config('vybr8.trusted', 'off', true);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), case when p_closed then 'place.closure_confirmed' else 'place.reopened' end, 'business', p_business, '{}');
end;
$$;
revoke all on function public.review_place_closure(uuid, boolean) from public, anon;
grant execute on function public.review_place_closure(uuid, boolean) to authenticated;

-- For the Admin page: places people reported, newest first.
create or replace function public.closure_report_queue()
returns table (business_id uuid, slug text, name text, branch_name text, status text, closed_at timestamptz, reports bigint, last_report timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select b.id, b.slug::text, b.name, b.branch_name, b.status::text, b.closed_at, count(*), max(r.created_at)
    from public.place_closure_reports r join public.businesses b on b.id = r.business_id
   where private.is_staff() and b.deleted_at is null and r.created_at > now() - interval '90 days'
   group by b.id
   order by max(r.created_at) desc
   limit 100;
$$;
grant execute on function public.closure_report_queue() to authenticated;
