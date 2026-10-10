# VYBR8 — REAL RESTAURANT MENUS, verified first batch

Updated 2026-10-10. **64 actual sourced menu items** from **7 location/platform listings** plus one official PDF source. **6 of 11 target markets have priced entries; 5 do not yet.** This is a partial replacement, not a completed 3,582-restaurant database.

## Contents
- `verified_menu_items.csv` and `.json`: real published item names and observed prices, each with source URL, platform, verification date, category.
- `restaurants_sources.csv` and `.json`: location/platform references.
- `markets_status.json`: explicit coverage gaps.
- `supabase_staging.sql`: staging tables and safe COPY-style import guidance.

## Data quality rules
1. Prices are observations, not live guaranteed prices; DoorDash and Uber Eats prices may differ from pickup or dine-in prices.
2. Records marked `starting_at` are from a published $X+ listing, not a fixed final price.
3. Restaurant photos **are not included**; no rights to republish source images were established. `photo_url` is intentionally empty.
4. No fabricated restaurant-specific dishes, photos, ingredients, calories, dietary claims, cocktails, or atmosphere labels.
5. Preserve platform and location as part of uniqueness. Different Midwood location/platform records are intentionally separate.
6. The 5 markets without priced records (Atlanta, Houston, Los Angeles, Brooklyn, Phoenix — check `markets_status.json` for exact gaps) are not filled with guesses.
7. Do not present this file as a full menu for any restaurant; it is a verified *sample* of actual menu items.

## Source priority
Restaurant official menu > restaurant online ordering > DoorDash/Uber Eats, retaining price type and platform. Before displaying in production, refresh prices and confirm any applicable platform terms, rights, and access.
