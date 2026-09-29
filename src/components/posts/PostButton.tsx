import Link from "next/link";

export function PostButton({ href = "/post/new", label = "Post your plate", className = "" }: { href?: string; label?: string; className?: string }) {
  return (
    <Link href={href} className={`vybe-gradient inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold text-ink hover:brightness-110 ${className}`}>
      <span aria-hidden className="text-lg leading-none">+</span> {label}
    </Link>
  );
}
