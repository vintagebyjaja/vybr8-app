"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { POST_KINDS, POST_LIMITS, fitWithin, parsePriceToCents, validatePostDraft, type PostKind, type PostPhoto } from "@/domain/posts/posts";
import { createPost } from "@/app/(app)/post/actions";
import { Button } from "@/components/ui/Button";
import { PlacePicker, type PickedPlace } from "@/components/places/PlacePicker";

type Picked = { file: File; preview: string; alt: string };

/** Resize to at most 1600px on the long edge and re-encode as JPEG (also strips location metadata). */
async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.86),
  );
  return { blob, width, height };
}

export function PostComposer({ userId, defaultVenue = null, defaultKind = "plate", canPostAlcohol, under21 = false }: { userId: string; defaultVenue?: PickedPlace | null; defaultKind?: PostKind; canPostAlcohol: boolean; under21?: boolean }) {
  const router = useRouter();
  const ids = useId();
  const [kind, setKind] = useState<PostKind>(defaultKind);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [venueId, setVenueId] = useState(defaultVenue?.id ?? "");
  const [itemName, setItemName] = useState("");
  const [caption, setCaption] = useState("");
  const [rate, setRate] = useState(false);
  const [rating, setRating] = useState(8.5);
  const [price, setPrice] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [alcoholic, setAlcoholic] = useState(canPostAlcohol && !under21);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= POST_LIMITS.maxPhotos) {
        setError(`You can add up to ${POST_LIMITS.maxPhotos} photos.`);
        break;
      }
      if (!file.type.startsWith("image/")) continue;
      next.push({ file, preview: URL.createObjectURL(file), alt: "" });
    }
    setPhotos(next);
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(photos[i]!.preview);
    setPhotos(photos.filter((_, j) => j !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceCents = parsePriceToCents(price);
    if (Number.isNaN(priceCents)) return setError("Enter the price like 16.99, or leave it blank.");

    // Check everything except the uploads first, so nothing uploads for a post that can't be saved.
    const dry = validatePostDraft(userId, {
      kind, businessId: venueId || null, itemName, caption, rating: rate ? rating : null, priceCents, visibility,
      isAlcoholic: kind === "pour" && alcoholic,
      photos: photos.map((_, i) => ({ path: `${userId}/check-${i}.jpg`, width: 1, height: 1 })),
    });
    if (!dry.ok) return setError(dry.errors[0] ?? "Check your post.");

    setBusy(true);
    try {
      const supabase = createClient();
      const uploaded: PostPhoto[] = [];
      for (const [i, p] of photos.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        const { blob, width, height } = await prepareImage(p.file);
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("post-media").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error("upload");
        uploaded.push({ path, width, height, altText: p.alt || undefined });
      }
      setStatus("Posting…");
      const res = await createPost({ kind, businessId: venueId || null, itemName, caption, rating: rate ? rating : null, priceCents, visibility, isAlcoholic: kind === "pour" && alcoholic, photos: uploaded });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/post/${res.postId}`);
    } catch {
      setError("A photo didn't upload. Check your connection and try again.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const k = POST_KINDS[kind];
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">What are you posting?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(POST_KINDS) as PostKind[]).map((key) => (
            <label key={key} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold ${kind === key ? "vybe-ring text-text" : "border-line text-muted hover:bg-surface-2"}`}>
              <input type="radio" name="kind" value={key} checked={kind === key} onChange={() => setKind(key)} className="sr-only" />
              {POST_KINDS[key].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-faint">Plate = a dish · Pour = a drink · Spot = the place itself</p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Photos <span className="font-normal text-faint">({photos.length}/{POST_LIMITS.maxPhotos})</span></span>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.preview} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={p.preview} alt="" className="size-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)} className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-ink/80 text-sm" aria-label={`Remove photo ${i + 1}`}>✕</button>
              </div>
              <label className="sr-only" htmlFor={`${ids}-alt-${i}`}>Describe photo {i + 1}</label>
              <input id={`${ids}-alt-${i}`} value={p.alt} maxLength={POST_LIMITS.altTextMax} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder="Describe it (optional)" className="min-h-9 rounded-lg border border-line bg-surface px-2 text-xs" />
            </li>
          ))}
          {photos.length < POST_LIMITS.maxPhotos && (
            <li>
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-line text-center text-sm text-muted hover:border-coral/60 hover:text-text">
                <span>+ Add photo<br /><span className="text-xs text-faint">food, drinks or the place</span></span>
                <input type="file" accept={POST_LIMITS.allowedTypes.join(",") + ",image/heic"} multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">Where {kind === "spot" ? "" : <span className="font-normal text-faint">(optional)</span>}</p>
        <PlacePicker initial={defaultVenue} onChange={(p) => setVenueId(p?.id ?? "")} placeholder={kind === "spot" ? "Search for the place" : "Search places, or leave blank"} />
      </div>

      {kind === "pour" && (
        <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
          <label className={`flex items-center gap-3 text-sm font-semibold ${canPostAlcohol ? "" : "opacity-60"}`}>
            <input type="checkbox" checked={canPostAlcohol && alcoholic} disabled={!canPostAlcohol} onChange={(e) => setAlcoholic(e.target.checked)} className="size-5 accent-[var(--color-coral)]" />
            Contains alcohol (21+)
          </label>
          <p className="text-xs text-faint">
            {canPostAlcohol
              ? "Alcohol posts are only shown to members 21 and older. Untick for coffee, tea, matcha, boba, lemonade, smoothies and mocktails."
              : "Alcohol posts open up 5 days before your 21st birthday. You can post coffee, tea, matcha, boba, lemonade, smoothies and mocktails."}
          </p>
          {canPostAlcohol && under21 && alcoholic && (
            <p className="text-xs text-orange">
              Your 21st is almost here. Review the place, the menu and the vibe. Don&rsquo;t post about drinking alcohol before your birthday; places only serve guests 21+.
            </p>
          )}
        </div>
      )}

      {kind !== "spot" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-item`} className="text-sm font-semibold">Name of the {k.noun} <span className="font-normal text-faint">(optional)</span></label>
          <input id={`${ids}-item`} value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={POST_LIMITS.itemNameMax} placeholder={kind === "plate" ? "Hot Honey Wings" : "Espresso Martini"} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-caption`} className="text-sm font-semibold">Caption</label>
        <textarea id={`${ids}-caption`} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={POST_LIMITS.captionMax} rows={3} placeholder="How was the vybe?" className="rounded-xl border border-line bg-surface px-3 py-2" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={rate} onChange={(e) => setRate(e.target.checked)} className="size-5 accent-[var(--color-coral)]" />
          Add a VYBR8 score
        </label>
        {rate && (
          <div className="flex items-center gap-4">
            <label htmlFor={`${ids}-rating`} className="sr-only">Score out of 10</label>
            <input id={`${ids}-rating`} type="range" min={0} max={10} step={0.1} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="flex-1 accent-[var(--color-coral)]" />
            <output htmlFor={`${ids}-rating`} className="w-14 text-right font-display text-2xl font-extrabold tabular-nums"><span className="vybe-text">{rating.toFixed(1)}</span></output>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-price`} className="text-sm font-semibold">Price <span className="font-normal text-faint">(optional)</span></label>
          <input id={`${ids}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$16.99" className="min-h-11 rounded-xl border border-line bg-surface px-3" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-vis`} className="text-sm font-semibold">Who can see this</label>
          <select id={`${ids}-vis`} value={visibility} onChange={(e) => setVisibility(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface px-3">
            <option value="public">Everyone</option>
            <option value="friends">Friends</option>
            <option value="private">Only me</option>
          </select>
        </div>
      </div>

      <div aria-live="polite" className="min-h-5 text-sm">
        {error && <p className="text-danger">{error}</p>}
        {!error && status && <p className="text-muted">{status}</p>}
      </div>

      <Button type="submit" disabled={busy || photos.length === 0} className="self-start">
        {busy ? "Posting…" : k.prompt}
      </Button>
    </form>
  );
}
