-- VYBR8 menu import staging; import verified_menu_items.csv through Supabase CSV import.
create table if not exists public.vybr8_menu_items_staging (
  restaurant_id text not null, city text not null, restaurant text not null,
  category text, item_name text not null, price_usd text, price_type text,
  platform text not null, source_url text not null, verified_date date,
  photo_url text, photo_status text, description text, currency text default 'USD'
);
-- Keep staging separate from canonical menu data until restaurant identity and prices are reviewed.
