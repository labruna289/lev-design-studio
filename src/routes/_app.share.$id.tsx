import { createFileRoute } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";

export const Route = createFileRoute("/_app/share/$id")({
  head: () => ({ meta: [{ title: "Share — Élevé" }] }),
  component: Share,
});

function Share() {
  const { id } = Route.useParams();
  return (
    <Frame withNav>
      <ScreenHeader back="/looks" eyebrow={`Look ${id}`} title="Share, quietly." />

      <div
        className="card-atelier overflow-hidden p-6 rise"
        style={{ background: "var(--surface)" }}
      >
        <div className="eyebrow text-center">Élevé</div>
        <div
          className="mt-4 aspect-[3/4] w-full rounded-[18px]"
          style={{ background: "linear-gradient(160deg, #E8CFC3, #C7A66A)" }}
        />
        <p className="serif-display italic text-[18px] text-espresso text-center mt-4 leading-snug">
          Espresso wool, ivory silk.
        </p>
        <div className="hairline mt-4" />
        <p className="text-[11px] text-muted-foreground tracking-[0.18em] uppercase text-center mt-3">
          Curated privately
        </p>
      </div>

      <div className="mt-8">
        <PillButton variant="ink">Send card</PillButton>
      </div>
    </Frame>
  );
}
