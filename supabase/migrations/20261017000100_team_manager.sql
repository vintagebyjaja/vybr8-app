-- VYBR8 · Team manager
--
-- The founder adds people to the VYBR8 Team from the app: they sign up like anyone else, then the founder adds them
-- by username with a role (Moderator or Admin) and a title for their badge. The founder can change or remove them.
-- People can also ask to join from Help & Support ("I want to join the VYBR8 Team").

-- Help & Support: a topic for people who want to join the team.
alter table public.support_tickets drop constraint support_tickets_topic_check;
alter table public.support_tickets add constraint support_tickets_topic_check
  check (topic in ('account', 'sign_in', 'business', 'claim', 'max', 'bug', 'idea', 'privacy', 'safety', 'team', 'other'));

-- Add someone (or update their role/title). Founder only.
create or replace function public.team_set_member(p_username text, p_role public.platform_role, p_title text, p_bio text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who uuid;
  was_new boolean;
begin
  if not private.is_founder() then raise exception 'only the founder manages the VYBR8 Team' using errcode = '42501'; end if;
  select id into who from public.profiles where lower(username) = lower(trim(both '@ ' from coalesce(p_username, ''))) and not is_demo;
  if who is null then raise exception 'No one on VYBR8 has that username. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if who = me then raise exception 'You''re already the founder.' using errcode = '22023'; end if;
  p_title := nullif(left(trim(coalesce(p_title, '')), 60), '');
  if p_title is null then raise exception 'Give them a title, like Community Team or Head of Partnerships.' using errcode = '22023'; end if;

  was_new := not exists (select 1 from public.team_members where user_id = who);
  insert into public.team_members (user_id, title, bio, position, is_public)
  values (who, p_title, nullif(left(trim(coalesce(p_bio, '')), 280), ''), 100, true)
  on conflict (user_id) do update set title = excluded.title, bio = coalesce(excluded.bio, public.team_members.bio);

  delete from public.user_roles where user_id = who and role <> p_role;
  insert into public.user_roles (user_id, role, granted_by) values (who, p_role, me) on conflict do nothing;

  insert into public.notifications (user_id, kind, title, body, link)
  values (who, 'team.added',
          case when was_new then 'Welcome to the VYBR8 Team' else 'Your VYBR8 Team role changed' end,
          format('You''re %s (%s). Your team tools are on your profile.', p_title, case p_role when 'admin' then 'Admin' else 'Moderator' end),
          '/profile');
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (me, 'team.member_set', 'profile', who, jsonb_build_object('role', p_role, 'title', p_title));
  return who;
end;
$$;
revoke all on function public.team_set_member(text, public.platform_role, text, text) from public, anon;
grant execute on function public.team_set_member(text, public.platform_role, text, text) to authenticated;

-- Take someone off the team: their badge and team access go away. Founder only; the founder can't remove themselves.
create or replace function public.team_remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_founder() then raise exception 'only the founder manages the VYBR8 Team' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'The founder stays on the team.' using errcode = '22023'; end if;
  delete from public.user_roles where user_id = p_user;
  delete from public.team_members where user_id = p_user;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), 'team.member_removed', 'profile', p_user, '{}');
end;
$$;
revoke all on function public.team_remove_member(uuid) from public, anon;
grant execute on function public.team_remove_member(uuid) to authenticated;

-- The roster with roles, for the founder's Team manager.
create or replace function public.team_roster()
returns table (user_id uuid, username text, display_name text, title text, role text, is_founder boolean, joined timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select t.user_id, p.username::text, p.display_name, t.title,
         (select string_agg(r.role::text, ', ' order by r.role) from public.user_roles r where r.user_id = t.user_id),
         t.is_founder, t.created_at
    from public.team_members t join public.profiles p on p.id = t.user_id
   where private.is_founder()
   order by t.is_founder desc, t.position, t.created_at;
$$;
grant execute on function public.team_roster() to authenticated;
