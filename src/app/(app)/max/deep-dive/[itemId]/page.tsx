import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@/domain/menus/menus";
import {
  NUTRITION_SOURCE_LABEL, RECIPE_LEVEL_LABEL, compareCalories, makeItWork, vybeCheck,
  type DayTotals, type NutritionSource, type RecipeLevel, type Targets,
} from "@/domain/nutrition/nutrition";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { can } from "@/server/entitlements";
import { logMenuItem, saveTargets } from "../../actions";

export const metadata = { title: "Deep Dive" };

type Dive = {
  item: { id: string; name: string; description: string | null; price_cents: number | null; category: string; is_alcoholic: boolean; business: { slug: string; name: string; kind: string } };
  score: { avg: number | null; count: number } | null;
  recipe_level: RecipeLevel;
  nutrition: ({ calories: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; fiber_g?: number | null; sodium_mg?: number | null; sugar_g?: number | null; source: NutritionSource; source_note: string | null }) | null;
  ingredients: { name: string; detail: string | null; source: RecipeLevel }[] | null;
  preparation: string[] | null;
  recipe: string | null;
  allergens: string[] | null;
  kitchen_note: string | null;
  estimate: string | null;
  source_note: string | null;
  chefs: { slug: string; name: string; type: string; source: string }[] | null;
  locked: string[];
  plan: "free" | "plus" | "max";
};

const ATTR: Record<string, string> = { creator: "Created by", executive_chef: "Executive Chef", head_chef: "Head Chef", featured_chef: "Featured Chef", collaborator: "In collaboration with" };
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5">
    <h2 className="font-display text-sm font-extrabold tracking-[0.15em] text-coral">{title}</h2>
    {children}
  </section>
);
const Source = ({ label }: { label: string }) => <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted">{label}</span>;

