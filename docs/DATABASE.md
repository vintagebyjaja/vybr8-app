# VYBR8 — Database

Postgres on Supabase. UUID primary keys (`gen_random_uuid()`), `created_at`/`updated_at timestamptz` on every mutable table (maintained by the `private.set_updated_at` trigger). RLS on every `public` table.

**Legend:** ✅ implemented in migrations · 🧭 designed, lands in its phase

## Conventions

- Security helpers live in the `private` schema (not exposed via the Data API), are `security definer`, and have `set search_path = ''`.
- Status and kind columns use Postgres enums when the set is closed (e.g. `friendship_status`). Taxonomies that grow (cuisines, chart categories, tags, badges) are **rows**, not enums, so new food categories never need a migration (spec §15).
- `is_demo boolean` on every table that seed data touches. The UI shows a Demo badge when true.
- Soft delete (`deleted_at`) only where history matters: reviews (moderation and ranking audit) and businesses (claims and rankings reference them). Everything else is hard-deleted.
- Raw inputs and computed outputs are separate tables: `item_reviews` vs `ranking_entries`, preferences vs `*_snapshots`.
- Every computed snapshot stores `algorithm_version` and `inputs jsonb` for explainability.

## Identity, roles, privacy (Phase 1) ✅

| Table | Purpose / notes |
|---|---|
| `profiles` ✅ | 1:1 with `auth.users`. `username citext unique`, display name, avatar, home city, `is_demo`. Created by trigger on sign-up. |
| `user_settings` ✅ | Units, default search radius, `big_back_mode` default, notification prefs. |
| `privacy_settings` ✅ | Per-surface visibility (`public` / `friends` / `private`): profile, ratings, saves, taste, activity, dietary, health. Health is forced `private` by a CHECK constraint until a later reviewed change. |
| `user_roles` ✅ | Platform roles (`admin`, `moderator`). Separate from business roles. No client write policies. |
| `friendships` ✅ | One row per pair `(requester_id, addressee_id)`, status `pending/accepted/declined/blocked`. Pair uniqueness enforced on `least/greatest`. |
| `follows` 🧭 | One-way follows of users (and later venues). |
| `audit_logs` ✅ | Append-only. Written only by security-definer functions. Admin read. |

> Spec listed `friendships` and `follows` in Phase 5. `friendships` moved to Phase 1 because privacy RLS ("friends can see") needs it.

## Businesses (Phase 1 core ✅, Phase 2 discovery 🧭)

| Table | Notes |
|---|---|
| `businesses` ✅ | Brand-level record: slug, name, kind (`restaurant`, `bar`, `cocktail_lounge`, `lounge`, `cigar_lounge`, `hookah_lounge`, `cafe`, `bakery`, `food_truck`, `brewery`, `nightlife`), description, price level, website, phone, `status` (`pending/active/hidden`), `is_claimed`, `is_demo`, `deleted_at`. |
| `business_locations` ✅ | Address, city, region, country, postal code, lat/lng, timezone. Phase 2 adds `geog geography(Point,4326)` + GiST index (PostGIS). A business can have many locations; reviews and menus attach to **location**. |
| `business_members` ✅ | `(business_id, user_id, role owner/manager/staff)`. |
| `business_claims` ✅ | Claim requests with evidence, status, reviewer, decision note. Approval only via `public.approve_business_claim()` (admin RPC). |
| `categories` 🧭 | Self-referencing taxonomy: `kind` (`cuisine`, `venue`, `dish`, `drink`, `aesthetic`, `occasion`), `slug`, `parent_id`. Replaces spec's `business_categories` and `menu_item_categories` as two join tables onto one taxonomy. |
| `business_categories` 🧭 | Join: business ↔ categories. |
| `badges` + `business_badges` 🧭 | Badge definitions (Black-owned, woman-owned, veteran-owned, locally owned, gives back) and assignments with `source` (`business_declared`, `verified`, `admin`) and `verified_at`. Never inferred. |
| `business_hours` 🧭 | `location_id, day_of_week, opens_at, closes_at, closes_next_day, menu_id nullable` (kitchen vs bar hours) + `hour_exceptions`. |
| `amenities` + `location_amenities` 🧭 | Rooftop, live music, hookah, cigar, outdoor, dress code (`value jsonb`). |

## Social: Plates & Pours, creators, team ✅ (tested in `supabase/tests/020_social_security.sql`)

