import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <Link href="/" aria-label="VYBR8 home" className="mx-auto">
        <Image src="/brand-badge.webp" alt="" width={120} height={120} priority className="size-28" />
      </Link>
      {children}
    </main>
  );
}
