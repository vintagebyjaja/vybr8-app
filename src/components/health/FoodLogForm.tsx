"use client";

import { useState } from "react";
import { FOOD_KINDS, FOOD_SLOTS, type FoodKind, type FoodSlot } from "@/domain/health/health";

const chip = "cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-semibold has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-ink";
const field = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm font-normal placeholder:text-faint focus:border-mint";
const WATER_OZ = [8, 12, 16, 24, 32];

/** "Have you already ate?" Food, a drink or water, what time of day, and how much. */
export function FoodLogForm({ action, date, slot }: { action: (f: FormData) => void | Promise<void>; date: string; slot: FoodSlot | null }) {
  const [kind, setKind] = useState<FoodKind>("food");
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />

      <fieldset className="grid grid-cols-3 gap-1 rounded-full border border-line p-1">
        <legend className="sr-only">Food, drink or water</legend>
        {FOOD_KINDS.map((k) => (
          <label key={k.key} className="cursor-pointer rounded-full py-2 text-center text-sm font-bold text-muted has-[:checked]:bg-mint has-[:checked]:text-ink">
            <input type="radio" name="kind" value={k.key} className="sr-only" checked={kind === k.key} onChange={() => setKind(k.key)} />{k.label}
          </label>
        ))}
      </fieldset>

      {kind === "water" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">How much water?</legend>
          <div className="flex flex-wrap gap-2">
            {WATER_OZ.map((oz) => (
              <label key={oz} className={chip}><input type="radio" name="ounces" value={oz} required className="sr-only" defaultChecked={oz === 16} />{oz} oz</label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {kind === "drink" ? "What did you drink?" : "What did you eat?"}
            <input key={kind} name="name" required maxLength={120} className={field}
              placeholder={kind === "drink" ? "Lemonade, coffee, a margarita…" : "Chicken & waffles, a turkey sandwich…"} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {kind === "drink" ? (
              <label className="flex flex-col gap-1 text-sm font-semibold">Ounces <span className="font-normal text-faint">(optional)</span>
                <input name="ounces" inputMode="decimal" placeholder="12" className={`${field} tabular-nums`} />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm font-semibold">How much? <span className="font-normal text-faint">(optional)</span>
                <input name="amount" maxLength={40} placeholder="1 plate, 2 slices…" className={field} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm font-semibold">Calories <span className="font-normal text-faint">(if you know)</span>
              <input name="calories" inputMode="numeric" placeholder="650" className={`${field} tabular-nums`} />
            </label>
          </div>
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">When?</legend>
        <div className="flex flex-wrap gap-2">
          {FOOD_SLOTS.map((s) => (
            <label key={s.key} className={chip}>
              <input type="radio" name="slot" value={s.key} required className="sr-only" defaultChecked={s.key === slot} />{s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button className="vybe-gradient min-h-12 rounded-full font-bold text-ink hover:brightness-110">
        {kind === "water" ? "Add water" : kind === "drink" ? "Add drink" : "Add food"}
      </button>
    </form>
  );
}