| Table | Notes |
|---|---|
| `posts` ✅ | Photo posts. `kind` = `plate` (dish) / `pour` (drink) / `spot` (the place). Optional business tag, item name, caption, 0–10 score, price, visibility, moderation `status`, soft delete. Authors can't change status or un-delete; staff moderate via `moderate_post()` (audited). |
| `post_media` ✅ | Up to 10 photos per post (trigger). Paths must sit in the uploader's own storage folder (`<user id>/<file>`). |
| `post_vybes` ✅ | Likes ("vybes"). Only on posts you can see. |
| `post_comments` ✅ | Comments on visible posts; blocked users can't comment on each other. |
| `reports` ✅ | Anyone signed in can report a post, comment or profile; only staff read and resolve. |
| `post_stats` (view) ✅ | Vybe and comment counts, `security_invoker` so RLS still applies. |
| `follows` ✅ | One-way follows (creators, friends). Can't follow a profile you can't see or someone you've blocked. |
| `team_members` ✅ | Public VYBR8 Team roster (e.g. **Founder**). Display only; powers come from `user_roles`. |
| `creator_applications` ✅ | Apply as **Big Back** (food), **Liquid Lover** (drinks) or both. Liquid Lovers must attest 21+ (CHECK constraint). One pending application at a time. |
| `creator_profiles` ✅ | Verified creators. Written only by staff RPCs `approve_creator_application`, `reject_creator_application`, `set_creator_status` (all audited). |
| Storage bucket `post-media` ✅ | **Private**. Photos are served with short-lived signed URLs, so friends-only posts stay friends-only. Upload/delete only in your own folder; read only if you own it or can see the post. |

Post visibility rule (`private.can_view_post`): staff see everything; authors see their own; otherwise the post must be published, not deleted, not from someone you've blocked, from a profile you're allowed to see, and match its visibility (public, friends, or private).

## Birthdays, alerts and Birthday Perks ✅ (tested in `supabase/tests/030_birthdays_security.sql`)

| Table / function | Notes |
|---|---|
| `user_birthdays` ✅ | Self-reported birthdate, **owner-only**. Must be 21+ (trigger). Set once; changes go through the VYBR8 team. Created at sign-up from the form; social-login users confirm it at `/welcome/birthday` before using the app. |
| `handle_new_user` (updated) ✅ | Refuses sign-ups under 21 or with an invalid birthdate; saves the birthday. |
| `notifications` ✅ | In-app alerts. Written only by server jobs; users can read, mark read, and clear their own. Deduplicated per user by `dedupe_key`. |
| `birthday_perks` ✅ | Free food, free drinks, discounts per venue, with window (`day` / `week` = ±3 days / `month`), requirements, 21+ flag, source (`business` / `community` / `vybr8`) and `last_confirmed_at`. Business editors publish directly; everyone else's suggestions start pending for VYBR8 review (`review_birthday_perk`, audited). |
| `queue_birthday_notifications(date)` ✅ | Daily job: one-week-away and happy-birthday alerts, idempotent, respects the user's alert setting. Callable by the service role only. Scheduled with `pg_cron` at 13:00 UTC (9am Eastern) when available. |
| `private.next_birthday` ✅ | Feb 29 birthdays are celebrated on Feb 28 in non-leap years. |

## Age rules ✅ (tested in `supabase/tests/040_age_rules.sql`)

`20260929000400_age_rules.sql` lowers the minimum age to 13 and makes alcohol 21+: `posts.is_alcoholic` (drinks only), `private.viewer_is_21_plus()`, alcohol posts/photos/vybes/comments and drink perks hidden from under-21 and signed-out viewers, Liquid Lover applications and approvals require a real 21+ birthdate.

## Menus (Phase 3) 🧭

`menus` (location, name, kind `dinner/lunch/brunch/happy_hour/drinks/late_night/seasonal`, schedule jsonb, `prices_updated_at`) → `menu_sections` (position) → `menu_items` (name, description, `price_cents`, currency, image, `item_type` `food/drink`, `is_alcoholic`, `spice_level`, `is_available`, `sold_out_until`, `category_id`, `price_updated_at`, `source`, `is_demo`).

- `menu_item_tags` → `tags` (dietary: vegan, gluten-free, halal, pork-free, contains-nuts…) with `source`.
- `menu_item_nutrition`: calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g, `provenance` (`verified/provider/estimated`), `source`, `as_of`.
- `menu_item_price_history`: every price change (business edit history, spec §36).
- `menu_item_availability` folded into `menus.schedule` + `menu_items.is_available`, since a separate table added no value.

