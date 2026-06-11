import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";

export const Route = createFileRoute("/_app/app")({
  head: () => ({ meta: [{ title: "Atelier — Élevé" }] }),
  component: Atelier,
});

function Atelier() {
  return (
    <Frame withNav>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="eyebrow">Thursday</div>
          <h1 className="serif-display text-[34px] text-ink mt-1">Good morning,<br /><span className="italic">Adèle.</span></h1>
        </div>
      </div>

      <Link to="/mirror" className="block mt-8">
        <div className="card-atelier p-6 press">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">The Mirror</div>
              <p className="serif-display italic text-[20px] text-ink mt-2">A live styling read.</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-surface">
              <ArrowUpRight size={16} strokeWidth={1.5} />
            </span>
          </div>
        </div>
      </Link>

      <div className="mt-8">
        <div className="flex items-baseline justify-between mb-4">
          <div className="eyebrow">Today&apos;s suggestion</div>
          <Link to="/looks" className="text-[12px] text-muted-foreground tracking-[0.16em] uppercase press">All looks</Link>
        </div>
        <div className="card-atelier overflow-hidden">
          <div
            className="aspect-[4/5] w-full"
            style={{ background: "linear-gradient(160deg, var(--blush), var(--taupe))" }}
          />
          <div className="p-5">
            <div className="eyebrow">Look 01</div>
            <p className="serif-display text-[22px] text-ink mt-1">Espresso wool, ivory silk.</p>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              A tailored autumn line built around your warm undertone.
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}
