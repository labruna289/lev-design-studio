import type { ReactNode } from "react";

/** Mobile-first centered frame. Designed at 390px; max 430px content. */
export function Frame({
  children,
  withNav = false,
  className = "",
}: {
  children: ReactNode;
  withNav?: boolean;
  className?: string;
}) {
  return (
    <div className="min-h-dvh w-full bg-background">
      <div
        className={`mx-auto w-full max-w-[430px] px-6 ${withNav ? "pb-28" : "pb-10"} pt-10 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
