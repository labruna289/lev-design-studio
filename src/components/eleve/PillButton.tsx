import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "ink" | "ghost" | "champagne";

export function PillButton({
  children,
  variant = "ink",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const base =
    "pill press font-sans text-[14px] disabled:opacity-40 disabled:pointer-events-none w-full";
  const styles: Record<Variant, string> = {
    ink: "bg-ink text-surface hover:bg-espresso",
    ghost: "bg-transparent text-ink border border-border",
    champagne: "bg-champagne text-espresso",
  };
  return (
    <button {...rest} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