## Ratings (Phase 3) 🧭

| Table | Notes |
|---|---|
| `rating_dimensions` | Data-driven sub-scores per item type (`taste`, `value`, `portion`, `presentation`, `strength` for cocktails). Spec §11 "do not force irrelevant categories." |
| `item_reviews` | user, menu_item, `overall numeric(3,1)` 0–10, `order_again` (`absolutely/maybe/no`), text, `visited_on`, `is_verified_visit`, `credibility_weight`, `status` (moderation), `deleted_at`. One active review per user per item per visit day. |
| `venue_reviews` | Venue experience: service, aesthetic, value, atmosphere, cleanliness, wait time; nightlife adds bartender, drink value, music, crowd, lounge. |
| `review_scores` | `(review_type, review_id, dimension_id, score)`. Replaces spec's `review_category_scores`, shared by item and venue reviews. |
| `review_photos` | Storage path, moderation status. |
| `service_feedback` | Vibe Check chips (`friendly`, `attentive`, `fast`, `knowledgeable`, `welcoming` + negatives) as rows. Aggregated into Service Vybe. |
| `aesthetic_feedback` | Aesthetic tag votes (upscale, cozy, rooftop…). |
| `staff_profiles` | Optional verified bartender profiles linked by the business. First name / handle only. |

Businesses have **no** write policy on any review table. Business replies live in `review_responses`.

## Saves and collections (Phase 3) 🧭

`collections` (user, name, `system_kind` `favorites/want_to_try/null`) → `collection_items` (polymorphic via `business_id` xor `menu_item_id` with CHECK). Spec's `saves` table is folded into collection_items. "Favorite Wings" is inferred by joining saved items to their category, with user overrides in `profile_highlights`.

## Charts and ranking (Phase 4) 🧭

