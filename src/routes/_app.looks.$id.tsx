import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Share2 } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";

export const Route = createFileRoute("/_app/looks/$id")({
  head: () => ({ meta: [{ title: "A look — Élevé" }] }),
  component: LookDetail,
});

const pieces = [
  { k: "Outer", v: "Wool crepe blazer, espresso" },
  { k: "Top", v: "Silk shell, ivory" },
  { k: "Bottom", v: "Straight trouser, taupe" },
  { k: "Shoe", v: "Leather loafer, oxblood" },
  { k: "Accent", v: "Brushed gold cuff" },
];

function LookDetail() {
  const { id } = Route.useParams();
  return (
    <Frame withNav>
      <ScreenHeader back="/looks" eyebrow={`Look ${id}`} />

      <div className="card-atelier overflow-hidden rise" style={{ padding: 0 }}>
        <div
          className="aspect-[3/4] w-full"
          style={{ background: "linear-gradient(160deg, #E8CFC3, #C7A66A)" }}
        />
      </div>

      <div className="mt-6 rise" style={{ animationDelay: "120ms" }}>
        <div className="eyebrow">The composition</div>
        <h2 className="serif-display text-[28px] text-ink mt-1 leading-tight">
          Espresso wool, <span className="italic">ivory silk.</span>
        </h2>
        <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed">
          A long-lined autumn silhouette to flatter your narrow shoulder and warm undertone.
        </p>
      </div>

      <ul className="mt-6">
        {pieces.map((p, i) => (
          <li
            key={p.k}
            className="flex items-baseline justify-between gap-4 py-3 border-b border-border last:border-b-0 rise"
            style={{ animationDelay: `${200 + i * 60}ms` }}
          >
            <span className="eyebrow">{p.k}</span>
            <span className="text-[14px] text-ink text-right">{p.v}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex gap-3">
        <Link to="/saved" className="flex-1">
          <PillButton variant="ghost">
            <Bookmark size={14} strokeWidth={1.5} className="mr-2" /> Save
          </PillButton>
        </Link>
        <Link to="/share/$id" params={{ id }} className="flex-1">
          <PillButton variant="ink">
            <Share2 size={14} strokeWidth={1.5} className="mr-2" /> Share
          </PillButton>
        </Link>
      </div>
    </Frame>
  );
}
