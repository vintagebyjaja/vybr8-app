-- VYBR8 · Social layer 2/2 · Plates, Pours and Spots (photo posts), vybes, comments, reports, photo storage
--
-- plate  a dish       pour  a drink       spot  the restaurant / bar / lounge itself

create type public.post_kind      as enum ('plate', 'pour', 'spot');
create type public.content_status as enum ('published', 'hidden', 'removed');
create type public.report_reason  as enum ('spam', 'inappropriate', 'harassment', 'misleading', 'underage_drinking', 'not_food_or_drink', 'other');
create type public.report_status  as enum ('open', 'actioned', 'dismissed');

-- ── Posts ──────────────────────────────────────────────────────────────
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind         public.post_kind not null,
  business_id  uuid references public.businesses (id) on delete set null,
  item_name    text check (char_length(item_name) <= 120),     -- "Hot Honey Wings"; links to menu_items in Phase 3
  caption      text check (char_length(caption) <= 2200),
  rating       numeric(3,1) check (rating between 0 and 10),
  price_cents  integer check (price_cents between 0 and 10000000),
  visibility   public.visibility not null default 'public',
  status       public.content_status not null default 'published',
  status_note  text,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index posts_author_idx   on public.posts (author_id, created_at desc) where deleted_at is null;
create index posts_business_idx on public.posts (business_id, created_at desc) where deleted_at is null and status = 'published';
create index posts_recent_idx   on public.posts (created_at desc) where deleted_at is null and status = 'published';
create trigger posts_updated_at before update on public.posts for each row execute function private.set_updated_at();

create table public.post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  storage_path  text not null unique
                check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' or storage_path ~ '^demo/[A-Za-z0-9._-]{1,120}$'),
  position      smallint not null check (position between 0 and 9),
  width         integer check (width between 1 and 10000),
  height        integer check (height between 1 and 10000),
  alt_text      text check (char_length(alt_text) <= 300),
  created_at    timestamptz not null default now(),
  unique (post_id, position)
);

create table public.post_vybes (       -- likes
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_vybes_user_idx on public.post_vybes (user_id);

create table public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 1000),
  status      public.content_status not null default 'published',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create trigger post_comments_updated_at before update on public.post_comments for each row execute function private.set_updated_at();

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('post', 'comment', 'profile')),
  target_id    uuid not null,
  reason       public.report_reason not null,
  note         text check (char_length(note) <= 500),
  status       public.report_status not null default 'open',
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index reports_one_open_per_reporter on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index reports_queue_idx on public.reports (status, created_at);

-- ── Helpers ────────────────────────────────────────────────────────────
create or replace function private.can_view_post(
  p_author uuid, p_visibility public.visibility, p_status public.content_status, p_deleted_at timestamptz
)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if private.is_staff() then return true; end if;
  -- Authors always see their own rows (the app filters out deleted ones). Postgres also
  -- requires an updated row to stay visible, which is what makes soft-delete work.
  if me is not null and me = p_author then return true; end if;
  if p_deleted_at is not null then return false; end if;
  if p_status <> 'published' then return false; end if;
  if me is not null and private.is_blocked_between(me, p_author) then return false; end if;
  if not private.can_view(p_author, 'profile') then return false; end if;
  return case p_visibility
           when 'public'  then true
           when 'friends' then private.are_friends(p_author, me)
           else false
         end;
end;
$$;

create or replace function private.post_is_visible(p_post_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select private.can_view_post(author_id, visibility, status, deleted_at)
                   from public.posts where id = p_post_id), false);
$$;

create or replace function private.is_post_author(p_post_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.posts where id = p_post_id and author_id = (select auth.uid())); $$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Guards ─────────────────────────────────────────────────────────────
-- Authors edit words, rating and visibility, and can delete. Only staff moderate.
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
  return new;
end;
$$;
create trigger posts_guard before update on public.posts for each row execute function private.posts_guard();

create or replace function private.post_comments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_staff() then return new; end if;
  if new.post_id <> old.post_id or new.author_id <> old.author_id
  or new.status is distinct from old.status or new.created_at is distinct from old.created_at
  or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'that change is not allowed on a comment' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger post_comments_guard before update on public.post_comments for each row execute function private.post_comments_guard();

