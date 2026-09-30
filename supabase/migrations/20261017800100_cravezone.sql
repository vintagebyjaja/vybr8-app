-- VYBR8 · CraveZone · Phase CZ-1 (taxonomy, item tags, search, results, map)
--
-- "I know what kind of thing I want, but not where to get it." CraveZone finds ITEMS that hit a craving,
-- then places that can hit it when no menu is on VYBR8 yet. Everything here works without AI.
-- The craving taxonomy lives in the database (craving_categories), never hard-coded in React.
-- See CRAVEZONE.md for the full design, privacy rules and later phases.

-- ── Taxonomy ───────────────────────────────────────────────────────────
create table public.craving_categories (
  id              smallint generated always as identity primary key,
  slug            text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  name            text not null check (char_length(name) between 2 and 40),
  emoji           text not null check (char_length(emoji) <= 8),
  tone            text not null default 'coral' check (tone in ('orange', 'coral', 'pink', 'mint', 'sky', 'lavender', 'gold')),
  sort_order      smallint not null default 100,
  active          boolean not null default true,
  indulgent       boolean not null default false,          -- Big Back Mode leans into these
  light           boolean not null default false,          -- "not too heavy" leans into these
  item_keywords   text[] not null default '{}',            -- whole words/phrases matched in item name, description, dish type
  exclude_keywords text[] not null default '{}',           -- "hot dog" is not spicy
  search_terms    text[] not null default '{}',            -- extra words people type ("sweet tooth")
  place_cuisines  text[] not null default '{}',            -- OpenStreetMap / VYBR8 cuisine tags
  place_kinds     text[] not null default '{}',            -- business kinds that always fit (bakery → bakery)
  place_name_keywords text[] not null default '{}',        -- "creamery", "donut"
  created_at      timestamptz not null default now()
);
alter table public.craving_categories enable row level security;
create policy "craving_categories: everyone reads active" on public.craving_categories for select to anon, authenticated
  using (active or private.is_staff());
create policy "craving_categories: team edits" on public.craving_categories for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

