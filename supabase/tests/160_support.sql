-- Help & support messages.

begin;

create temp table ids as select
  '00000000-0000-4000-8000-0000000000a1'::uuid as admin,
  '00000000-0000-4000-8000-0000000000a3'::uuid as marcus,
  '00000000-0000-4000-8000-0000000000a5'::uuid as chris;
grant select on ids to anon, authenticated, service_role;

select tests.anon();
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('Locked.Out@Example.com', 'sign_in', 'I never got my confirm email, help please')$$) = 1, 'someone who can''t sign in can still write in');
select tests.fails($$insert into public.support_tickets (user_id, email, topic, message) values ('00000000-0000-4000-8000-0000000000a3', 'x@example.com', 'other', 'pretending to be Marcus here')$$, 'signed-out visitors can''t write as someone else');
select tests.ok((select count(*) from public.support_tickets) = 0, 'and can''t read any messages');
select tests.logout();

select tests.login((select marcus from ids));
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message, page, status, staff_note) values ('marcus@example.com', 'bug', 'The map went black after I zoomed in', '/explore', 'closed', 'sneaky')$$) = 1, 'a signed-in person writes in');
select tests.ok((select status = 'open' and staff_note is null from public.support_tickets where user_id = (select marcus from ids)), 'new messages always start open, with no team notes');
select tests.fails($$insert into public.support_tickets (email, topic, message) values ('marcus@example.com', 'bug', 'short')$$, 'messages need a little detail');
select tests.fails($$insert into public.support_tickets (email, topic, message) values ('not-an-email', 'bug', 'The map went black again today')$$, 'a real email to answer');
select tests.ok(tests.affected($$update public.support_tickets set status = 'closed'$$) = 0, 'senders can''t close or change their message');
select tests.ok((select count(*) from public.support_tickets) = 1, 'you see only your own messages');
select tests.logout();

select tests.login((select chris from ids));
select tests.ok((select count(*) from public.support_tickets) = 0, 'other people don''t see them');
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number one for VYBR8')$$) = 1, 'idea 1');
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number two for VYBR8')$$) = 1, 'idea 2');
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number three for VYBR8')$$) = 1, 'idea 3');
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number four for VYBR8')$$) = 1, 'idea 4');
select tests.ok(tests.affected($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number five for VYBR8')$$) = 1, 'idea 5');
select tests.fails($$insert into public.support_tickets (email, topic, message) values ('chris@example.com', 'idea', 'idea number six for VYBR8')$$, 'up to 5 messages a day, so no one floods the inbox');
select tests.logout();

select tests.ok((select count(*) from public.notifications where kind = 'support.new' and user_id = (select admin from ids)) >= 7, 'the team gets an alert for each new message');

select tests.login((select admin from ids));
select tests.ok((select count(*) from public.support_tickets) >= 7, 'the team sees every message');
select tests.ok(tests.affected($$update public.support_tickets set status = 'answered', staff_note = 'Resent the email' where email = 'locked.out@example.com'$$) = 1, 'the team marks it answered');
select tests.ok((select handled_by = (select admin from ids) from public.support_tickets where email = 'locked.out@example.com'), 'and who handled it is recorded');
select tests.fails($$update public.support_tickets set message = 'edited' where email = 'locked.out@example.com'$$, 'no one rewrites what someone sent');
select tests.ok(tests.affected($$delete from public.support_tickets$$) = 0, 'and nothing is deleted');
select tests.logout();

rollback;
