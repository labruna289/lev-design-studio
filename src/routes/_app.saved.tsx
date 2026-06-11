import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";

const saved = [
  { id: "01", name: "Espresso wool, ivory silk", tone: "linear-gradient(160deg, #E8CFC3, #D8C7B4)" },
  { id: "03", name: "Cream coat, blush cashmere", tone: "linear-gradient(160deg, #FFFDF9, #E8CFC3)" },
];

export const Route = createFileRoute("/_app/saved")({
  head: () => ({ meta: [{ title: "Saved — Élevé" }] }),
  component: Saved,
});

function Saved() {
  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Your archive" title="Saved." />

      {saved.length === 0 ? (
        <div className="card-atelier p-10 text-center">
          <Bookmark size={20} strokeWidth={1.25} className="mx-auto text-champagne" />
          <p className="serif-display italic text-[18px] mt-3">Nothing kept yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {saved.map((l, i) => (
            <Link
              key={l.id}
              to="/looks/$id"
              params={{ id: l.id }}
              className="card-atelier overflow-hidden press rise grid grid-cols-[112px_minmax(0,1fr)] gap-0"
              style={{ animationDelay: `${100 + i * 70}ms`, padding: 0 }}
            >
              <div className="aspect-[3/4]" style={{ background: l.tone }} />
              <div className="p-4 flex flex-col justify-center min-w-0">
                <div className="eyebrow">Look {l.id}</div>
                <p className="serif-display text-[18px] text-ink mt-1 leading-snug truncate">{l.name}</p>
                <p className="text-[12px] text-muted-foreground mt-2">Saved last week</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Frame>
  );
}
