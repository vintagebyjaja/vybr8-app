-- VYBR8 · UPDATE: run this ONCE after file 23. Menu, order and reserve links on places (website, menu, Instagram, DoorDash, Uber Eats, Grubhub, OpenTable, Resy…).

-- ═════ 20261017900100_place_links.sql ═════
-- VYBR8 · Place links: website, menu, Instagram, DoorDash, Uber Eats, Grubhub, OpenTable…
--
-- One tap from a place to see its menu, order food or book a table. Links come from:
--   osm        OpenStreetMap tags, filled in by the admin import (only when a place has none of that kind yet)
--   owner      the verified business (always wins)
--   team       the VYBR8 Team
--   community  anyone signed in, ONLY for known providers on their real domains (no random links), fair daily limit
-- VYBR8 never scrapes these services. A link only says "they're on DoorDash", never live availability or prices.

create table public.place_links (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  kind         text not null check (kind in ('website', 'menu', 'order', 'instagram', 'facebook', 'tiktok',
                                              'doordash', 'ubereats', 'grubhub', 'postmates', 'opentable', 'resy', 'tock')),
  url          text not null check (url ~ '^https://[^\s<>"]+$' and char_length(url) <= 400),
  source       text not null check (source in ('osm', 'owner', 'team', 'community')),
  added_by     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (business_id, kind)
);
alter table public.place_links enable row level security;
create policy "place_links: public with the place" on public.place_links for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.deleted_at is null));
-- Writes only through the functions below.

-- The domain each provider link must be on.
create or replace function private.link_host_ok(p_kind text, p_url text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_url ~ '^https://[^\s<>"]+$' and char_length(p_url) <= 400 and case p_kind
    when 'instagram' then p_url ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]{1,30}/?(\?.*)?$'
    when 'facebook'  then p_url ~* '^https://((www|m)\.)?facebook\.com/'
    when 'tiktok'    then p_url ~* '^https://(www\.)?tiktok\.com/@'
    when 'doordash'  then p_url ~* '^https://(www\.|order\.)?doordash\.com/'
    when 'ubereats'  then p_url ~* '^https://(www\.)?ubereats\.com/'
    when 'grubhub'   then p_url ~* '^https://(www\.)?grubhub\.com/'
    when 'postmates' then p_url ~* '^https://(www\.)?postmates\.com/'
    when 'opentable' then p_url ~* '^https://(www\.)?opentable\.com/'
    when 'resy'      then p_url ~* '^https://(www\.)?resy\.com/'
    when 'tock'      then p_url ~* '^https://(www\.)?exploretock\.com/'
    else true   -- website / menu / order: any https link, but only owners, the Team or the import can set them
  end;
$$;

-- Add or change a link. Owners and the Team can set any kind; anyone signed in can add provider links.
create or replace function public.set_place_link(p_business uuid, p_kind text, p_url text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  me     uuid := (select auth.uid());
  src    text;
  cur    public.place_links;
  v_url  text := trim(coalesce(p_url, ''));
begin
  if me is null then raise exception 'Sign in to add links.' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and deleted_at is null) then raise exception 'That place is gone.' using errcode = 'P0002'; end if;
  if v_url ~* '^http://' then v_url := 'https://' || substr(v_url, 8); end if;
  if v_url !~* '^https://' then v_url := 'https://' || v_url; end if;
  if p_kind = 'instagram' and v_url !~* 'instagram\.com' then v_url := 'https://www.instagram.com/' || trim(both '@/ ' from p_url); end if;
  if not private.link_host_ok(p_kind, v_url) then
    raise exception 'That link doesn''t look like a real % link.', replace(p_kind, 'ubereats', 'Uber Eats') using errcode = '22023';
  end if;

  src := case when coalesce(private.is_business_member(p_business) and private.can_edit_business(p_business), false) then 'owner'
              when private.is_staff() then 'team' else 'community' end;
  if src = 'community' then
    if p_kind in ('website', 'menu', 'order') then raise exception 'Only the business or the VYBR8 Team can set that link. Ask them to add it.' using errcode = '42501'; end if;
    if (select count(*) from public.place_links where added_by = me and created_at > now() - interval '1 day') >= 20 then
      raise exception 'That''s a lot of links today. Try again tomorrow.' using errcode = '22023';
    end if;
  end if;

  select * into cur from public.place_links where business_id = p_business and kind = p_kind;
  if cur.business_id is not null and cur.source in ('owner', 'team') and src = 'community' then
    raise exception 'The business already set that link.' using errcode = '22023';
  end if;
  if cur.business_id is not null and cur.source = 'owner' and src = 'team' then
    raise exception 'The owner set that link. Ask them to change it.' using errcode = '22023';
  end if;

  insert into public.place_links (business_id, kind, url, source, added_by)
  values (p_business, p_kind, v_url, src, me)
  on conflict (business_id, kind) do update set url = excluded.url, source = excluded.source, added_by = excluded.added_by, updated_at = now();

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (me, 'place.link_set', 'business', p_business, jsonb_build_object('kind', p_kind, 'source', src));
  return v_url;
end;
$$;
revoke execute on function public.set_place_link(uuid, text, text) from public, anon;
grant execute on function public.set_place_link(uuid, text, text) to authenticated;

-- Remove a link: owners and the Team; people can take back their own community link.
create or replace function public.remove_place_link(p_business uuid, p_kind text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (coalesce(private.can_edit_business(p_business), false) or private.is_staff()
          or exists (select 1 from public.place_links where business_id = p_business and kind = p_kind and source = 'community' and added_by = (select auth.uid()))) then
    raise exception 'Only the business or the VYBR8 Team can remove that link.' using errcode = '42501';
  end if;
  delete from public.place_links where business_id = p_business and kind = p_kind;
end;
$$;
revoke execute on function public.remove_place_link(uuid, text) from public, anon;
grant execute on function public.remove_place_link(uuid, text) to authenticated;

-- Admin import: fill in links from OpenStreetMap for places already on VYBR8 (never overwrites a link that exists).
-- p_rows: [{ "ext": "node/123", "website": "https://…", "links": { "instagram": "https://…", "menu": "https://…" } }, …]
create or replace function public.import_place_links(p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb; k text; v text; biz uuid; n integer := 0;
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'send up to 1000 places at a time' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select business_id into biz from public.place_external_ids where provider = 'osm' and external_id = r ->> 'ext';
    continue when biz is null;
    v := r ->> 'website';
    if v ~ '^https://[^\s<>"]+\.[^\s<>"]+$' and char_length(v) <= 300 then
      update public.businesses set website = v where id = biz and website is null;
    end if;
    for k, v in select key, value from jsonb_each_text(coalesce(r -> 'links', '{}')) loop
      if k in ('menu', 'order', 'instagram', 'facebook', 'tiktok', 'doordash', 'ubereats', 'grubhub', 'postmates', 'opentable', 'resy', 'tock')
         and private.link_host_ok(k, v) then
        insert into public.place_links (business_id, kind, url, source) values (biz, k, v, 'osm') on conflict do nothing;
        if found then n := n + 1; end if;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;
revoke execute on function public.import_place_links(jsonb) from public, anon;
grant execute on function public.import_place_links(jsonb) to authenticated;
