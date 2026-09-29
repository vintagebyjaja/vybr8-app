-- VYBR8 · Age rules v2
--
-- VYBR8 is open to everyone 13 and older (13 is the floor for social apps in the US, COPPA).
-- Alcohol is 21+:
--   • posting or viewing a Pour that contains alcohol
--   • Liquid Lover / Both creator verification
--   • viewing or suggesting drink (alcohol) birthday perks
-- Age comes from the private birthdate each user gives at sign-up.

-- ── Age helpers ────────────────────────────────────────────────────────
create or replace function private.user_is_21_plus(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select private.age_on(birthdate, current_date) >= 21
                   from public.user_birthdays where user_id = p_user), false);
$$;

create or replace function private.viewer_is_21_plus()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.is_staff() or private.user_is_21_plus((select auth.uid())); $$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Minimum age 13 (was 21) ────────────────────────────────────────────
create or replace function private.user_birthdays_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birthdate > current_date then
    raise exception 'birthdate cannot be in the future' using errcode = '23514';
  end if;
  if private.age_on(new.birthdate, current_date) < 13 then
    raise exception 'VYBR8 is for people 13 and older' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (select auth.uid()) is not null and not private.is_staff()
     and new.birthdate is distinct from old.birthdate then
    raise exception 'contact the VYBR8 team to change your birthday' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  bday   date;
  uname  text;
begin
  begin
    bday := nullif(new.raw_user_meta_data ->> 'birthdate', '')::date;
  exception when others then
    raise exception 'invalid birthdate' using errcode = '22007';
  end;
  if bday is not null and private.age_on(bday, current_date) < 13 then
    raise exception 'VYBR8 is for people 13 and older' using errcode = '23514';
  end if;

  if wanted is not null
     and wanted ~ '^[A-Za-z0-9_.]{3,30}$'
     and not exists (select 1 from public.profiles where username = wanted::extensions.citext) then
    uname := wanted;
  else
    uname := 'vyber_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (id, username, display_name, is_demo)
  values (
    new.id,
    uname,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname), 60),
    coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false)
  );
  insert into public.user_settings (user_id) values (new.id);
  insert into public.privacy_settings (user_id) values (new.id);
  if bday is not null then
    insert into public.user_birthdays (user_id, birthdate) values (new.id, bday);
  end if;
  return new;
end;
$$;

-- ── Alcohol on posts ───────────────────────────────────────────────────
alter table public.posts add column is_alcoholic boolean not null default false;
alter table public.posts add constraint posts_alcohol_only_on_pours check (not is_alcoholic or kind = 'pour');
-- Existing drink posts were made when everyone was 21+; treat them as alcoholic to be safe.
update public.posts set is_alcoholic = true where kind = 'pour';

-- A post is visible only if the viewer may see alcohol when it contains alcohol.
create or replace function private.post_is_visible(p_post_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_view_post(author_id, visibility, status, deleted_at)
           and (not is_alcoholic or author_id = (select auth.uid()) or private.viewer_is_21_plus())
      from public.posts where id = p_post_id), false);
$$;

drop policy "posts: visible per author privacy and post visibility" on public.posts;
create policy "posts: visible per author privacy, post visibility and age"
  on public.posts for select to anon, authenticated
  using (private.can_view_post(author_id, visibility, status, deleted_at)
         and (not is_alcoholic or author_id = (select auth.uid()) or private.viewer_is_21_plus()));

drop policy "posts: create your own" on public.posts;
create policy "posts: create your own"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'published' and not is_demo and deleted_at is null
              and (not is_alcoholic or private.viewer_is_21_plus())
              and (business_id is null or exists (select 1 from public.businesses b where b.id = business_id)));

-- Under-21 authors can't flip an existing post to alcoholic.
create or replace function private.posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  if new.author_id <> old.author_id
  or new.status is distinct from old.status
  or new.status_note is distinct from old.status_note
  or new.is_demo is distinct from old.is_demo
  or new.created_at is distinct from old.created_at
  or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'that change is not allowed on a post' using errcode = '42501';
  end if;
  if new.is_alcoholic and not old.is_alcoholic and not private.viewer_is_21_plus() then
    raise exception 'alcohol posts are 21+' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Liquid Lovers must actually be 21+ (not just say so) ───────────────
drop policy "creator_applications: apply for yourself" on public.creator_applications;
create policy "creator_applications: apply for yourself"
  on public.creator_applications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending'
              and reviewed_by is null and reviewed_at is null and decision_note is null
              and not private.is_verified_creator(user_id)
              and (creator_type = 'big_back' or private.user_is_21_plus(user_id)));

create or replace function public.approve_creator_application(p_application_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.creator_applications;
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;

  select * into a from public.creator_applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'application is %', a.status using errcode = '22023'; end if;
  if a.creator_type <> 'big_back' and not private.user_is_21_plus(a.user_id) then
    raise exception 'Liquid Lovers must be 21 or older' using errcode = '23514';
  end if;

  update public.creator_applications
     set status = 'approved', decision_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = a.id;

  insert into public.creator_profiles (user_id, creator_type, status, application_id, verified_by, verified_at)
  values (a.user_id, a.creator_type, 'verified', a.id, auth.uid(), now())
  on conflict (user_id) do update
    set creator_type = excluded.creator_type, status = 'verified', application_id = excluded.application_id,
        verified_by = excluded.verified_by, verified_at = excluded.verified_at, status_note = null;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator.verified', 'profile', a.user_id,
          jsonb_build_object('application_id', a.id, 'creator_type', a.creator_type));
end;
$$;

-- ── Drink birthday perks are 21+ ───────────────────────────────────────
drop policy "birthday_perks: active perks at visible places are public" on public.birthday_perks;
create policy "birthday_perks: active perks at visible places are public"
  on public.birthday_perks for select to anon, authenticated
  using ((status = 'active' and exists (select 1 from public.businesses b where b.id = business_id)
          and (not is_alcoholic or private.viewer_is_21_plus()))
         or submitted_by = (select auth.uid())
         or private.can_edit_business(business_id)
         or private.is_staff());

drop policy "birthday_perks: anyone signed in can suggest" on public.birthday_perks;
create policy "birthday_perks: anyone signed in can suggest"
  on public.birthday_perks for insert to authenticated
  with check (exists (select 1 from public.businesses b where b.id = business_id)
              and (not is_alcoholic or private.viewer_is_21_plus()));
