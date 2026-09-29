# VYBR8 — Implementation checklist

## Starting instructions (spec §60)
- [x] Inspect repository (new, empty)
- [x] ARCHITECTURE.md · DATABASE.md · PRODUCT.md · ROADMAP.md
- [x] .env.example
- [x] Directory structure proposed (ARCHITECTURE.md)
- [x] Initial database schema proposed (DATABASE.md)
- [x] Integrations needing credentials identified (ARCHITECTURE.md, ROADMAP.md)
- [x] Immediately implementable vs mock-required identified

## Phase 0: Foundation
- [x] package.json with scripts: dev, build, start, typecheck, lint, format, test, test:db, test:e2e, verify
- [x] tsconfig (strict), ESLint flat config, Prettier
- [x] Tailwind v4 with brand tokens
- [x] Supabase clients: browser, server (RSC/actions), session-refreshing proxy
- [x] Env validation with public/server split
- [x] App shell: bottom nav (mobile), side nav (desktop), prominent VYBE action
- [x] Home placeholder with brand, auth pages wired to Supabase
- [x] PWA manifest + icons from the logo
- [x] netlify.toml, supabase/config.toml
- [x] Structured logger with redaction, analytics/error abstractions
- [x] Unit test runner (node:test, zero install) + Playwright config
- [ ] **Run `npm install && npm run verify` on a machine with npm access** (blocked in build workspace)

## Phase 1: Database + Auth
- [x] Enums, helper schema, updated_at trigger
- [x] profiles, user_settings, privacy_settings, user_roles, friendships
- [x] businesses, business_locations, business_members, business_claims, audit_logs
- [x] Sign-up trigger creates profile + settings + privacy rows
- [x] RLS on every table
- [x] Guard triggers on privileged columns
- [x] Admin RPCs: approve/reject business claim (audited)
- [x] Seed framework (fictional, `is_demo = true`)
- [x] SQL security tests pass on Postgres 16
- [ ] Apply to a real Supabase project (`supabase db push`)

## Early domain work
- [x] Ranking engine core (Bayesian confidence, recency, credibility, suspicious penalty, eligibility, explanations) + tests

## Social layer: Plates & Pours + creators
- [x] posts, post_media, post_vybes, post_comments, reports, follows, post_stats view
- [x] team_members (Founder), creator_applications, creator_profiles + staff RPCs (audited)
- [x] Private photo bucket with folder-scoped upload and visibility-scoped reads
- [x] Composer: 1–10 photos, client-side resize (1600px, strips location data), venue tag, score, price, visibility
- [x] Timeline (Following / Creators), Explore creators + Plates/Pours/Spots grid, venue page Plates & Pours under reviews, profile grid with follow
- [x] Creator application (21+ attestation for Liquid Lovers), VYBR8 Team verification on team profiles and /team/creators
- [x] Reporting and moderation
- [x] 60 SQL security assertions, 13 unit tests
- [ ] Push notifications for new followers / comments (Phase 6 notifications)
- [x] Birthday at sign-up; VYBR8 is 13+, alcohol content / drink perks / Liquid Lovers are 21+

## Birthdays + Birthday Perks
- [x] Birthday required at sign-up; under-13 refused in the app and in the database
- [x] Social-login users confirm birthday before using the app
- [x] Daily birthday alerts (week before + day of), idempotent, user can turn off
- [x] In-app alerts page and unread badge
- [x] Birthday Perks page: countdown, "ready for you now", filters, suggestions, team review
- [x] Venue page shows its birthday perks
- [ ] Email / push delivery of alerts (needs an email provider, e.g. Resend, and web push setup)
- [ ] Confirm pg_cron schedule exists in the hosted project (Database → Cron in Supabase)

## Vybe Map + Link Ups + guest invites
- [x] 7 launch cities (Charlotte, Atlanta, Nashville, Houston, Phoenix, DC, Brooklyn); city picker saved per user
- [x] Frequency map on Home for signed-in users: venue logos with open/closed, latest plate/pour photos, Link Ups with spots left, friends' vybes
- [x] "What's your vybe?" status (eat / drink / link up), friends only, expires in up to 12 hours
- [x] Link Ups: 2–10 spots (host included), public / friends / invite-only, open or host-approved, "open to new friends", drinks = 21+
- [x] Invite friends, approve / decline requests, remove people, cancel
- [x] Guest invite links for people not on VYBR8: RSVP with name + birthday, see details, group chat as a guest
- [x] Group chat (live for members, refreshes for guests); hidden at the end time and deleted by pg_cron within 10 minutes
- [x] 301 SQL assertions, 61 unit tests
- [x] Drinks Link Ups: must be 21 on the event day, so people can plan their 21st
- [x] Pours unlock 5 days before the 21st birthday (view, vybe, comment, review); Liquid Lovers and drinks Link Ups stay 21+
- [ ] Street-level basemap (needs a Mapbox or MapLibre tile key); pins already use real coordinates
- [ ] Add venues in the other 6 cities (only Charlotte has demo venues)
- [ ] Enable Realtime on `linkup_messages` if the migration notice says the publication was missing

## Trust & safety
- [x] Team profile circles; founder flag; only the founder manages the team
- [x] Team removals with founder uphold / veto (final), audited
- [x] Creator social proof (Instagram / TikTok / YouTube + proof code), confirmed before approval
- [x] Profile photo upload (avatars bucket); required for Link Ups; photos shown in Link Ups
- [x] Public / meet-new-friends Link Ups are 18+
- [x] Identity verification records + ID-verified badge
- [ ] Connect an ID verification partner (e.g. Persona, Stripe Identity or Veriff) and its webhook

## Expansion
- [x] Menus, item ratings, place ratings (Service Vybe, value, aesthetic), stats views
- [x] Food intelligence tables with provenance; `item_deep_dive` server-side gate; Better Swap
- [x] Plans, entitlements, subscriptions, admin plan grants, central entitlement service (`src/server/entitlements.ts`)
- [x] Promotion campaigns (labeled, team-activated, never affect rank)
- [x] Chefs: profiles, services, specialties, areas, workplaces with sources, dish credits, packages, availability, verification requests, service reviews
- [x] Food trucks: profiles, schedules, WE'RE HERE, follows + notifications, map pins
- [x] Unified search + Explore tabs; Charts (food, drinks, places, chefs, trucks); Pricing page; Deep Dive page
- [x] 349 SQL assertions, 118 unit tests (376 / 125 after Groups)
- [ ] Stripe checkout + webhook → subscriptions
- [ ] Business dashboard: menu editor for restaurants, analytics by plan
- [ ] Portfolio image uploads for chefs

## Groups & family
- [x] Family / Dating / Friends / Organization / FTK groups with invites that must be accepted
- [x] Kid profiles (no app), co-parents, tastes, transfer at 13+ while staying in the family
- [x] Group suggestions from everyone's tastes; plans with per-person menu picks
- [x] 376 SQL assertions, 125 unit tests
