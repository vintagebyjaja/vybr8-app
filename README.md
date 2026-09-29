# VYBR8

**EAT • DRINK • LINK UP** · pronounced "vibrate"

VYBR8 answers *"What should I / we eat, drink, or do tonight?"* with item-level ratings, friends' tastes, tonight's budget, and a Group Vybe engine that explains why a place works and why others were ruled out.

- Product: [docs/PRODUCT.md](docs/PRODUCT.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database: [docs/DATABASE.md](docs/DATABASE.md)
- Roadmap and phase status: [docs/ROADMAP.md](docs/ROADMAP.md)
- Checklist: [docs/CHECKLIST.md](docs/CHECKLIST.md)

## Status

| | |
|---|---|
| Phase 0 foundation | Written. Run `npm run verify` locally to confirm (see below) |
| Phase 1 database + auth | Migrations, RLS and seed verified on Postgres 16 |
| Social: Plates & Pours + creators | Posts, photos, timeline, creators, team verification |
| Birthdays + Birthday Perks | Birthday at sign-up, birthday alerts, perks list |
| Age rules | VYBR8 is 13+; alcohol posts, drink perks and Liquid Lovers are 21+: 196 security assertions total, 42 unit tests |
| Ranking engine core | Written early, 9 unit tests pass |

## Putting this on GitHub

This folder is already a Git repository with its history. Easiest route:

1. Install [GitHub Desktop](https://desktop.github.com) and sign in.
2. **File → Add local repository** → choose this `vybr8` folder.
3. Click **Publish repository**, keep **Keep this code private** checked.

GitHub then runs `.github/workflows/ci.yml` on every push: it installs everything, typechecks, lints, runs the unit tests and database security tests, and does a production build. Check the **Actions** tab for a green tick.

Command-line alternative (after creating an empty private repo named `vybr8` on github.com):

```bash
git remote add origin https://github.com/YOUR_USERNAME/vybr8.git
git push -u origin main
```

After your first `npm install`, commit the generated `package-lock.json` so every install uses the same versions.

## Requirements

- Node.js 22.6 or newer (`.nvmrc`)
- Docker (for the local Supabase stack)
- A Supabase project for hosted environments

## Getting started

```bash
npm install
cp .env.example .env.local

# Local Supabase: starts Postgres, Auth, Storage, Realtime; applies migrations + seed
npx supabase start
# Copy the printed API URL, publishable key and secret key into .env.local

npm run dev          # http://localhost:3000
```

Demo accounts from `supabase/seed.sql` (all fictional, password `vybr8-demo-only`):

| Email | Role |
|---|---|
| admin@demo.vybr8.test | Platform admin (can review business claims at `/admin`) |
| jaja@demo.vybr8.test | Founder (VYBR8 Team, admin): creator verification appears under her profile |
| tia@demo.vybr8.test | Verified Big Back creator |
| marcus@demo.vybr8.test | Verified Liquid Lover creator |
| chris@demo.vybr8.test | Pending creator application |
| owner@demo.vybr8.test | Has a pending claim on "Ember & Oak (demo)" |
| kay@demo.vybr8.test | 16 years old: sees food posts and perks, no alcohol content |

## Birthday alerts

Alerts are created by `public.queue_birthday_notifications()`. On hosted Supabase the migration schedules it daily at 9am Eastern with pg_cron (check **Database → Cron**). If pg_cron isn't enabled, enable it under **Database → Extensions** and run:

```sql
select cron.schedule('vybr8-birthday-alerts', '0 13 * * *', 'select public.queue_birthday_notifications()');
```

Demo birthdays: Jaja Oct 5, Tia Feb 29, Marcus Dec 20.

## Vybe Map, Link Ups and guest chat

- Signed-in Home shows the Vybe Map for the user's city (7 launch cities). It's a stylized frequency map; pins use real coordinates, so a street basemap can drop in later.
- `/vybe` lists your Link Ups and open ones in your city; `/vybe/new` creates one (2–10 spots); `/vybe/[id]` has members, requests, invites, guest links and the group chat.
- `/i/<token>` is the public guest page for people without an account.
- Group chats disappear at the end time. `purge_ended_linkup_chats()` deletes them every 10 minutes via pg_cron (**Database → Cron**). Live chat uses Supabase Realtime on `linkup_messages` (**Database → Publications → supabase_realtime**).

## Expansion routes

`/search` (unified search) · `/chefs` · `/chef/[slug]` · `/chef/dashboard` · `/food-trucks` · `/food-trucks/[slug]` · `/food-truck/dashboard` · `/max/deep-dive/[itemId]` · `/charts` · `/pricing` (`/business/pricing` redirects to its business tab).

Entitlements are checked on the server (`src/server/entitlements.ts`) and again in the database (`private.viewer_can`, `item_deep_dive`). To give someone a plan before payments are live: `select public.grant_plan('<user id>', 'max', 30);` while signed in as an admin, or insert into `user_subscriptions` from the SQL Editor.

## Setting up a new Supabase project

Run `supabase/setup/1_setup_database.sql` once in **SQL Editor** (it is every migration in order; regenerate it with `bash scripts/build-setup.sh`). Optionally run `supabase/setup/2_demo_places.sql` for fictional Charlotte venues, menus, chefs and food trucks. Projects that already ran an earlier setup file run `supabase/setup/3_update_expansion_and_groups.sql` (or `4_update_groups_only.sql` if the expansion is already in) instead of file 1. Never load `supabase/seed.sql` into production: it has demo logins.

## Adding team members (founder only)

The founder adds or removes team members; nobody else can. Team members get moderator powers:

```sql
insert into public.user_roles (user_id, role) select id, 'moderator' from public.profiles where username = 'THEIR_USERNAME';
insert into public.team_members (user_id, title, position) select id, 'Community Team', 10 from public.profiles where username = 'THEIR_USERNAME';
```

The team removes reported content at `/team/moderation`; the founder upholds or vetoes each removal there. A veto is final.

## Making yourself Founder on the live site

Team powers are never granted from the app. After you sign up on your live site, open Supabase → SQL Editor and run (with your username):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where username = 'YOUR_USERNAME';

insert into public.team_members (user_id, title, position, is_founder)
select id, 'Founder', 1, true from public.profiles where username = 'YOUR_USERNAME';
```

Your profile then shows the **VYBR8 Founder** badge, and the creator verification queue appears underneath it. Add teammates the same way (use `moderator` for people who should verify creators but not approve business claims, and a title like `Community Team`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript, plus architecture import rules) |
| `npm test` | Unit tests with Node's built-in runner (no extra install) |
| `npm run test:db` | Throwaway Postgres: applies migrations + seed and runs RLS tests |
| `npm run test:e2e` | Playwright smoke tests (mobile + desktop) |
| `npm run verify` | typecheck → lint → unit tests → production build |
| `npm run db:types` | Generate typed Supabase client types from the local database |

## Deploying

1. Push this repo to GitHub.
2. Create a Supabase project. Run `npx supabase link --project-ref <ref>` then `npx supabase db push`. Do **not** load `seed.sql` into production.
3. In Supabase Auth settings, set the Site URL to your Netlify domain and add `https://<domain>/auth/callback` as a redirect URL.
4. Create a Netlify site from the repo. Add the variables from `.env.example` under Site settings → Environment variables. Set `NEXT_PUBLIC_DATA_MODE=production` only once real venue data exists.

## Rules for contributors

- Scores (ranking, Vybe Match, Group Vybe, Taste Match) live in `src/domain` and are never computed in components.
- `src/domain` imports nothing from Next, React or Supabase. ESLint enforces this.
- Every table gets RLS in the same migration that creates it. `npm run test:db` fails if any public table lacks it.
- Demo data is always `is_demo = true` and shows a Demo badge. Mock providers return `source.kind = "demo"`.
- Paid promotion never touches ranking tables or ranking code.