| Table | Notes |
|---|---|
| `ranking_categories` | slug, title, `subject` (`item/venue`), `category_id` or a rule jsonb (e.g. Top Happy Hour), `min_ratings`, `is_active`. |
| `ranking_scopes` | `national`, `region`, `city`, `near_me` (near-me computed on read from city/regional entries). |
| `ranking_runs` | One per recompute: `algorithm_version`, params, started/finished. |
| `ranking_entries` | `run_id, category_id, scope, scope_key, subject_id, rank, score, bayes_mean, rating_count, confidence, explanation jsonb`. Current run flagged per category/scope. History = older runs (spec's `ranking_snapshots`). |
| `rating_flags` | Suspicious-activity signals feeding penalties. |

Promotions (`promotions`, `promotion_placements`) live in separate tables and are never joined into ranking computation.

## Social and taste (Phase 5) 🧭

`taste_preferences` (user, `dimension` e.g. cuisine/protein/drink/atmosphere, `category_id` or value, `polarity` like/avoid, `strength`, `source` `explicit/inferred`, `confidence`) · `dietary_restrictions` (user, tag_id, `severity` `hard/soft`, `share_with_group` boolean) · `taste_match_snapshots` (user_a < user_b, score, breakdown, version).

## Link Ups and Group Vybe (Phase 6) 🧭

`linkups` (host, title, starts_at, area center/radius, occasion, intent, service modes) · `linkup_members` (status invited/accepted/declined) · `linkup_member_prefs` (per-outing food/drink/combined budget cents, mood overrides; spec's `linkup_preferences` + `linkup_budgets` merged) · `group_vybe_runs` (version, inputs hash) · `linkup_candidates` (location, score, cost estimate range) · `linkup_candidate_reasons` (kind `match/issue/exclusion`, `severity` `hard/soft`, text, `subject_member_id` nullable, `is_private`).

Realtime: `linkup_members`, `linkup_candidates` published for live updates.

## Health (Phase 8) 🧭

`health_profiles`, `nutrition_goals`, `meal_logs`, `meal_log_items`, `activity_summaries` (source `manual/healthkit/health_connect`), `health_connections`. Owner-only RLS; no other policy exists.

## Billing (Phase 9) 🧭

`plans` (code, audience consumer/business, stripe price ids) · `subscriptions` (subject user or business, status, period end, stripe ids) · `entitlements` (plan → feature key) · `stripe_events` (idempotency). Written only by the webhook handler with the secret key.

## Notifications, moderation 🧭

`notifications` (user, kind, payload, read_at) · `reports` (reporter, target, reason) · `moderation_actions` (admin, target, action, note).

## Phase 1 security summary ✅ (tested in `supabase/tests/`)

| Table | anon | authenticated | business member | admin |
|---|---|---|---|---|
| profiles | public profiles | own; public; friends-only if friends | – | all |
| privacy_settings / user_settings | – | own only | – | – |
| user_roles | – | own rows (read) | – | read; writes via SQL only |
| friendships | – | rows they're in; send as requester; addressee accepts or declines | – | – |
| businesses / locations | active only | active only | read own even if pending; edit profile fields | all, incl. status and claim flags |
| business_members | – | own memberships | same business | all |
| business_claims | – | create own, read own | – | read all; approve/reject via RPC |
| audit_logs | – | – | – | read |

## Running migrations

- **Real Supabase:** `supabase link` then `supabase db push`. Seed with `supabase db reset` locally.
- **Offline check:** `scripts/test-db.sh` spins up a throwaway Postgres, installs a minimal Supabase auth shim, applies every migration and seed, and runs the SQL security tests.

## Vybe Map + Link Ups (20260930000100, 20260930000200)
- `cities` (7 launch cities, bounds for the map), `business_locations.city_slug`, `businesses.logo_url`, `user_settings.city_slug`
- `business_hours` (weekday 0 = Sunday; `closes_at <= opens_at` means past midnight)
- `vybe_statuses` (one per user, friends read while active, max 12 hours)
- `linkups`, `linkup_members`, `linkup_invites` (only the sha256 of each guest token is stored), `linkup_messages`
- RPCs: `join_linkup`, `leave_linkup`, `respond_to_request`, `remove_member`, `invite_to_linkup`, `create_guest_invite`, `revoke_guest_invite`, `guest_view_invite`, `guest_accept_invite`, `guest_decline_invite`, `guest_messages`, `guest_send_message`, `linkup_chat`, `linkup_spots`, `purge_ended_linkup_chats` (pg_cron every 10 minutes)

## Expansion (20261002000100–400)
- **Menus & ratings:** `menu_items` (category food/drink, dish_type for charts, sold_out_until), `item_ratings` (0–10, free), `place_ratings` (overall, Service Vybe, value, aesthetic; not your own place), views `menu_item_stats`, `place_stats`.
- **Food intelligence (MAX):** `menu_item_intel` (recipe_level: verified_recipe / verified_ingredients / preparation_info / vybr8_estimate / unknown, disclosure switches, kitchen note, labeled estimate), `menu_item_ingredients`, `menu_item_nutrition` (source: verified / restaurant_provided / database_provided / estimated / unknown). Only editors read these tables; everyone else goes through `item_deep_dive(item)` which applies plan + disclosure. `item_swaps(item)` powers Better Swap.
- **Personal nutrition:** `nutrition_targets`, `food_logs` (owner only).
- **Plans & entitlements:** `plans`, `plan_entitlements`, `user_subscriptions`, `business_subscriptions`; `my_plan()`, `business_plan_info()`, `grant_plan()` (admins, until Stripe), private `viewer_can(key)`, `business_can(business, key)`. `promotion_campaigns` (always labeled; only the team activates; never affects scores/rank).
- **Chefs:** `chef_profiles` (+ specialties, services, service_areas, portfolio, packages, availability, verifications), `chef_business_relationships` (role, start/end, source; "current" is computed), `chef_menu_item_attributions` (only businesses/team credit dishes), `chef_reviews` (service reviews; not for restaurant visits), view `chef_review_stats`.
- **Food trucks:** businesses with kind `food_truck` + `food_truck_profiles`, `food_truck_schedules` (time windows, status, source), `food_truck_live_status` (WE'RE HERE, max 8h), `food_truck_follows` (notify → in-app alerts), `food_trucks_in_city()`.

## Groups & family (20261003000100)
`groups` (kind family / dating / friends / organization / ftk; size limits; dating 2 people 18+), `group_members` (user **or** kid profile, role owner/admin/member, status invited/active, relationship), `dependents` + `dependent_guardians` (kid profiles), `taste_profiles` (user or kid), `group_plans` + `group_plan_picks` (no alcohol picks for kids or under-21s), `dependent_transfers` (hashed one-time codes). RPCs `create_dependent_transfer`, `redeem_dependent_transfer`. Invites raise in-app alerts.