insert into public.craving_categories (slug, name, emoji, tone, sort_order, indulgent, light, item_keywords, exclude_keywords, search_terms, place_cuisines, place_kinds, place_name_keywords) values
  ('chocolate', 'Chocolate', '🍫', 'orange', 10, true, false,
    '{chocolate,choc,brownie,brownies,cocoa,fudge,mocha,oreo,oreos,smores,s''mores,lava cake,nutella,ganache,devil''s food}', '{white wine}',
    '{chocolatey,chocolaty}', '{chocolate}', '{}', '{chocolate,chocolatier,cocoa}'),
  ('cookies', 'Cookies', '🍪', 'gold', 20, true, false,
    '{cookie,cookies,snickerdoodle,snickerdoodles,macaron,macarons,biscotti,shortbread,chocolate chip}', '{}',
    '{}', '{cookie,cookies}', '{}', '{cookie,cookies,crumbl,insomnia}'),
  ('ice_cream', 'Ice Cream', '🍨', 'pink', 30, true, false,
    '{ice cream,gelato,sundae,sundaes,milkshake,milkshakes,shake,shakes,soft serve,frozen custard,custard,froyo,frozen yogurt,banana split,float,affogato,ice cream sandwich}', '{protein shake}',
    '{icecream,ice-cream,scoop,cone}', '{ice_cream,frozen_yogurt,gelato,frozen_custard}', '{}', '{ice cream,creamery,gelato,gelateria,frozen yogurt,froyo,custard,scoops,dairy bar}'),
  ('fruity', 'Fruity', '🍓', 'pink', 40, false, true,
    '{strawberry,strawberries,berry,berries,blueberry,raspberry,mango,pineapple,peach,peaches,lemon,lime,fruit,fruity,cherry,watermelon,passion fruit,guava,acai,açaí,kiwi,banana,citrus,orange,grapefruit,pomegranate,dragon fruit,coconut}', '{orange chicken}',
    '{fruits}', '{juice,acai,fruit}', '{juice_bar}', '{fruit,juice,acai}'),
  ('salty', 'Salty', '🍟', 'gold', 50, true, false,
    '{fries,french fries,chips,pretzel,pretzels,popcorn,salted,pickle,pickles,nachos,tots,tater tots,jerky,edamame,salt,potato chips,pork rinds,olives,anchovy}', '{salted caramel}',
    '{salt,savory snack}', '{}', '{}', '{}'),
  ('crunchy', 'Crunchy', '🥨', 'gold', 60, false, false,
    '{crispy,crunchy,crunch,chips,tostada,tostadas,pretzel,pretzels,nachos,tempura,katsu,brittle,onion rings,popcorn,crisps,croquettes,crackers,granola,taquitos,flautas,egg rolls,spring rolls,chicharron,chicharrones}', '{}',
    '{crisp}', '{}', '{}', '{}'),
  ('cheesy', 'Cheesy', '🧀', 'gold', 70, true, false,
    '{cheese,cheesy,mac and cheese,mac & cheese,mac n cheese,queso,quesadilla,quesadillas,quesabirria,pizza,parmesan,parm,mozzarella,cheesesteak,philly,grilled cheese,fondue,nachos,cheddar,provolone,burrata,raclette,cheese curds}', '{cheesecake}',
    '{cheese pull}', '{pizza}', '{}', '{pizza,pizzeria,cheesesteak}'),
  ('sweet', 'Sweet', '🍰', 'pink', 80, true, false,
    '{dessert,desserts,cake,cakes,pie,cheesecake,donut,doughnut,donuts,cookie,brownie,candy,caramel,honey,syrup,pancakes,waffle,waffles,cinnamon roll,churro,churros,pudding,banana pudding,cobbler,tres leches,sweet,cupcake,cupcakes,beignet,beignets,sundae,milkshake,crepe,crepes,tiramisu,flan,baklava,funnel cake,peach cobbler,sweet potato pie}', '{sweet potato fries,sweet and sour,sweet chili,sweet tea}',
    '{sweets,sweet tooth,sugar,sugary,treat,treats,dessert}', '{dessert,donut,ice_cream,cake,pastry,crepe,frozen_yogurt,chocolate,cupcake}', '{bakery}', '{dessert,desserts,sweets,cake,cakes,donut,donuts,doughnut,bakery,creamery,pastry,patisserie,pie}'),
  ('spicy', 'Spicy', '🌶️', 'orange', 90, false, false,
    '{spicy,hot,jalapeno,jalapeño,habanero,sriracha,buffalo,cajun,nashville hot,chili,chile,chilli,curry,jerk,szechuan,sichuan,gochujang,diablo,harissa,ghost pepper,scotch bonnet,chipotle,peri peri,piri piri,vindaloo,mala,hot honey,lemon pepper hot,firecracker,inferno}', '{hot dog,hot dogs,hot chocolate,hot tea,hot cocoa,hot fudge,sweet chili}',
    '{heat,fire,fiery,kick}', '{thai,indian,sichuan,szechuan,korean,jamaican,caribbean,cajun,hot_chicken,szechuan,hunan,ethiopian}', '{}', '{hot chicken,spice,jerk}'),
  ('savory', 'Savory', '🍔', 'orange', 100, false, false,
    '{burger,burgers,steak,sandwich,sandwiches,wings,chicken,bbq,barbecue,brisket,ribs,pork,sausage,bacon,meatball,meatballs,gyro,shawarma,taco,tacos,birria,oxtail,lamb,short rib,pastrami,philly,sliders,hot dog,hot dogs}', '{}',
    '{meaty,meat,umami,hearty}', '{burger,bbq,barbecue,steak_house,sandwich,chicken,wings,american,mexican,tacos,korean_bbq,hot_dog}', '{}', '{burger,grill,bbq,barbecue,steakhouse,smokehouse,taco,wings}'),
  ('comfort', 'Comfort Food', '🍝', 'coral', 110, true, false,
    '{mac and cheese,mac & cheese,pasta,lasagna,fried chicken,mashed potatoes,pot pie,soup,chili,meatloaf,grits,gumbo,ramen,pho,collard greens,biscuits,biscuit,casserole,spaghetti,alfredo,dumplings,oxtail,chicken and waffles,shrimp and grits,jambalaya,etouffee,dressing,cornbread,yams,candied yams,smothered,pot roast,chicken and dumplings,baked ziti}', '{}',
    '{comfort,cozy,homestyle,home cooking,soul food,feel good}', '{soul_food,southern,italian,ramen,noodle,comfort_food,cajun,creole,pho,vietnamese,diner}', '{}', '{soul,southern,kitchen,diner,mama,grandma,big mama,cafe}'),
  ('cold_refreshing', 'Cold & Refreshing', '🧊', 'sky', 120, false, true,
    '{iced,frozen,slush,slushie,slushy,smoothie,lemonade,agua fresca,boba,bubble tea,frappe,frappuccino,cold brew,shaved ice,italian ice,sorbet,popsicle,paleta,paletas,float,snow cone,granita,iced tea,sweet tea}', '{}',
    '{cold,refreshing,cool,chilled,icy,freezing,cool off,cool down}', '{bubble_tea,juice,frozen_yogurt,shaved_ice,smoothie,ice_cream}', '{juice_bar,tea_shop}', '{ice,boba,tea,juice,smoothie,paleteria}'),
  ('breakfast', 'Breakfast', '🥞', 'gold', 130, false, false,
    '{pancake,pancakes,waffle,waffles,french toast,omelet,omelette,eggs,egg,bacon,biscuit,biscuits,grits,hash brown,hash browns,breakfast,brunch,chicken and waffles,bagel,bagels,breakfast burrito,benedict,frittata,breakfast sandwich,shrimp and grits,salmon croquettes}', '{egg rolls,egg roll}',
    '{brunch,morning}', '{breakfast,brunch,pancake,bagel,diner}', '{}', '{breakfast,brunch,pancake,waffle,diner,biscuit,bagel,egg}'),
  ('candy', 'Candy', '🍬', 'pink', 140, true, false,
    '{candy,candies,gummy,gummies,lollipop,toffee,brittle,caramel corn,cotton candy,fudge,taffy,sour candy,chocolate bar,truffles,pralines,praline}', '{}',
    '{sour,sugar rush}', '{candy,confectionery}', '{}', '{candy,sweets,confection,confectionery,sweet shop}'),
  ('bakery', 'Bakery', '🍩', 'gold', 150, true, false,
    '{donut,doughnut,donuts,doughnuts,croissant,croissants,muffin,muffins,scone,scones,pastry,pastries,danish,bread,bagel,cinnamon roll,cinnamon rolls,cupcake,cupcakes,pie,kolache,kolaches,beignet,beignets,eclair,cake,pound cake,pan dulce,concha,empanada}', '{}',
    '{baked,fresh baked,baked goods}', '{bakery,donut,pastry,cake,bagel,cupcake}', '{bakery}', '{bakery,bake,baked,donut,donuts,doughnut,pastry,patisserie,boulangerie,panaderia,bagel,cake}'),
  ('smoothies', 'Smoothies', '🥤', 'mint', 160, false, true,
    '{smoothie,smoothies,acai bowl,açaí bowl,juice,fresh juice,protein shake,green juice,blend,shake}', '{milkshake}',
    '{smoothy}', '{juice,smoothie,acai}', '{juice_bar}', '{smoothie,juice,acai,tropical smoothie}'),
  ('fried', 'Fried', '🍗', 'orange', 170, true, false,
    '{fried,fries,wings,tenders,nuggets,fish fry,catfish,whiting,fried chicken,onion rings,hush puppies,tempura,corn dog,funnel cake,beignet,fritter,fritters,chicharron,fried fish,fried shrimp,fried okra,fried pickles,country fried,chicken fried,egg rolls,mozzarella sticks}', '{stir fried,stir-fried,fried rice}',
    '{greasy,deep fried}', '{chicken,fried_chicken,wings,fish_and_chips,hot_chicken}', '{}', '{fried,chicken,wings,fish,wingstop,popeyes}'),
  ('fresh', 'Fresh', '🥗', 'mint', 180, false, true,
    '{salad,salads,bowl,poke,fresh,grilled,veggie,vegetable,vegetables,greens,wrap,ceviche,sushi,sashimi,spring roll,fruit cup,hummus,quinoa,kale,grain bowl,lettuce wrap,avocado,tabbouleh,fattoush}', '{}',
    '{healthy,healthier,light,lighter,clean,not heavy}', '{salad,poke,healthy,vegan,vegetarian,mediterranean,sushi,greek,lebanese}', '{}', '{salad,fresh,poke,sweetgreen,cava,greens,healthy}'),
  ('creamy', 'Creamy', '🥛', 'lavender', 190, true, false,
    '{creamy,cream,alfredo,cheesecake,custard,pudding,milkshake,latte,mac and cheese,queso,mousse,gelato,panna cotta,banana pudding,cream cheese,carbonara,bisque,chowder,tres leches}', '{}',
    '{smooth,rich}', '{}', '{}', '{creamery}');

