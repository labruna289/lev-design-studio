import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Bookmark, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";
import { PaletteStrip } from "@/components/eleve/PaletteStrip";
import { ProductCard } from "@/components/eleve/ProductCard";
import { CountUp } from "@/components/eleve/CountUp";
import { getLook } from "@/lib/eleve-mock";
import { savedStore, useIsSaved } from "@/lib/saved-store";

export const Route = createFileRoute("/_app/looks/$id")({
  head: () => ({ meta: [{ title: "A look — Élevé" }] }),
  component: LookDetail,
  notFoundComponent: () => (
    <Frame withNav>
      <ScreenHeader back="/looks" eyebrow="Not found" title="No such look." />
    </Frame>
  ),
});

function LookDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const look = getLook(id);
  const isSaved = useIsSaved(id);
  if (!look) throw notFound();

  const swatches = look.palette.map((hex, i) => ({ hex, name: ["Light", "Soft", "Mid", "Accent", "Anchor"][i] ?? "" }));

  function onSave() {
    const next = savedStore.toggle(look!.id);
    if (next) toast("Saved to your wardrobe ✦", { className: "eleve-toast" });
  }

  function onShare() {
    toast("Share card ready ✦", { className: "eleve-toast" });
  }

  return (
    <Frame withNav>
      <ScreenHeader back="/looks" eyebrow={`Look ${look.number} · ${look.occasion}`} />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <h1 className="serif-display text-[40px] text-ink leading-[1.02] min-w-0">
          <span className="mask-line block">
            <span style={{ animationDelay: "100ms" }}>{look.name.split(" ")[0]}</span>
          </span>
          <span className="mask-line block italic" style={{ color: "var(--espresso)" }}>
            <span style={{ animationDelay: "260ms" }}>{look.name.split(" ").slice(1).join(" ")}</span>
          </span>
        </h1>
        <div className="text-right shrink-0 rise" style={{ animationDelay: "420ms" }}>
          <div className="eyebrow">Harmony</div>
          <div
            className="serif-display text-champagne leading-none"
            style={{ fontSize: 56, fontWeight: 500 }}
          >
            <CountUp to={look.harmony} duration={1400} />
          </div>
        </div>
      </div>

      <div className="mt-6 rise" style={{ animationDelay: "520ms" }}>
        <PaletteStrip swatches={swatches} height={64} />
      </div>

      <div className="card-atelier mt-6 p-5 rise" style={{ animationDelay: "640ms" }}>
        <div className="eyebrow">Why it works on you</div>
        <p className="serif-display italic text-[17px] text-espresso mt-2 leading-snug">
          {look.why}
        </p>
      </div>

      <div className="mt-8">
        <div className="eyebrow mb-3">The pieces</div>
        <div className="flex flex-col gap-3">
          {look.products.map((p, i) => (
            <ProductCard key={p.kind} product={p} delay={700 + i * 80} />
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <PillButton
          onClick={() => navigate({ to: "/mirror" })}
          className="bg-champagne text-espresso"
          style={{ backgroundColor: "var(--champagne)", color: "var(--espresso)" }}
        >
          See it on me · The mirror
        </PillButton>
        <div className="grid grid-cols-2 gap-3">
          <PillButton variant="ghost" onClick={onSave}>
            <Bookmark
              size={14}
              strokeWidth={1.5}
              className="mr-2"
              fill={isSaved ? "var(--champagne)" : "none"}
            />
            {isSaved ? "Saved" : "Save"}
          </PillButton>
          <Link to="/share/$id" params={{ id }} className="block">
            <PillButton variant="ink" onClick={onShare}>
              <Share2 size={14} strokeWidth={1.5} className="mr-2" /> Share
            </PillButton>
          </Link>
        </div>
      </div>
    </Frame>
  );
}
