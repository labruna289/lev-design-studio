import { createFileRoute } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";

export const Route = createFileRoute("/_app/mirror")({
  head: () => ({ meta: [{ title: "The Mirror — Élevé" }] }),
  component: Mirror,
});

function Mirror() {
  return (
    <Frame withNav>
      <ScreenHeader back="/app" eyebrow="The Mirror" title="Stand a moment." />

      <div
        className="card-atelier overflow-hidden relative"
        style={{ padding: 0, aspectRatio: "3 / 4" }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #3A2118, #111111)" }} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center text-surface/85 px-8">
            <div className="eyebrow" style={{ color: "var(--champagne)" }}>Live read</div>
            <p className="serif-display italic mt-3 text-[22px]">A reading begins when you do.</p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[13px] text-muted-foreground leading-relaxed">
        Hold your phone at chest height. The Mirror will quietly assess proportion, palette and posture.
      </p>
    </Frame>
  );
}
