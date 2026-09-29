-- VYBR8 · Phase 1 · Foundation
-- Shared schema, enums and helper functions used by every later migration.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Security-definer helpers live here. This schema is NOT exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ── Enums (closed sets only; growing taxonomies are rows, see DATABASE.md) ──
create type public.platform_role        as enum ('admin', 'moderator');
create type public.visibility           as enum ('public', 'friends', 'private');
create type public.friendship_status    as enum ('pending', 'accepted', 'declined', 'blocked');
create type public.business_kind        as enum (
  'restaurant', 'bar', 'cocktail_lounge', 'lounge', 'cigar_lounge', 'hookah_lounge',
  'cafe', 'bakery', 'food_truck', 'brewery', 'nightlife'
);
create type public.business_status      as enum ('pending', 'active', 'hidden');
create type public.business_member_role as enum ('owner', 'manager', 'staff');
create type public.claim_status         as enum ('pending', 'approved', 'rejected', 'withdrawn');

-- ── updated_at maintenance ──
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
