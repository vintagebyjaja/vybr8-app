"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { setProfilePhoto } from "@/app/(app)/profile/settings/photo-actions";
import { Avatar } from "@/components/ui/Avatar";

/** Square-crop to 512px JPEG in the browser (also strips location metadata), then upload to the avatars bucket. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.88));
}

export function PhotoUpload({ userId, path, name }: { userId: string; path: string | null; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await squareJpeg(file);
      const objectPath = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await createClient().storage.from("avatars").upload(objectPath, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const err = await setProfilePhoto(objectPath);
      if (err) throw new Error(err);
      router.refresh();
    } catch {
      setError("That photo didn't upload. Try a JPG or PNG under 10 MB.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar path={path} name={name} size="xl" />
      <div className="flex flex-col gap-1.5">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="photo" onChange={(e) => onPick(e.target.files?.[0])} />
        <label htmlFor="photo" className={`vybe-gradient inline-flex min-h-11 cursor-pointer items-center self-start rounded-full px-5 text-sm font-bold text-ink ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : path ? "Change photo" : "Add a photo"}
        </label>
        <p className="text-xs text-faint">A clear photo of your face. Everyone can see it, and you need one to host or join a Link Up so the group knows who&rsquo;s coming.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
