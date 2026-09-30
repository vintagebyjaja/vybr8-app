-- VYBR8 · Help & support: messages to the VYBR8 Team
--
-- Anyone can write in, signed in or not (people who can't sign in need help the most).
-- The sender sees their own messages; the VYBR8 Team (admins and moderators) sees and answers all of them.
-- Replies go out by email from support@vybr8.live.

create table public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  name        text check (name is null or char_length(trim(name)) between 1 and 80),
  topic       text not null check (topic in ('account', 'sign_in', 'business', 'claim', 'max', 'bug', 'idea', 'privacy', 'safety', 'other')),
  message     text not null check (char_length(trim(message)) between 10 and 2000),
  page        text check (page is null or (page ~ '^/' and char_length(page) <= 200)),
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  staff_note  text check (staff_note is null or char_length(staff_note) <= 2000),
  handled_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index support_tickets_status_idx on public.support_tickets (status, created_at);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_email_idx on public.support_tickets (lower(email), created_at desc);

-- New messages: fair limits, clean fields, and a heads-up for the team.
create or replace function private.support_ticket_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.status := 'open';
  new.staff_note := null;
  new.handled_by := null;
  new.created_at := now();
  new.updated_at := now();
  if (select count(*) from public.support_tickets t
       where (t.email = new.email or (new.user_id is not null and t.user_id = new.user_id))
         and t.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many messages today' using errcode = '23514';
  end if;
  if (select count(*) from public.support_tickets t where t.user_id is null and t.created_at > now() - interval '1 hour') >= 60
     and new.user_id is null then
    raise exception 'too many messages right now' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger support_ticket_new before insert on public.support_tickets
  for each row execute function private.support_ticket_new();

create or replace function private.support_ticket_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select distinct r.user_id, 'support.new', 'New support message',
         left(format('%s: %s', replace(initcap(replace(new.topic, '_', ' ')), 'Max', 'MAX'), new.message), 200),
         '/admin/support', 'support.new.' || new.id::text
    from public.user_roles r
   where r.role in ('admin', 'moderator')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;
create trigger support_ticket_notify after insert on public.support_tickets
  for each row execute function private.support_ticket_notify();

-- Only the team changes a message after it's sent, and only its status and notes.
create or replace function private.support_ticket_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.user_id is distinct from old.user_id or new.email <> old.email or new.name is distinct from old.name
  or new.topic <> old.topic or new.message <> old.message or new.page is distinct from old.page or new.created_at <> old.created_at then
    raise exception 'only status and notes can change' using errcode = '42501';
  end if;
  new.handled_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
create trigger support_ticket_guard before update on public.support_tickets
  for each row execute function private.support_ticket_guard();

alter table public.support_tickets enable row level security;
create policy "support_tickets: anyone writes in" on public.support_tickets for insert to anon, authenticated
  with check (user_id is null and (select auth.uid()) is null or user_id = (select auth.uid()));
create policy "support_tickets: sender or team reads" on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
create policy "support_tickets: team updates" on public.support_tickets for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
-- Nobody deletes: the history stays for the team.
