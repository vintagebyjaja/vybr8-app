-- VYBR8 · "Ate out?" Log what you had from a restaurant's menu
--
-- Journal entries can remember which place the food came from, and anyone signed in can read a menu's
-- calories when the restaurant shared them (or VYBR8 labeled an estimate), the same rule as dish deep dives.
-- food_logs stays owner-only: the restaurant never sees who ate what.

alter table public.food_logs
  add column business_id uuid references public.businesses (id) on delete set null;

-- Calories per menu item for the "Ate out?" picker. Business-sourced numbers only when the business chose to show them.
create or replace function public.menu_calories(p_business uuid)
returns table (menu_item_id uuid, calories integer, source public.nutrition_source)
language sql stable security definer
set search_path = ''
as $$
  select m.id, n.calories, n.source
  from public.menu_items m
  join public.menu_item_nutrition n on n.menu_item_id = m.id and n.calories is not null
  left join public.menu_item_intel i on i.menu_item_id = m.id
  where m.business_id = p_business
    and exists (select 1 from public.businesses b where b.id = m.business_id and b.deleted_at is null)
    and (not m.is_alcoholic or private.viewer_has_pour_access() or coalesce(private.can_edit_business(m.business_id), false))
    and (n.source in ('estimated', 'database_provided', 'unknown') or coalesce(i.disclose_nutrition, false))
    and (select auth.uid()) is not null;
$$;
revoke execute on function public.menu_calories(uuid) from public, anon;
grant execute on function public.menu_calories(uuid) to authenticated;
