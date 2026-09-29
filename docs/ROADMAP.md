# VYBR8 — Roadmap

Each phase ends with: typecheck → lint → unit tests → DB security tests → production build → docs updated → commit. Nothing moves forward on a red check.

| Phase | Scope | Status |
|---|---|---|
| 0 Foundation | Next.js + TS + Tailwind scaffold, Supabase SSR clients, env validation, brand system, app shell and nav, PWA manifest, Netlify config, lint/format/test tooling, docs | **Written.** Needs `npm install && npm run verify` on a machine with npm access (see README) |
| 1 Database + Auth | Profiles, settings, privacy, platform roles, friendships, businesses, locations, members, claims, audit log, RLS, sign-up trigger, claim approval RPC, seed framework | **Done and tested** against Postgres 16 (73 security assertions) |
| 1b Social: Plates & Pours + creators | Photo posts (plate / pour / spot), timeline (Following + Creators), Explore creators and post grid, venue Plates & Pours, profile grid, follows, vybes, comments, reports, Big Back / Liquid Lover creator verification by the VYBR8 Team | **Done.** 60 more security assertions (133 total), 13 more unit tests |
| 1c Birthdays + 21+ | Birthday at sign-up with 21+ gate, birthday alerts (in-app), Birthday Perks list with suggestions and team review, venue perks | **Done.** 39 more security assertions (172 total), 15 more unit tests |
| 2 Local Discovery | Categories, badges, hours, amenities, PostGIS, Explore list/map with synced filters, venue profile, mock map provider | Next |
| 3 Menus + Item Ratings | Menus, sections, items, nutrition provenance, price history, item and venue reviews, dimensions, Vibe Check, aesthetic tags, photos, collections | |
| 4 VYBR8 Charts | Ranking categories and scopes, ranking engine (pure TS core already written and tested), runs/entries/history, badges | Ranking core done early (9 unit tests) |
| 5 Social | Follows, activity, taste preferences (explicit vs inferred), Taste Match | |
| 6 Link Ups + Group Vybe | Link Ups, members, per-outing budgets, candidate generation, menu compatibility, cost estimates, explanations, exclusions, per-person picks, realtime | Flagship. **Done:** Link Ups (2–10 spots), requests, friend + guest invites, disappearing group chat, Vybe Map. **Next:** Group Vybe budgets and venue matching |
| 7 VYBR8 for Business | Claim UI, dashboard, menu management, ratings, rankings, aggregate analytics | |
| 8 Health Foundation | Health profile, goals, meal logs, nutrition dashboard, Active Vybe interfaces | |
| 9 Billing | Stripe provider, consumer plans, entitlements, business billing architecture (test mode) | |
| 10 External providers | Maps, delivery, reservations, AI, native health, as credentials and agreements arrive | |

## Build sequence (updated with the expansion)

**Core MVP**
1. Auth · 2. Profiles · 3. Local discovery · 4. Restaurants / bars / lounges · 5. Food trucks · 6. Menus / items · 7. Item ratings · 8. Service / Aesthetic ratings · 9. Charts · 10. Social / friends · 11. Link Ups · 12. Group Vybe · 13. Business profiles / dashboard · 14. Chef profiles / discovery · 15. Pricing / entitlements

**Post-MVP / premium intelligence**
16. MAX Deep Dive · 17. Goal Impact · 18. Better Swap · 19. Active Vybe · 20. Meal planning · 21. External provider integrations · 22. Advanced business analytics

**Status after the expansion build:** 1–11 and 14–15 have working foundations; 16–18 work end to end on demo data; 12, 13, 19–22 are next. The database already holds provenance, nutrition sources, food logs and entitlements, so MAX features won't need a destructive migration.

**Next phase: real places.** Mapbox basemap for the Vybe Map, a places provider (Google Places or Foursquare) to seed restaurants, bars, cafés and trucks in the 7 cities, business claiming so owners upload real menus, and photos from members, owners and the provider (with credit).

## Credentials and approvals needed from you

| Item | Needed by | Where |
|---|---|---|
| Supabase project (URL, publishable key, secret key) | Phase 1 deploy | supabase.com → Project Settings → API |
| GitHub repository | Now | For Netlify to deploy from |
| Netlify site | Phase 0 deploy | Link to the GitHub repo |
| Mapbox token *or* Google Maps key | Phase 2 live map | Mock works until then |
| Stripe account (test keys + webhook secret) | Phase 9 | |
| OpenAI API key | Optional, Phase 6+ | Explanations work without AI |
| Uber Eats / DoorDash / OpenTable partner access | Phase 10 | Outbound links work until then |
| Apple / Google developer accounts | Native health | Web app does not need them |
