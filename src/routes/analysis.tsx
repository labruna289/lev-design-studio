import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";

const traits = [
  { k: "Undertone", v: "Warm — soft autumn" },
  { k: "Silhouette", v: "Long line, narrow shoulder" },
  { k: "Palette", v: "Espresso, blush, champagne" },
  { k: "Best fabrics", v: "Wool crepe, silk, brushed cotton" },
];

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "Your analysis — Élevé" }] }),
  component: Analysis,
});

function Analysis() {
  const navigate = useNavigate();
  return (
    <Frame>
      <ScreenHeader back="/upload" eyebrow="Your analysis" title="A portrait, read." />

      <div className="card-atelier mt-2 p-6 rise" style={{ animationDelay: "200ms" }}>
        <p className="serif-display italic text-[18px] text-espresso leading-snug">
          You wear restraint beautifully. Your palette favours warm neutrals against
          a single, considered accent.
        </p>
      </div>

      <ul className="mt-6 flex flex-col">
        {traits.map((t, i) => (
          <li
            key={t.k}
            className="flex items-baseline justify-between gap-4 py-4 border-b border-border last:border-b-0 rise"
            style={{ animationDelay: `${260 + i * 65}ms` }}
          >
            <span className="eyebrow">{t.k}</span>
            <span className="text-right text-[14px] text-ink">{t.v}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 rise" style={{ animationDelay: "620ms" }}>
        <PillButton variant="ink" onClick={() => navigate({ to: "/app" })}>
          Enter the atelier
        </PillButton>
      </div>
    </Frame>
  );
}
