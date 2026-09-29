-- Tiny SQL test harness for RLS checks. Each assertion that passes prints "NOTICE:  ok: …".
-- Any failure raises and stops the run (psql ON_ERROR_STOP).

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'ok: %', msg;
end $$;

-- Runs a statement and returns the number of affected rows.
create or replace function tests.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Asserts that a statement raises an error.
create or replace function tests.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok: % (blocked: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL (expected an error): %', msg;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
