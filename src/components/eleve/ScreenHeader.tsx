import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({
  back,
  eyebrow,
  title,
  trailing,
}: {
  back?: string;
  eyebrow?: string;
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="w-8">
          {back ? (
            <Link
              to={back}
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface press"
              aria-label="Back"
            >
              <ChevronLeft size={16} strokeWidth={1.5} className="text-ink" />
            </Link>
          ) : null}
        </div>
        <div className="min-w-0 text-center">
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        </div>
        <div className="w-8 justify-self-end">{trailing}</div>
      </div>
      {title ? (
        <h1 className="serif-display text-[34px] text-ink text-center mask-line">
          <span>{title}</span>
        </h1>
      ) : null}
    </header>
  );
}