create or replace function private.post_media_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.post_media where post_id = new.post_id) >= 10 then
    raise exception 'a post can have at most 10 photos' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger post_media_limit before insert on public.post_media for each row execute function private.post_media_limit();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.posts          enable row level security;
alter table public.post_media     enable row level security;
alter table public.post_vybes     enable row level security;
alter table public.post_comments  enable row level security;
alter table public.reports        enable row level security;

create policy "posts: visible per author privacy and post visibility"
  on public.posts for select to anon, authenticated
  using (private.can_view_post(author_id, visibility, status, deleted_at));
create policy "posts: create your own"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'published' and not is_demo and deleted_at is null
              and (business_id is null or exists (select 1 from public.businesses b where b.id = business_id)));
create policy "posts: author edits, staff moderates"
  on public.posts for update to authenticated
  using (author_id = (select auth.uid()) or private.is_staff())
  with check (author_id = (select auth.uid()) or private.is_staff());

create policy "post_media: follows post visibility"
  on public.post_media for select to anon, authenticated
  using (private.post_is_visible(post_id));
create policy "post_media: author adds photos from own folder"
  on public.post_media for insert to authenticated
  with check (private.is_post_author(post_id)
              and split_part(storage_path, '/', 1) = (select auth.uid())::text);
create policy "post_media: author removes photos"
  on public.post_media for delete to authenticated
  using (private.is_post_author(post_id));

create policy "post_vybes: visible with the post"
  on public.post_vybes for select to anon, authenticated
  using (private.post_is_visible(post_id));
create policy "post_vybes: vybe a visible post"
  on public.post_vybes for insert to authenticated
  with check (user_id = (select auth.uid()) and private.post_is_visible(post_id));
create policy "post_vybes: remove your vybe"
  on public.post_vybes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "post_comments: visible with the post"
  on public.post_comments for select to anon, authenticated
  using (private.post_is_visible(post_id)
         and ((status = 'published' and deleted_at is null) or author_id = (select auth.uid()) or private.is_staff()));
create policy "post_comments: comment on a visible post"
  on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'published' and deleted_at is null
              and private.post_is_visible(post_id)
              and not private.is_blocked_between((select auth.uid()), (select p.author_id from public.posts p where p.id = post_id)));
create policy "post_comments: author edits, staff moderates"
  on public.post_comments for update to authenticated
  using (author_id = (select auth.uid()) or private.is_staff())
  with check (author_id = (select auth.uid()) or private.is_staff());

create policy "reports: file a report"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and handled_by is null and handled_at is null);
create policy "reports: reporter and staff read"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_staff());
create policy "reports: staff handle"
  on public.reports for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- ── Staff moderation RPC (audited) ─────────────────────────────────────
create or replace function public.moderate_post(p_post_id uuid, p_status public.content_status, p_note text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'VYBR8 team only' using errcode = '42501'; end if;
  update public.posts set status = p_status, status_note = p_note where id = p_post_id;
  if not found then raise exception 'post not found' using errcode = 'P0002'; end if;
  update public.reports set status = 'actioned', handled_by = auth.uid(), handled_at = now()
   where target_type = 'post' and target_id = p_post_id and status = 'open' and p_status <> 'published';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'post.' || p_status, 'post', p_post_id, jsonb_build_object('note', p_note));
end;
$$;
revoke execute on function public.moderate_post(uuid, public.content_status, text) from public, anon;
grant execute on function public.moderate_post(uuid, public.content_status, text) to authenticated;

-- ── Feed view: counts without exposing who vybed ───────────────────────
-- security_invoker: the caller's RLS applies to every underlying table.
create view public.post_stats with (security_invoker = true) as
  select p.id as post_id,
         (select count(*) from public.post_vybes v where v.post_id = p.id)    as vybe_count,
         (select count(*) from public.post_comments c where c.post_id = p.id and c.deleted_at is null and c.status = 'published') as comment_count
  from public.posts p;

-- ── Photo storage ──────────────────────────────────────────────────────
-- Private bucket: photos are served through short-lived signed URLs, so
-- friends-only posts stay friends-only. Uploads go to "<user id>/<file>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "post-media: upload to your own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "post-media: read your own or visible posts' photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'post-media' and (
           (storage.foldername(name))[1] = (select auth.uid())::text
           or exists (select 1 from public.post_media m where m.storage_path = name and private.post_is_visible(m.post_id))
         ));
create policy "post-media: delete your own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
