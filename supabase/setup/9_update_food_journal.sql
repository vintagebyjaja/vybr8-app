-- VYBR8 · UPDATE: run this ONCE after file 8. Adds the food & drink journal ("Have you already ate?") to Active Vybe.

-- ═════ 20261008000100_food_journal.sql ═════
-- VYBR8 · "Have you already ate?" food & drink journal on Active Vybe
--
-- Anyone can jot down what they ate and drank today, with or without a VYBR8 dish:
-- water (ounces), any drink, any food, and when (early morning … midnight munch).
-- Rows live in food_logs, which is already owner-only (never shared).

alter table public.food_logs
  add column kind      text not null default 'food' check (kind in ('food', 'drink', 'water')),
  add column time_slot text check (time_slot in (
    'early_morning', 'before_work', 'morning', 'breakfast', 'lunch', 'happy_hour', 'dinner', 'late_night_snack', 'midnight_munch')),
  add column day       date,                                                  -- the day it counts toward (the person's local day)
  add column amount    text check (amount is null or char_length(trim(amount)) between 1 and 40),   -- "2 slices", "a big bowl"
  add column ounces    numeric(5,1) check (ounces is null or (ounces > 0 and ounces <= 200)),
  add check (kind <> 'water' or ounces is not null);

create index food_logs_user_date_idx on public.food_logs (user_id, day);