-- ── Item tags (auto from keywords, or set by the owner / VYBR8 Team) ──
create table public.menu_item_craving_tags (
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  category_id   smallint not null references public.craving_categories (id) on delete cascade,
  confidence    numeric(3,2) not null default 0.6 check (confidence between 0 and 1),
  source        text not null default 'keyword' check (source in ('keyword', 'owner', 'team', 'ai')),
  created_at    timestamptz not null default now(),
  primary key (menu_item_id, category_id)
);
create index menu_item_craving_tags_category_idx on public.menu_item_craving_tags (category_id, confidence desc);
alter table public.menu_item_craving_tags enable row level security;
create policy "menu_item_craving_tags: visible with the item" on public.menu_item_craving_tags for select to anon, authenticated
  using (exists (select 1 from public.menu_items m where m.id = menu_item_id));
create policy "menu_item_craving_tags: owners and team tag" on public.menu_item_craving_tags for all to authenticated
  using (private.is_staff() or private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id)))
  with check ((private.is_staff() and source in ('team', 'owner'))
              or (source = 'owner' and private.can_edit_business((select m.business_id from public.menu_items m where m.id = menu_item_id))));

-- Whole-word, case-insensitive: does `hay` mention any of `words`?
create or replace function private.mentions_any(hay text, words text[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(cardinality(words), 0) > 0 and hay is not null and hay ~* (
    '(^|[^[:alnum:]])(' || array_to_string(array(select regexp_replace(w, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') from unnest(words) w), '|') || ')($|[^[:alnum:]])');
$$;

-- Re-tag one item from its name, description and dish type. Owner/team tags are never touched.
create or replace function private.tag_menu_item(p_item uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare m public.menu_items;
begin
  select * into m from public.menu_items where id = p_item;
  delete from public.menu_item_craving_tags where menu_item_id = p_item and source = 'keyword';
  if m.id is null then return; end if;
  insert into public.menu_item_craving_tags (menu_item_id, category_id, confidence, source)
  select m.id, c.id,
         case when private.mentions_any(m.name, c.item_keywords) or private.mentions_any(replace(coalesce(m.dish_type, ''), '-', ' '), c.item_keywords) then 0.9
              else 0.6 end,
         'keyword'
    from public.craving_categories c
   where c.active
     and (private.mentions_any(m.name || ' ' || replace(coalesce(m.dish_type, ''), '-', ' '), c.item_keywords)
          or private.mentions_any(m.description, c.item_keywords))
     and not private.mentions_any(m.name || ' ' || coalesce(m.description, ''), c.exclude_keywords)
  on conflict (menu_item_id, category_id) do nothing;
end;
$$;

create or replace function private.menu_items_craving_tag()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.tag_menu_item(new.id);
  return new;
end;
$$;
create trigger menu_items_craving_tag after insert or update of name, description, dish_type on public.menu_items
  for each row execute function private.menu_items_craving_tag();

-- Tag everything already on VYBR8.
do $$ begin perform private.tag_menu_item(id) from public.menu_items; end $$;

-- Team can re-run tagging after editing the taxonomy.
create or replace function public.retag_cravings()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer := 0; r record;
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  for r in select id from public.menu_items loop perform private.tag_menu_item(r.id); n := n + 1; end loop;
  return n;
end;
$$;
revoke execute on function public.retag_cravings() from public, anon;
grant execute on function public.retag_cravings() to authenticated;

-- ── Open now (shared helper) ───────────────────────────────────────────
create or replace function private.location_open_now(p_loc uuid, p_tz text)
returns boolean
language sql stable
set search_path = ''
as $$
  select case when count(*) = 0 then null else bool_or(
      (h.opens_at < h.closes_at and h.weekday = extract(dow from (now() at time zone p_tz))::int
         and (now() at time zone p_tz)::time >= h.opens_at and (now() at time zone p_tz)::time < h.closes_at)
      or (h.opens_at >= h.closes_at and (
           (h.weekday = extract(dow from (now() at time zone p_tz))::int and (now() at time zone p_tz)::time >= h.opens_at)
        or (h.weekday = (extract(dow from (now() at time zone p_tz))::int + 6) % 7 and (now() at time zone p_tz)::time < h.closes_at))))
    end
    from public.business_hours h where h.location_id = p_loc;
$$;

-- ── Saved cravings (items), owner only ─────────────────────────────────
create table public.saved_menu_items (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, menu_item_id)
);
alter table public.saved_menu_items enable row level security;
create policy "saved_menu_items: owner only" on public.saved_menu_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Search: items that hit the craving ─────────────────────────────────
-- Runs as the viewer, so RLS applies (alcohol stays behind the Pours rule; Never-again places are skipped).
create or replace function public.crave_items(
  p_city        text,
  p_cravings    text[] default '{}',       -- category slugs; more matched = ranked higher
  p_exclude     text[] default '{}',
  p_q           text default null,          -- free text ("birria"), matched on item name/description
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_open_now    boolean default false,
  p_max_price_cents integer default null,
  p_kinds       text[] default null,
  p_badge       text default null,
  p_local_only  boolean default false,
  p_saved_only  boolean default false,
  p_limit       integer default 40
)
returns table (
  item_id uuid, item_name text, description text, price_cents integer, category text,
  business_id uuid, slug text, business_name text, branch_name text, kind text, logo_url text,
  lat numeric, lng numeric, meters double precision, open_now boolean,
  avg_score numeric, rating_count integer, matched text[], match_weight numeric, item_saved boolean, place_saved boolean,
  indulgent boolean, light boolean
)
language sql stable
set search_path = ''
as $$
  with c as (select * from public.cities where slug = p_city),
  wanted as (select id, slug, indulgent, light from public.craving_categories where active and slug = any (coalesce(p_cravings, '{}'))),
  blocked as (select id from public.craving_categories where slug = any (coalesce(p_exclude, '{}'))),
  q as (select nullif(trim(p_q), '') as text),
  cand as (
    select m.id, m.name, m.description, m.price_cents, m.category::text as category, m.business_id
      from public.menu_items m
     where m.is_available and (m.sold_out_until is null or m.sold_out_until < now())
       and (p_max_price_cents is null or (m.price_cents is not null and m.price_cents <= p_max_price_cents))
       and (
         exists (select 1 from public.menu_item_craving_tags t join wanted w on w.id = t.category_id where t.menu_item_id = m.id)
         or ((select text from q) is not null and (m.name ilike '%' || (select text from q) || '%' or m.description ilike '%' || (select text from q) || '%'))
       )
       and not exists (select 1 from public.menu_item_craving_tags t join blocked b on b.id = t.category_id where t.menu_item_id = m.id)
  ),
  placed as (
    select cand.*, b.slug::text as slug, b.name as business_name, b.branch_name, b.kind::text as kind, b.logo_url,
           l.id as loc, coalesce(l.timezone, (select timezone from c)) as tz, l.latitude, l.longitude,
           case when l.latitude is null then null
                else private.meters_between(l.latitude, l.longitude, coalesce(p_lat, (select center_lat from c)), coalesce(p_lng, (select center_lng from c))) end as meters
      from cand
      join public.businesses b on b.id = cand.business_id and b.status = 'active' and b.deleted_at is null
      left join public.business_locations l on l.business_id = b.id and l.is_primary
      left join public.food_truck_profiles ft on ft.business_id = b.id
     where (l.city_slug = p_city or ft.home_city_slug = p_city)
       and (p_kinds is null or b.kind::text = any (p_kinds))
       and (not p_local_only or b.brand_id is null)
       and (p_badge is null or exists (select 1 from public.place_badges pb where pb.business_id = b.id and pb.badge = p_badge and pb.status = 'verified'))
       and not exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = b.id and pl.list = 'never')
       and (not p_saved_only or exists (select 1 from public.saved_menu_items s where s.user_id = (select auth.uid()) and s.menu_item_id = cand.id))
  ),
  scored as (
    select p.*,
           case when p.loc is null then null else private.location_open_now(p.loc, p.tz) end as open_now,
           st.avg_score, coalesce(st.rating_count, 0) as rating_count,
           coalesce((select array_agg(w.slug order by w.slug) from public.menu_item_craving_tags t join wanted w on w.id = t.category_id where t.menu_item_id = p.id), '{}') as matched,
           coalesce((select sum(t.confidence) from public.menu_item_craving_tags t join wanted w on w.id = t.category_id where t.menu_item_id = p.id), 0) as match_weight,
           exists (select 1 from public.menu_item_craving_tags t join public.craving_categories cc on cc.id = t.category_id where t.menu_item_id = p.id and cc.indulgent) as indulgent,
           exists (select 1 from public.menu_item_craving_tags t join public.craving_categories cc on cc.id = t.category_id where t.menu_item_id = p.id and cc.light) as light
      from placed p
      left join public.menu_item_stats st on st.menu_item_id = p.id
  )
  select s.id, s.name, s.description, s.price_cents, s.category,
         s.business_id, s.slug, s.business_name, s.branch_name, s.kind, s.logo_url,
         s.latitude, s.longitude, round(s.meters::numeric)::double precision, s.open_now,
         s.avg_score, s.rating_count, s.matched, s.match_weight,
         exists (select 1 from public.saved_menu_items sv where sv.user_id = (select auth.uid()) and sv.menu_item_id = s.id),
         exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = s.business_id and pl.list = 'saved'),
         s.indulgent, s.light
    from scored s
   where not p_open_now or s.open_now is true
   order by s.match_weight desc, s.avg_score desc nulls last, s.meters asc nulls last
   limit least(greatest(coalesce(p_limit, 40), 1), 120);
$$;
grant execute on function public.crave_items(text, text[], text[], text, numeric, numeric, boolean, integer, text[], text, boolean, boolean, integer) to anon, authenticated;

-- ── Search: places that can hit the craving (for spots without a menu on VYBR8 yet) ──
create or replace function public.crave_places(
  p_city        text,
  p_cravings    text[] default '{}',
  p_q           text default null,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_open_now    boolean default false,
  p_kinds       text[] default null,
  p_badge       text default null,
  p_local_only  boolean default false,
  p_max_price_level smallint default null,
  p_limit       integer default 40
)
returns table (
  business_id uuid, slug text, name text, branch_name text, kind text, cuisines text[], price_level smallint, logo_url text,
  address text, lat numeric, lng numeric, meters double precision, open_now boolean,
  rating numeric, ratings integer, matched text[], has_menu boolean, place_saved boolean
)
language sql stable
set search_path = ''
as $$
  with c as (select * from public.cities where slug = p_city),
  wanted as (select * from public.craving_categories where active and slug = any (coalesce(p_cravings, '{}'))),
  q as (select nullif(trim(p_q), '') as text),
  base as (
    select b.id, b.slug::text as slug, b.name, b.branch_name, b.kind::text as kind, b.cuisines, b.price_level, b.logo_url,
           l.id as loc, l.timezone, l.address_line1, l.latitude, l.longitude,
           private.meters_between(l.latitude, l.longitude, coalesce(p_lat, (select center_lat from c)), coalesce(p_lng, (select center_lng from c))) as meters,
           coalesce((select array_agg(w.slug order by w.sort_order) from wanted w
                      where b.kind::text = any (w.place_kinds)
                         or b.cuisines && w.place_cuisines
                         or private.mentions_any(b.name, w.place_name_keywords)), '{}') as matched
      from public.businesses b
      join public.business_locations l on l.business_id = b.id and l.is_primary
     where l.city_slug = p_city and l.latitude is not null
       and b.status = 'active' and b.deleted_at is null
       and (p_kinds is null or b.kind::text = any (p_kinds))
       and (not p_local_only or b.brand_id is null)
       and (p_max_price_level is null or b.price_level is null or b.price_level <= p_max_price_level)
       and (p_badge is null or exists (select 1 from public.place_badges pb where pb.business_id = b.id and pb.badge = p_badge and pb.status = 'verified'))
       and not exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = b.id and pl.list = 'never')
  ),
  hits as (
    select * from base
     where cardinality(matched) > 0
        or ((select text from q) is not null and (name ilike '%' || (select text from q) || '%'
            or array_to_string(cuisines, ' ') ilike '%' || replace((select text from q), ' ', '_') || '%'))
  ),
  scored as (
    select h.*, private.location_open_now(h.loc, h.timezone) as open_now, ps.overall as rating, coalesce(ps.rating_count, 0) as ratings
      from hits h left join public.place_stats ps on ps.business_id = h.id
  )
  select s.id, s.slug, s.name, s.branch_name, s.kind, s.cuisines, s.price_level, s.logo_url, s.address_line1, s.latitude, s.longitude,
         round(s.meters::numeric)::double precision, s.open_now, s.rating, s.ratings, s.matched,
         exists (select 1 from public.menu_items m where m.business_id = s.id),
         exists (select 1 from public.place_lists pl where pl.user_id = (select auth.uid()) and pl.business_id = s.id and pl.list = 'saved')
    from scored s
   where not p_open_now or s.open_now is true
   order by cardinality(s.matched) desc, (s.ratings > 0) desc, s.rating desc nulls last, s.meters asc
   limit least(greatest(coalesce(p_limit, 40), 1), 120);
$$;
grant execute on function public.crave_places(text, text[], text, numeric, numeric, boolean, text[], text, boolean, smallint, integer) to anon, authenticated;

-- ── Entitlements (see CRAVEZONE.md §29). Cycle privacy features are never paywalled. ──
insert into public.plan_entitlements (plan_code, entitlement)
select p.code, e.key
  from (values
    ('free', 'cravezone'), ('free', 'crave_map'), ('free', 'save_cravings'), ('free', 'crave_personalization'),
    ('plus', 'advanced_crave_filters'), ('plus', 'crave_history_insights'), ('plus', 'crave_nutrition_filters'),
    ('max', 'crave_deep_dive'), ('max', 'crave_goal_impact'), ('max', 'crave_make_it_work'), ('max', 'crave_better_swap'),
    ('max', 'adaptive_crave_meal_planning')
  ) as e(tier, key)
  join public.plans p on p.audience = 'consumer' and p.rank >= (select rank from public.plans where code = e.tier)
on conflict do nothing;
