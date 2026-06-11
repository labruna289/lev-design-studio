import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";
import { PaletteStrip } from "@/components/eleve/PaletteStrip";
import { AnalysisTag } from "@/components/eleve/AnalysisTag";
import { palette, analysisTags } from "@/lib/eleve-mock";

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "Your analysis — Élevé" }] }),
  component: Analysis,
});

function Analysis() {
  const navigate = useNavigate();
  return (
    <Frame>
      <ScreenHeader back="/upload" eyebrow="Your analysis" />

      <h1 className="serif-display text-[42px] text-ink leading-[1.02] text-center">
        <span className="mask-line block">
          <span style={{ animationDelay: "120ms" }}>Warm ivory,</span>
        </span>
        <span className="mask-line block italic" style={{ color: "var(--espresso)" }}>
          <span style={{ animationDelay: "320ms" }}>worn quietly.</span>
        </span>
      </h1>

      <div className="mt-10 rise" style={{ animationDelay: "520ms" }}>
        <div className="eyebrow mb-3">Your palette</div>
        <PaletteStrip swatches={palette} />
        <p className="text-[12px] text-muted-foreground mt-2 text-center">
          Tap a swatch.
        </p>
      </div>

      <div className="mt-10">
        <div className="eyebrow mb-3">A reading</div>
        <div className="grid grid-cols-2 gap-3">
          {analysisTags.map((t, i) => (
            <AnalysisTag key={t.k} k={t.k} v={t.v} delay={700 + i * 70} />
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3 rise" style={{ animationDelay: "1180ms" }}>
        <PillButton variant="ink" onClick={() => navigate({ to: "/looks" })}>
          View your curated looks
        </PillButton>
        <PillButton
          variant="ghost"
          onClick={() => navigate({ to: "/mirror" })}
          className="border-champagne text-ink"
          style={{ borderColor: "var(--champagne)" }}
        >
          See them on you · The mirror
        </PillButton>
      </div>
    </Frame>
  );
}
