# CraveZone — architecture

> **WHAT ARE YOU CRAVING?** “I know what kind of thing I want, but I don’t know where to get it.”
> CraveZone answers: what, where, how good, how much, how far, who else likes it, how it fits my goals, and what else could hit the same craving.
> It is about satisfying cravings, not policing food. It makes no assumptions about anyone’s gender or body, and it is not medical advice.

## Status

| Phase | Scope | Status |
|---|---|---|
| **CZ-1** | Taxonomy, item craving tags, search (tap or type), item results, place fallback, filters, Crave Map, saves, Home/Explore/Health cards | **Built** (`20261017800100_cravezone.sql`) |
| CZ-2 | Private crave history + personalization, friends who love it, food-truck live location, chef “From the Kitchen”, Link Up group cravings, delivery/pickup links | Next |
| CZ-3 | Optional, opt-in Cycle Cravings (manual entry only), strict privacy | Planned |
| CZ-4 | MAX: Crave Deep Dive, Goal Impact, Make It Work, Better Swap, I’m Eating It Anyway, meal-plan adjustment | Planned |

## What already existed (reused, not duplicated)

- **Menu items** `menu_items` (name, description, `dish_type`, price, category food/drink, alcohol flag behind the Pours rule, sold-out).
- **VYBR8 scores** `item_ratings` → view `menu_item_stats` (avg score, count). Charts rank with confidence (`src/domain/ranking`), never payment.
- **Nutrition** `menu_item_nutrition` with provenance (`verified … estimated … unknown`), read only through `item_deep_dive()` (MAX). Personal targets and food logs are owner-only.
- **Better Swap** already exists server-side: `item_swaps()` (MAX). CZ-4 will reuse it.
- **Places** `businesses` + `business_locations` + `business_hours`, OpenStreetMap cuisines, badges (`place_badges`, e.g. Black-owned), saved / Never-again lists (`place_lists`), food trucks (`food_truck_profiles`).
- **Taste** `taste_profiles` (likes, dislikes, allergies, dietary). **Big Back Mode** `user_settings.big_back_mode`.
- **Entitlements** `plans` / `plan_entitlements` / `my_plan()` via `src/server/entitlements.ts`.
- **Maps** `StreetMap` (Mapbox, loads only with a token) with a no-token fallback; `NearMeButton`; `CityChips`.

## Data model (CZ-1)

| Table / function | Purpose | Who can read / write |
|---|---|---|
| `craving_categories` | The taxonomy: slug, name, emoji, tone, order, `indulgent`, `light`, `item_keywords`, `exclude_keywords`, `search_terms`, `place_cuisines`, `place_kinds`, `place_name_keywords` | Everyone reads active rows; admins edit |
| `menu_item_craving_tags` | item ↔ craving, `confidence` 0–1, `source` keyword / owner / team / ai | Readable with the item; business editors write `owner` tags, the Team writes `team` tags; `keyword` tags only by the database |
| trigger `menu_items_craving_tag` | Re-tags an item when its name, description or dish type changes (owner/team tags untouched) | — |
| `retag_cravings()` | Re-run tagging after editing the taxonomy | Admins |
| `saved_menu_items` | “Save” a dish or drink | Owner only |
| `crave_items(...)` | Items hitting the picked cravings in a city, with score, distance, open-now, matched cravings and match weight | Runs **as the viewer**: RLS hides alcohol from people without Pours access; Never-again places are skipped |
| `crave_places(...)` | Places that can hit the craving by cuisine, kind or name (for places whose menu isn’t on VYBR8 yet) | Runs as the viewer |
| `private.location_open_now()` | Shared open-now check | — |

Taxonomy changes are data, not code: add a row to `craving_categories`, run `select public.retag_cravings();`, and the UI picks it up. Nothing in React hard-codes categories (only the Home card chooses which five to feature, by slug, and skips any that don’t exist).

## How search works (no AI needed)

1. **Tap**: tiles are checkboxes in a GET form → `/cravezone/results?c=sweet&c=cold_refreshing` (combinations allowed, up to 4).
2. **Type**: `parseCraving()` (`src/domain/cravezone/cravezone.ts`, unit-tested) matches whole words against each category’s name, search terms and item keywords from the database. It understands “not / no / without” (exclusions), “not too heavy / light” (lighter lean), “big back / loaded” (Big Back lean), and “under $15”. Unknown words (“birria”) become a menu-name search.
3. **Results**: items first (`crave_items`), then “More places that can hit it” (`crave_places`, de-duplicated).
4. **% VYBE** (`vybePercent()`): how well an item fits *this craving for this person*: craving coverage and tag confidence dominate; VYBR8 score (trusted only as rating count grows), taste likes/dislikes and distance fine-tune; clamped 1–99. It is separate from the VYBR8 score, which is what people rated it.
5. **Hard exclusions**: items mentioning the person’s allergies are removed in every mode, including Big Back.

