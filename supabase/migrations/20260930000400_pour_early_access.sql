-- VYBR8 · 21st-birthday early access to the Pours tab.
-- Starting 5 days before their 21st birthday, members can see alcohol posts, vybe them,
-- comment and post reviews, so they can plan where to go for their 21st.
-- Everything else about alcohol stays strictly 21+: Liquid Lover verification and drinks Link Ups.
-- Bars and lounges (the places themselves) are visible to everyone, like any map or search engine.

create or replace function private.user_has_pour_access(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select private.age_on(birthdate, current_date + 5) >= 21
                   from public.user_birthdays where user_id = p_user), false);
$$;

create or replace function private.viewer_has_pour_access()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.is_staff() or private.user_has_pour_access((select auth.uid())); $$;

grant execute on function private.user_has_pour_access(uuid), private.viewer_has_pour_access() to anon, authenticated, service_role;

-- Seeing an alcohol post (and so its photos, vybes and comments, which follow the post).
create or replace function private.post_is_visible(p_post_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_view_post(author_id, visibility, status, deleted_at)
           and (not is_alcoholic or author_id = (select auth.uid()) or private.viewer_has_pour_access())
      from public.posts where id = p_post_id), false);
$$;

drop policy "posts: visible per author privacy, post visibility and age" on public.posts;
create policy "posts: visible per author privacy, post visibility and age"
  on public.posts for select to anon, authenticated
  using (private.can_view_post(author_id, visibility, status, deleted_at)
         and (not is_alcoholic or author_id = (select auth.uid()) or private.viewer_has_pour_access()));

-- Posting a pour review.
drop policy "posts: create your own" on public.posts;
create policy "posts: create your own"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'published' and not is_demo and deleted_at is null
              and (not is_alcoholic or private.viewer_has_pour_access())
              and (business_id is null or exists (select 1 from public.businesses b where b.id = business_id)));

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
  if new.is_alcoholic and not old.is_alcoholic and not private.viewer_has_pour_access() then
    raise exception 'alcohol posts are 21+' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Drink birthday perks: visible early too, so people can plan their 21st.
drop policy "birthday_perks: active perks at visible places are public" on public.birthday_perks;
create policy "birthday_perks: active perks at visible places are public"
  on public.birthday_perks for select to anon, authenticated
  using ((status = 'active' and exists (select 1 from public.businesses b where b.id = business_id)
          and (not is_alcoholic or private.viewer_has_pour_access()))
         or submitted_by = (select auth.uid())
         or private.can_edit_business(business_id)
         or private.is_staff());
