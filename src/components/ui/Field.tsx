import type { InputHTMLAttributes } from "react";

export function Field({ label, id, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        {...props}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-11 rounded-xl border border-line bg-surface px-3 text-text placeholder:text-faint focus:border-sky"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}
