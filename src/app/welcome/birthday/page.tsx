import Image from "next/image";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { BirthdayForm } from "./BirthdayForm";

export const metadata = { title: "Confirm your birthday" };

export default async function ConfirmBirthdayPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in?next=/welcome/birthday");
  if (viewer.birthdate) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Image src="/brand-badge.webp" alt="" width={120} height={120} className="mx-auto size-24" />
      <div className="text-center">
        <h1 className="text-3xl font-bold">When&rsquo;s your birthday?</h1>
        <p className="mt-2 text-sm text-muted">VYBR8 is for people 13 and older. Coffee, tea, matcha and lemonade are for everyone; only alcohol posts, alcohol perks and Liquid Lovers are 21+. We&rsquo;ll also send you birthday perks. Your birthday is never shown to anyone.</p>
      </div>
      <BirthdayForm />
    </main>
  );
}
