# VYBR8 — Architecture

## Stack

Next.js (App Router, React Server Components) · TypeScript (strict) · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage, Realtime) · Netlify · Stripe (test mode first) · provider abstractions for maps, delivery, reservations, AI, health.

Supabase access uses **`@supabase/ssr`** with the cookie `getAll`/`setAll` API, which is the current pattern. The deprecated `auth-helpers` packages are not used. Server code verifies sessions with `supabase.auth.getClaims()` (JWT signature verified) and never trusts `getSession()` for authorization. The secret (service-role) key is only imported from `src/server/**`, which is guarded by `import "server-only"`.

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ UI            src/app/**  (routes, RSC pages, server actions)    │
│               src/components/**  (presentational, no data calls) │
├──────────────────────────────────────────────────────────────────┤
│ Application   src/server/**  (use cases, auth guards,            │
│               repositories — the only place that talks to DB)    │
├──────────────────────────────────────────────────────────────────┤
│ Domain        src/domain/**  (pure TS: ranking, vybe match,      │
│               group vybe, budgets, taste match, entitlements)    │
│               zero framework imports, fully unit tested          │
├──────────────────────────────────────────────────────────────────┤
│ Integrations  src/integrations/<provider>/  interface + adapters │
│               + mock provider (clearly labeled demo data)        │
├──────────────────────────────────────────────────────────────────┤
│ Platform      src/lib/supabase, src/config/env, observability    │
└──────────────────────────────────────────────────────────────────┘
```

Rules:

- Components never compute scores. Scores come from `src/domain` via `src/server`.
- `src/domain` must not import from `next`, `react`, `@supabase/*`, or `src/server`. It is tested with Node's built-in test runner, so it runs with zero installs.
- Each algorithm (ranking, vybe match, taste match, group vybe) exports a `VERSION` constant that is persisted with every snapshot, so results can be explained and algorithms can evolve.
- Security lives in Postgres RLS **and** server guards. UI hiding is cosmetic only.

## Directory structure

```
vybr8/
├─ docs/                      ARCHITECTURE, DATABASE, PRODUCT, ROADMAP, CHECKLIST
├─ public/                    brand assets, PWA icons
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/             timestamped SQL, one concern per file
│  ├─ seed.sql                demo data (every row is_demo = true, fictional names)
│  └─ tests/                  SQL security tests (run with scripts/test-db.sh)
├─ scripts/                   test-db.sh (local Postgres + Supabase auth shim)
├─ src/
│  ├─ app/
│  │  ├─ (app)/               consumer shell with bottom nav
│  │  │  ├─ page.tsx          HOME
│  │  │  ├─ explore/          list + map (spec's /discover and /map merged, view synced by query string)
│  │  │  ├─ charts/[category]/
│  │  │  ├─ venue/[slug]/     consumer venue profile (spec's /business/[slug], renamed to free /business for owners)
│  │  │  ├─ item/[id]/
│  │  │  ├─ search/
│  │  │  ├─ vybe/             VYBE tab: Link Ups hub
│  │  │  │  ├─ new/
│  │  │  │  └─ [id]/group-vybe/
│  │  │  ├─ friends/
│  │  │  ├─ health/
│  │  │  └─ profile/[username]/ + profile/settings/
│  │  ├─ business/            owner area: claim, dashboard/{menu,ratings,analytics,rankings}
│  │  ├─ admin/
│  │  ├─ auth/{sign-in,sign-up,callback}/
│  │  ├─ manifest.ts          PWA manifest
│  │  └─ layout.tsx
│  ├─ components/
│  │  ├─ brand/               Logo, VybePulse
│  │  ├─ nav/                 BottomNav, SideNav
│  │  ├─ ui/                  primitives (Button, Card, Chip, Sheet)
│  │  └─ vybe/                VybeScore, VybeMatchBadge, MatchReason, ExclusionReason, …
│  ├─ config/env.ts           validated env (server vs public split)
│  ├─ domain/                 pure logic + types
│  ├─ integrations/           maps, delivery, reservations, ai, billing, health, analytics, monitoring
│  ├─ lib/supabase/           browser.ts, server.ts, proxy.ts (session refresh)
│  ├─ server/                 auth guards, repositories, use cases (server-only)
│  └─ proxy.ts                Next 16 request proxy (formerly middleware.ts): refreshes Supabase session
└─ tests/
   ├─ unit/                   node:test, *.test.ts
   └─ e2e/                    Playwright
```

### Route decisions

| Spec route | Implemented as | Why |
|---|---|---|
| `/discover`, `/map` | `/explore?view=list|map` | One filter state for list and map (spec §8 requires sync) |
| `/business/[slug]` | `/venue/[slug]` | `/business/*` is the owner area; mixing them collides with `/business/claim` |
| `/linkups/**` | `/vybe/**` | Matches the VYBE tab. `/linkups` redirects there |

## Integrations inventory

| Area | Interface | Needs credentials or approval | Ships now as |
|---|---|---|---|
| Supabase | `lib/supabase` | Project URL + publishable key + secret key | Real (local via Supabase CLI) |
| Maps | `MapProvider` | Mapbox token or Google Maps key | Mock provider: static list and grid, labeled "Map preview (demo)" |
| Geocoding | `GeocodingProvider` | Same as maps | Mock (seed coordinates) |
| Restaurant/menu data | `VenueDataProvider` | Licensed data partner | Seed data only; business self-entry is real |
| Uber Eats / DoorDash | `DeliveryProvider` | Partner programs | Outbound link adapter (business-entered URLs), source + timestamp |
| OpenTable | `ReservationProvider` | Partner API | Outbound link adapter |
| Stripe | `BillingProvider` | Stripe test keys + webhook secret | Interface + entitlement logic; mock provider in dev |
| OpenAI | `AiProvider` | API key | No-op provider (deterministic explanations work without AI) |
| Apple HealthKit / Health Connect | `ActivitySource` | Native app | Interfaces + manual entry only. No fake web integration |
| Analytics | `Analytics` | Optional (PostHog etc.) | Console/no-op, PII-scrubbed |
| Error monitoring | `ErrorReporter` | Optional (Sentry etc.) | Structured server logger |

## What can be fully implemented now

Auth, profiles, privacy, businesses and claims, menus, ratings, saves, Charts (ranking engine over our own ratings), friends, taste profiles, Taste Match, Link Ups, Group Vybe, budget matching, explanations, business dashboard, health logging with manual entry, entitlements.

## What needs mocks until credentials exist

Live map tiles, geocoding, third-party menus, delivery and reservation availability, Stripe checkout, AI natural-language search, native activity sync.

## Security model

1. RLS on every table in `public`. Default deny, then explicit policies.
2. `private` schema for security-definer helpers (`is_admin`, `is_business_member`, `can_view_profile`). Not exposed through the Data API.
3. Privileged column changes (claim status, business verification, ranking eligibility) are blocked by triggers even for row owners, and only pass through admin RPCs that write `audit_logs`.
4. Health data: owner-only RLS, no friend or public policy exists at all.
5. Server-side admin guard re-checks `user_roles` on every admin action.

## Observability

`src/server/log.ts` emits structured JSON with a redaction list (password, token, authorization, cookie, health, dietary, email). Analytics events go through `integrations/analytics` with an allowlist of properties.

## Performance plan

RSC by default, client components only for interaction. Cursor pagination. Ranking results precomputed into `ranking_entries` by a scheduled job, never computed per request. Geospatial queries use PostGIS `geography(Point)` with GiST index (Phase 2). `next/image` for all imagery.
