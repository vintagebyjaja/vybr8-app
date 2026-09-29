"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/** Uploads a proof document to the private claim-docs bucket and puts its path in a hidden "document" input. */
export function ProofUpload({ userId }: { userId: string }) {
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("Keep it under 5 MB.");
    setBusy(true);
    setError(null);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const objectPath = `${userId}/proof-${Date.now()}.${ext}`;
    const { error: upErr } = await createClient().storage.from("claim-docs").upload(objectPath, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (upErr) return setError("That file didn't upload. Try a PDF, JPG or PNG under 5 MB.");
    setPath(objectPath);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name="document" value={path ?? ""} />
      <label className="text-sm font-semibold" htmlFor="proof-file">Proof document</label>
      <input
        id="proof-file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => onPick(e.target.files?.[0])}
        className="text-sm file:mr-3 file:min-h-10 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:font-bold file:text-text"
      />
      <p className="text-xs text-faint">{busy ? "Uploading…" : path ? "Uploaded ✓ Only the VYBR8 Team can see it." : "PDF or photo, up to 5 MB."}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
