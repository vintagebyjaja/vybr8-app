import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";
const styles: Record<Variant, string> = {
  primary: "vybe-gradient text-ink hover:brightness-110",
  ghost: "border border-line text-text hover:bg-surface-2",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
