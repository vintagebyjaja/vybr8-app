import { Avatar } from "@/components/ui/Avatar";

/** Overlapping member circles. Kids show a first-letter circle (no photos of kids are stored). */
export function GroupFaces({ faces, total }: { faces: { name: string; avatarUrl: string | null; isKid: boolean }[]; total: number }) {
  return (
    <span className="flex items-center">
      {faces.map((f, i) => (
        <span key={`${f.name}-${i}`} className={i ? "-ml-2" : ""} title={f.name}><Avatar path={f.isKid ? null : f.avatarUrl} name={f.name} size="sm" /></span>
      ))}
      {total > faces.length && <span className="-ml-1 pl-2 text-xs text-faint">+{total - faces.length}</span>}
    </span>
  );
}