export default async function DeepDivePage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const supabase = await createClient();
  const [viewer, { data }] = await Promise.all([getViewer(), supabase.rpc("item_deep_dive", { p_item: itemId })]);
  const d = data as Dive | null;
  if (!d) notFound();

  const isMax = d.plan === "max";
  const [goalImpact, canTargets] = await Promise.all([can("goal_impact"), can("custom_nutrition_targets")]);
  let targets: Targets | null = null;
  let today: DayTotals | null = null;
  if (viewer && (goalImpact || canTargets)) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [{ data: t }, { data: logs }] = await Promise.all([
      supabase.from("nutrition_targets").select("goal, calories, protein_g, sodium_mg").eq("user_id", viewer.id).maybeSingle(),
      supabase.from("food_logs").select("calories, protein_g").eq("user_id", viewer.id).gte("logged_at", start.toISOString()),
    ]);
    targets = (t as Targets | null) ?? null;
    const rows = (logs ?? []) as { calories: number | null; protein_g: number | null }[];
    today = { meals: rows.length, calories: rows.reduce((a, r) => a + (r.calories ?? 0), 0), protein_g: rows.reduce((a, r) => a + Number(r.protein_g ?? 0), 0) };
  }
  const { data: swapRows } = isMax ? await supabase.rpc("item_swaps", { p_item: itemId }) : { data: [] };
  const swaps = (swapRows ?? []) as { id: string; name: string; business_name: string; price_cents: number | null; calories: number | null; nutrition_source: NutritionSource; avg_score: number | null; same_place: boolean }[];
  const n = d.nutrition;
  const level = RECIPE_LEVEL_LABEL[d.recipe_level];
  const fried = (d.preparation ?? []).some((s) => /fr(y|ied)/i.test(s)) || /fr(y|ies|ied)/i.test(d.item.name);
  const check = goalImpact && n ? vybeCheck(n, targets, today) : [];
  const lighter = swaps.find((s) => compareCalories({ calories: n?.calories ?? null, source: n?.source ?? "unknown" }, { calories: s.calories, source: s.nutrition_source })?.includes("fewer"));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Link href={`/venue/${d.item.business.slug}`} className="text-sm font-semibold text-muted hover:text-text">← {d.item.business.name}</Link>

      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-extrabold tracking-[0.2em] vybe-text">DEEP DIVE</p>
        <h1 className="text-3xl font-extrabold">{d.item.name}</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {d.score?.avg != null ? (
            <span><span className="font-display text-3xl font-extrabold vybe-text">{Number(d.score.avg).toFixed(1)}</span> <span className="text-xs font-bold tracking-wide text-muted">VYBR8 SCORE · {d.score.count} ratings</span></span>
          ) : <span className="text-sm text-faint">No VYBR8 score yet</span>}
          {d.item.price_cents != null && <span className="text-lg font-semibold">{formatCents(d.item.price_cents)}</span>}
          {n?.calories != null && <span className="text-sm text-muted">{n.calories} cal <Source label={NUTRITION_SOURCE_LABEL[n.source]} /></span>}
        </div>
        {d.item.description && <p className="text-muted">{d.item.description}</p>}
      </header>

      {!isMax && (
        <section className="vybe-ring flex flex-col gap-2 rounded-[var(--radius-card)] p-5">
          <p className="font-display text-lg font-extrabold">KNOW YOUR FOOD. <span className="vybe-text">KNOW YOUR VYBE.</span></p>
          <p className="text-sm text-muted">VYBR8 MAX shows what&rsquo;s in it, how it&rsquo;s made, the chef behind it, how it fits your goals and a better swap if you want one.</p>
          <Link href="/pricing" className="vybe-gradient self-start rounded-full px-5 py-2.5 text-sm font-bold text-ink">See VYBR8 MAX</Link>
        </section>
      )}

      {n && (
        <Section title="NUTRITION">
          {d.plan === "free" ? (
            <p className="text-sm">{n.calories != null ? `${n.calories} calories` : "Calories unknown"} · <span className="text-muted">Protein, carbs, fat and more are in VYBR8+.</span></p>
          ) : (
            <dl className="grid grid-cols-3 gap-3 text-center sm:grid-cols-4">
              {([["Calories", n.calories, ""], ["Protein", n.protein_g, "g"], ["Carbs", n.carbs_g, "g"], ["Fat", n.fat_g, "g"], ["Fiber", n.fiber_g, "g"], ["Sodium", n.sodium_mg, "mg"], ["Sugar", n.sugar_g, "g"]] as const).map(([k, v, u]) => (
                <div key={k} className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-faint">{k}</dt><dd className="font-bold">{v != null ? `${Number(v)}${u}` : "–"}</dd></div>
              ))}
            </dl>
          )}
          <p className="text-xs text-faint">Source: {NUTRITION_SOURCE_LABEL[n.source]}{n.source_note ? ` · ${n.source_note}` : ""}. Values can vary with portion and preparation.</p>
        </Section>
      )}

      {d.allergens && d.allergens.length > 0 && (
        <Section title="ALLERGENS">
          <p className="text-sm">{d.allergens.join(" · ")}</p>
          <p className="text-xs text-faint">From the kitchen. Always confirm with staff if you have an allergy.</p>
        </Section>
      )}

      {isMax && (
        <>
          <Section title="WHAT'S IN IT">
            {d.ingredients && d.ingredients.length ? (
              <ul className="flex flex-col gap-1 text-sm">{d.ingredients.map((g) => <li key={g.name}>{g.name}{g.detail ? <span className="text-muted"> · {g.detail}</span> : null}</li>)}</ul>
            ) : <p className="text-sm text-muted">The kitchen hasn&rsquo;t shared ingredients.</p>}
          </Section>

          <Section title="HOW IT'S MADE">
            {d.preparation && d.preparation.length ? (
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">{d.preparation.map((s) => <li key={s}>{s}</li>)}</ol>
            ) : d.estimate ? null : <p className="text-sm text-muted">The kitchen hasn&rsquo;t shared how it&rsquo;s made.</p>}
            {d.estimate && (
              <div className="rounded-xl border border-orange/40 bg-orange/5 p-3 text-sm">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-orange">VYBR8 ESTIMATE · not the restaurant&rsquo;s recipe</p>
                <p>{d.estimate}</p>
              </div>
            )}
            {d.recipe && <div className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{d.recipe}</div>}
          </Section>

          {(d.kitchen_note || (d.chefs && d.chefs.length > 0)) && (
            <Section title="FROM THE KITCHEN">
              {d.chefs?.map((c) => <p key={c.slug} className="text-sm"><span className="text-muted">{ATTR[c.type] ?? "Chef"}:</span> <Link href={`/chef/${c.slug}`} className="font-semibold text-sky">{c.name}</Link></p>)}
              {d.kitchen_note && <p className="text-sm">&ldquo;{d.kitchen_note}&rdquo;</p>}
            </Section>
          )}

          <Section title="RECIPE / INGREDIENT SOURCE">
            <p className="text-sm"><Source label={level.title} /> {level.line}</p>
            {d.source_note && <p className="text-xs text-faint">Shared by {d.source_note}</p>}
          </Section>

          <Section title="YOUR VYBE CHECK">
            {!viewer ? (
              <p className="text-sm text-muted"><Link href="/auth/sign-in" className="text-sky">Sign in</Link> to see how this fits your targets.</p>
            ) : !targets ? (
              <form action={saveTargets} className="flex flex-col gap-2 text-sm">
                <input type="hidden" name="itemId" value={itemId} />
                <p className="text-muted">Set your own daily targets to see how food fits. You can change them anytime.</p>
                <div className="flex flex-wrap gap-2">
                  <select name="goal" aria-label="Goal" className="min-h-10 rounded-xl border border-line bg-ink px-3">
                    <option value="maintain">Maintain</option><option value="weight_management">Weight management</option><option value="muscle_gain">Muscle gain</option><option value="performance">Performance</option><option value="custom">Custom</option>
                  </select>
                  <input name="calories" type="number" min={800} max={8000} required placeholder="Calories / day" aria-label="Calories per day" className="min-h-10 w-36 rounded-xl border border-line bg-ink px-3" />
                  <input name="protein_g" type="number" min={0} max={500} placeholder="Protein g" aria-label="Protein grams per day" className="min-h-10 w-28 rounded-xl border border-line bg-ink px-3" />
                  <input name="sodium_mg" type="number" min={0} max={10000} placeholder="Sodium mg (optional)" aria-label="Sodium milligrams per day" className="min-h-10 w-40 rounded-xl border border-line bg-ink px-3" />
                  <button className="vybe-gradient min-h-10 rounded-full px-4 font-bold text-ink">Save targets</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><b>{(today?.calories ?? 0).toLocaleString()}</b> / {targets.calories?.toLocaleString()} kcal</span>
                  {targets.protein_g ? <span><b>{Math.round(today?.protein_g ?? 0)}</b> / {targets.protein_g} g protein</span> : null}
                  <span className="text-muted">{today?.meals ? `${today.meals} logged today` : "Nothing logged today"}</span>
                </div>
                <ul className="flex flex-col gap-1 text-sm">{check.map((l) => <li key={l}>{l}</li>)}</ul>
              </>
            )}
          </Section>

          <Section title="MAKE IT WORK">
            <ul className="flex flex-col gap-1 text-sm">
              {makeItWork(d.item.name, n ?? {}, { fried, lowProteinToday: !!(targets?.protein_g && today && (today.protein_g ?? 0) < targets.protein_g) }).map((l) => <li key={l}>• {l}</li>)}
            </ul>
            {viewer && (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <form action={logMenuItem} className="flex flex-col gap-1 rounded-xl border border-line p-3">
                  <input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="portion" value="0.5" />
                  <span className="text-[11px] font-bold tracking-wide text-faint">OPTION A</span>
                  <b className="text-sm">MAKE IT WORK</b>
                  <span className="text-xs text-muted">Split it and log half</span>
                  <button className="mt-1 min-h-9 rounded-full border border-line text-xs font-bold hover:bg-surface-2">Log half</button>
                </form>
                <div className="flex flex-col gap-1 rounded-xl border border-line p-3">
                  <span className="text-[11px] font-bold tracking-wide text-faint">OPTION B</span>
                  <b className="text-sm">LIGHTER VYBE</b>
                  {lighter ? (
                    <Link href={`/max/deep-dive/${lighter.id}`} className="text-xs text-sky">{lighter.name}{lighter.same_place ? "" : ` · ${lighter.business_name}`}</Link>
                  ) : <span className="text-xs text-muted">No lighter option with known calories nearby yet.</span>}
                </div>
                <form action={logMenuItem} className="flex flex-col gap-1 rounded-xl border border-line p-3">
                  <input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="portion" value="1" />
                  <span className="text-[11px] font-bold tracking-wide text-faint">OPTION C</span>
                  <b className="text-sm">I&rsquo;M EATING IT ANYWAY 😂</b>
                  <span className="text-xs text-muted">Log it and update today</span>
                  <button className="vybe-gradient mt-1 min-h-9 rounded-full text-xs font-bold text-ink">Log it</button>
                </form>
              </div>
            )}
          </Section>

          <Section title="BETTER SWAP">
            {swaps.length ? (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {swaps.map((s) => {
                  const cmp = compareCalories({ calories: n?.calories ?? null, source: n?.source ?? "unknown" }, { calories: s.calories, source: s.nutrition_source });
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/max/deep-dive/${s.id}`} className="min-w-0">
                        <span className="font-semibold">{s.name}</span>
                        <span className="block text-xs text-muted">{s.same_place ? "Same place" : s.business_name}{s.price_cents != null ? ` · ${formatCents(s.price_cents)}` : ""}{s.calories != null ? ` · ${s.calories} cal (${NUTRITION_SOURCE_LABEL[s.nutrition_source].toLowerCase()})` : " · nutrition varies"}</span>
                      </Link>
                      <span className="shrink-0 text-right text-xs">
                        {s.avg_score != null && <b className="block">{Number(s.avg_score).toFixed(1)}</b>}
                        {cmp && <span className="text-muted">{cmp}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No similar items nearby yet.</p>}
          </Section>
        </>
      )}

      <p className="text-center text-xs text-faint">VYBR8 informs. You decide. This is wellness and nutrition information, not medical advice.</p>
    </div>
  );
}
