import { createFileRoute, Link } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";

const looks = [
  { id: "01", name: "Espresso wool, ivory silk", tone: "linear-gradient(160deg, #E8CFC3, #D8C7B4)" },
  { id: "02", name: "Champagne knit, taupe trouser", tone: "linear-gradient(160deg, #D8C7B4, #C7A66A)" },
  { id: "03", name: "Cream coat, blush cashmere", tone: "linear-gradient(160deg, #FFFDF9, #E8CFC3)" },
  { id: "04", name: "Espresso leather, ecru linen", tone: "linear-gradient(160deg, #3A2118, #D8C7B4)" },
];

export const Route = createFileRoute("/_app/looks/")({
  head: () => ({ meta: [{ title: "Curated looks — Élevé" }] }),
  component: Looks,
});

function Looks() {
  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Curated for you" title="Looks." />

      <div className="grid grid-cols-2 gap-4 mt-2">
        {looks.map((l, i) => (
          <Link
            key={l.id}
            to="/looks/$id"
            params={{ id: l.id }}
            className="card-atelier overflow-hidden press rise"
            style={{ animationDelay: `${120 + i * 65}ms`, padding: 0 }}
          >
            <div className="aspect-[3/4] w-full" style={{ background: l.tone }} />
            <div className="p-3">
              <div className="eyebrow">Look {l.id}</div>
              <p className="serif-display text-[14px] text-ink mt-1 leading-snug">{l.name}</p>
            </div>
          </Link>
        ))}
      </div>
    </Frame>
  );
}
