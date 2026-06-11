import { createFileRoute } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { LookCard } from "@/components/eleve/LookCard";
import { looks } from "@/lib/eleve-mock";

export const Route = createFileRoute("/_app/looks")({
  head: () => ({ meta: [{ title: "Curated looks — Élevé" }] }),
  component: Looks,
});

function Looks() {
  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Curated for you" title="Three looks." />

      <div className="flex flex-col gap-5">
        {looks.map((l, i) => (
          <LookCard key={l.id} look={l} index={i} />
        ))}
      </div>
    </Frame>
  );
}