**Honest data note:** places imported from OpenStreetMap have no menus. Until owners (or the Team) add menus, most results come from `crave_places` and say “Menu not on VYBR8 yet.” Item results light up as menus are added.

## Filters (URL, non-sensitive, shareable)

`f=open,u10,u20,local,black_owned,trucks,dinein,healthyish,bigback,saved`, `sort=match|top|near|price`, `view=list|map`, `city`, `lat/lng` (only when the person taps Near me), `c` (cravings), `x` (exclusions), `q`.
Big Back Mode from settings turns on the `bigback` lens by default (`f=none` turns it off for that search).
**Delivery / Pickup** filters wait for CZ-2: VYBR8 only shows links a verified business entered itself (`src/integrations/commerce`), and no such links are stored yet. We won’t show a filter that can’t be true.

## Routes

`/cravezone` (hero, search, craving grid) · `/cravezone/results` (list + CRAVE MAP) · planned: `/cravezone/history`, `/cravezone/settings`, `/cravezone/cycle` (CZ-2/3).
Entry points: Home, Explore and Health cards (`CraveZoneHero`), side nav, sitemap.

## Entitlements (seeded in CZ-1)

| Key | Plan |
|---|---|
| `cravezone`, `crave_map`, `save_cravings`, `crave_personalization` | Free |
| `advanced_crave_filters`, `crave_history_insights`, `crave_nutrition_filters` | VYBR8+ |
| `crave_deep_dive`, `crave_goal_impact`, `crave_make_it_work`, `crave_better_swap`, `adaptive_crave_meal_planning` | MAX |

Cycle Cravings opt-in and every privacy control are **never** paywalled.

## Sensitive data (applies to CZ-2 and CZ-3; designed now)

- **Crave history** (`user_craving_events`, `crave_result_interactions`, `user_craving_preferences`): owner-only RLS, no read policy for anyone else, no business/chef analytics access to rows. Business analytics only ever get **aggregates** over whole cities with minimum counts (e.g. “chocolate dessert searches up 18% this week”).
- **Cycle Cravings** (`cycle_preferences`, `cycle_entries`, `cycle_craving_patterns`):
  - Off by default; explicit opt-in (“Want CraveZone to consider your cycle?” → CONNECT / NOT NOW). No assumptions about gender, sex, menstrual status, pregnancy or health; never inferred from behavior.
  - Manual entry only (cycle start date, optional cycle length / period length). No fake Apple Health / Android integrations in the web app; the tables have a `source` column for future authorized integrations.
  - Owner-only RLS; not readable by friends, followers, businesses, chefs, food trucks, advertisers, the public, **or the VYBR8 Team** (no staff read policy). Delete-all and turn-off always available.
  - Phase buckets and patterns are computed from the person’s **own** history, stored owner-only, never in URLs, never sent to analytics, never used for ads or audience segments.
  - Copy: “You’ve tended to choose…”, “Based on your logged preferences…”. Never “Women crave…”, “Your body needs…”.
  - Notifications, if the person turns them on: discreet (“Your CraveZone picks are ready.”), no reproductive-health detail in previews.
  - Design stays on-brand (orange/coral/black), not stereotypically pink.
- **MAX nutrition**: never shaming. “I’m Eating It Anyway” respects the choice (“BET 😂 Fries logged.”), no “cheat meal / bad food / you messed up”. Estimates are labeled as estimates; swaps are not claimed healthier without data.

## AI (optional, later)

Everything above works without AI. Optional later: better natural-language parsing, `ai`-source item tags with confidence (reviewed before counting fully), and swap explanations. AI never receives cycle data.

## Components

Built: `CraveZoneHero`, `CravingGrid` (with `CravingChip` styling), `CraveSearch`, `CraveItemCard` / `CravePlaceCard` (CraveResultCard), `CraveMap`, filter/sort chips (CraveFilters, in the results page).
Planned: `CraveHistory`, `PersonalCraveInsight`, `CycleCravingOptIn`, `CraveDeepDive`, `MakeItWork`, `BetterSwap`, `EatItAnywayButton`, `CraveFriendActivity`, `GroupCraveSummary`.

## Checks (CZ-1)

- Database: `bash scripts/test-db.sh` (`supabase/tests/238_cravezone.sql`: taxonomy, auto-tagging and re-tagging, combos rank, exclusions, alcohol rule, price filter, saves are owner-only, Never-again respected).
- Unit: `tests/unit/cravezone.test.ts` (parsing, “not”, light/heavy, prices, whole words, % VYBE, URL helpers).
- Types/syntax: project type check. Production build runs on Netlify.
