import { saveTaste } from "@/app/(app)/groups/actions";

type Taste = { likes: string[]; dislikes: string[]; allergies: string[]; dietary: string[]; spice: number | null; kidsMenu: boolean; notes: string | null };
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm placeholder:text-faint";

/** Food tastes for you or a kid. Used by groups to plan orders and suggest places. */
export function TasteForm({ taste, kidId, returnTo, forKid = false }: { taste: Taste; kidId?: string; returnTo: string; forKid?: boolean }) {
  return (
    <form action={saveTaste} className="flex flex-col gap-3">
      {kidId && <input type="hidden" name="kid" value={kidId} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      {[
        { id: "likes", label: forKid ? "Favorite foods & drinks" : "Favorites", value: taste.likes, ph: "wings, mac & cheese, lemonade" },
        { id: "dislikes", label: "Won't eat", value: taste.dislikes, ph: "mushrooms, spicy" },
        { id: "allergies", label: "Allergies", value: taste.allergies, ph: "peanuts, shellfish" },
        { id: "dietary", label: "Dietary", value: taste.dietary, ph: "vegetarian, halal, no pork, gluten-free" },
      ].map((f) => (
        <div key={f.id} className="flex flex-col gap-1">
          <label htmlFor={`${kidId ?? "me"}-${f.id}`} className="text-sm font-semibold">{f.label}</label>
          <input id={`${kidId ?? "me"}-${f.id}`} name={f.id} defaultValue={f.value.join(", ")} placeholder={f.ph} className={input} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Spice</span>
          <select name="spice" defaultValue={taste.spice ?? ""} className="min-h-10 rounded-xl border border-line bg-ink px-3">
            <option value="">No preference</option><option value="0">None</option><option value="1">Mild</option><option value="2">Medium</option><option value="3">Hot</option><option value="4">Very hot</option>
          </select>
        </label>
        {forKid && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="kids_menu" defaultChecked={taste.kidsMenu} className="size-4 accent-coral" /> Orders from the kids&rsquo; menu</label>
        )}
      </div>
      <input name="notes" defaultValue={taste.notes ?? ""} maxLength={280} placeholder={forKid ? "Anything else? (e.g. cut food small, no sauce)" : "Anything else?"} aria-label="Notes" className={input} />
      <p className="text-xs text-faint">Separate with commas. Allergies always come first in suggestions, but always confirm with the restaurant.</p>
      <button className="vybe-gradient min-h-11 self-start rounded-full px-5 text-sm font-bold text-ink">Save tastes</button>
    </form>
  );
}
