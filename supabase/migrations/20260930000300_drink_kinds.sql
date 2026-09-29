-- VYBR8 · Non-alcohol drink spots (all ages): tea & matcha, juice & lemonade.
-- Coffee shops use the existing 'cafe' kind. Only alcohol content stays 21+.
alter type public.business_kind add value if not exists 'tea_shop';
alter type public.business_kind add value if not exists 'juice_bar';
