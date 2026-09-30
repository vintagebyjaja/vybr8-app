-- VYBR8 · UPDATE: run this ONCE after file 20. Followers, following & mutuals lists; new-follower alerts; accept or decline VYBR8 Team requests from the Team manager.

-- ═════ 20261017600100_followers_team_requests.sql ═════
-- VYBR8 · Followers, following & mutuals · Team join requests
--
-- 1. Anyone can open a profile's Followers and Following lists, and see "Mutuals": people YOU follow who also follow them.
--    Privacy rules still apply (hidden or blocked profiles never show up), because this runs as the viewer.
-- 2. People get a heads-up when someone follows them.
-- 3. The founder answers "I want to join the VYBR8 Team" requests from the Team manager: accept (pick role and title) or decline.

-- ── Followers / following / mutuals ────────────────────────────────────
create or replace function public.profile_connections(p_user uuid, p_tab text, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, username text, display_name text, avatar_url text, i_follow boolean, follows_me boolean, since timestamptz, total bigint)
language sql stable security invoker
set search_path = ''
as $$
  with base as (
    select f.follower_id as pid, f.created_at from public.follows f
     where p_tab = 'followers' and f.followee_id = p_user
    union all
    select f.followee_id, f.created_at from public.follows f
     where p_tab = 'following' and f.follower_id = p_user
    union all
    select f.follower_id, f.created_at from public.follows f
     where p_tab = 'mutual' and f.followee_id = p_user and f.follower_id <> (select auth.uid())
       and exists (select 1 from public.follows m where m.follower_id = (select auth.uid()) and m.followee_id = f.follower_id)
  ), visible as (
    select p.id, p.username::text as username, p.display_name, p.avatar_url, b.created_at
      from base b join public.profiles p on p.id = b.pid        -- profiles RLS hides private/blocked people
  )
  select v.id, v.username, v.display_name, v.avatar_url,
         exists (select 1 from public.follows x where x.follower_id = (select auth.uid()) and x.followee_id = v.id),
         exists (select 1 from public.follows x where x.followee_id = (select auth.uid()) and x.follower_id = v.id),
         v.created_at, count(*) over ()
    from visible v
   where p_tab in ('followers', 'following', 'mutual')
   order by v.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.profile_connections(uuid, text, integer, integer) to anon, authenticated;

-- "New follower" alert (one per person, even if they unfollow and follow again).
create or replace function private.follow_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select new.followee_id, 'follow.new',
         coalesce(p.display_name, '@' || p.username::text) || ' followed you', null,
         '/profile/' || p.username::text, 'follow.' || new.follower_id::text
    from public.profiles p where p.id = new.follower_id and not p.is_demo
  on conflict do nothing;
  return new;
end;
$$;
create trigger follows_notify after insert on public.follows for each row execute function private.follow_notify();

-- ── Team join requests (support messages with the "team" topic) ────────
create or replace function public.team_join_requests()
returns table (ticket_id uuid, user_id uuid, username text, display_name text, avatar_url text, email text, message text,
               created_at timestamptz, on_team boolean)
language sql stable security definer
set search_path = ''
as $$
  select t.id, t.user_id, p.username::text, p.display_name, p.avatar_url, t.email, t.message, t.created_at,
         exists (select 1 from public.team_members m where m.user_id = t.user_id)
    from public.support_tickets t left join public.profiles p on p.id = t.user_id
   where private.is_founder() and t.topic = 'team' and t.status = 'open'
   order by t.created_at;
$$;
revoke execute on function public.team_join_requests() from public, anon;
grant execute on function public.team_join_requests() to authenticated;

create or replace function public.team_answer_request(p_ticket uuid, p_accept boolean, p_role public.platform_role default 'moderator',
                                                     p_title text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.support_tickets;
  uname text;
begin
  if not private.is_founder() then raise exception 'only the founder manages the VYBR8 Team' using errcode = '42501'; end if;
  select * into t from public.support_tickets where id = p_ticket and topic = 'team';
  if t.id is null then raise exception 'That request is gone.' using errcode = 'P0002'; end if;
  if t.status <> 'open' then raise exception 'That request was already answered.' using errcode = '22023'; end if;

  if p_accept then
    select username::text into uname from public.profiles where id = t.user_id;
    if uname is null then raise exception 'They wrote in without an account. Ask them to sign up, then add them by username.' using errcode = '22023'; end if;
    perform public.team_set_member(uname, p_role, coalesce(nullif(trim(p_title), ''), 'VYBR8 Team'), null);
    update public.support_tickets set status = 'answered',
           staff_note = format('Welcome aboard! You''re on the VYBR8 Team as %s.', case p_role when 'admin' then 'an Admin' else 'a Moderator' end)
     where id = t.id;
  else
    update public.support_tickets set status = 'closed',
           staff_note = 'Thank you for offering to help. We''re not adding anyone right now, but we''ll keep you in mind.'
     where id = t.id;
    if t.user_id is not null then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
      values (t.user_id, 'team.request', 'About joining the VYBR8 Team',
              'Thank you for offering to help. We''re not adding anyone right now, but we''ll keep you in mind.', '/help',
              'team.request.' || t.id::text)
      on conflict do nothing;
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), case when p_accept then 'team.request_accepted' else 'team.request_declined' end, 'profile', t.user_id,
          jsonb_build_object('ticket', t.id));
end;
$$;
revoke execute on function public.team_answer_request(uuid, boolean, public.platform_role, text) from public, anon;
grant execute on function public.team_answer_request(uuid, boolean, public.platform_role, text) to authenticated;
