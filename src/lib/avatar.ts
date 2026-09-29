import { publicEnv } from "@/config/public-env";

/** Public URL for a profile photo path ("<user id>/<file>" in the avatars bucket, or a bundled "/demo/..." image). */
export function avatarSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/avatars/${path}`;
}
