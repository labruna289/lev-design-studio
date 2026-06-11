import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Look } from "@/lib/eleve-mock";
import { savedStore, useIsSaved } from "@/lib/saved-store";
import { CountUp } from "./CountUp";

export function LookCard({ look, index = 0 }: { look: Look; index?: number }) {
  const isSaved = useIsSaved(look.id);
  const [burst, setBurst] = useState(0);

  function onSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = savedStore.toggle(look.id);
    if (next) {
      setBurst((b) => b + 1);
      toast("Saved to your wardrobe ✦", {
        className: "eleve-toast",
      });
    }
  }

  return (
    <Link
      to="/looks/$id"
      params={{ id: look.id }}
      className="card-atelier overflow-hidden press rise block"
      style={{ animationDelay: `${index * 120}ms`, padding: 0 }}
    >
      {/* Palette band */}
      <div className="flex h-3 w-full">
        {look.palette.map((c, i) => (
          <span
            key={i}
            className="block h-full flex-1 origin-left"
            style={{
              backgroundColor: c,
              animation: "ev-wipe-x 620ms cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: `${index * 120 + 200 + i * 90}ms`,
            }}
          />
        ))}
      </div>

      <div
        className="aspect-[16/10] w-full"
        style={{
          background: `linear-gradient(160deg, ${look.palette[0]}, ${look.palette[2]}, ${look.palette[3]})`,
        }}
      />

      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">
            Look {look.number} · Harmony{" "}
            <CountUp to={look.harmony} />
          </div>
          <button
            onClick={onSave}
            className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-surface press"
            aria-label={isSaved ? "Unsave" : "Save look"}
          >
            <Heart
              size={16}
              strokeWidth={1.5}
              key={isSaved ? `on-${burst}` : "off"}
              className={
                isSaved
                  ? "text-champagne"
                  : "text-ink/70"
              }
              fill={isSaved ? "var(--champagne)" : "none"}
              style={
                isSaved
                  ? { animation: "ev-heart 520ms cubic-bezier(0.34,1.56,0.64,1)" }
                  : undefined
              }
            />
            {burst > 0 && <Particles seed={burst} />}
          </button>
        </div>

        <h3 className="serif-display text-[26px] text-ink mt-2 leading-tight">
          {look.name}
        </h3>
        <p className="text-[13px] text-muted-foreground mt-1">{look.occasion}</p>
        <p className="serif-display italic text-[14px] text-espresso/80 mt-3 leading-snug">
          {look.blurb}
        </p>
      </div>
    </Link>
  );
}

function Particles({ seed }: { seed: number }) {
  // 14 particles + a handful of serif sparkles drifting up
  const items = Array.from({ length: 14 }).map((_, i) => {
    const angle = (i / 14) * Math.PI * 2 + (seed % 7);
    const dist = 28 + ((i * 13 + seed) % 22);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist - 8;
    const color = i % 3 === 0 ? "var(--champagne)" : i % 3 === 1 ? "var(--blush)" : "var(--taupe)";
    return { x, y, color, delay: i * 8 };
  });
  const sparks = [0, 1, 2, 3].map((i) => ({
    x: (i - 1.5) * 14,
    y: -34 - i * 6,
    delay: i * 60,
  }));
  return (
    <span
      key={seed}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      {items.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
          style={{
            background: p.color,
            animation: "ev-particle 700ms cubic-bezier(0.16,1,0.3,1) forwards",
            animationDelay: `${p.delay}ms`,
            ["--px" as never]: `${p.x}px`,
            ["--py" as never]: `${p.y}px`,
          }}
        />
      ))}
      {sparks.map((s, i) => (
        <span
          key={`s-${i}`}
          className="absolute left-1/2 top-1/2 block text-[12px] leading-none text-champagne"
          style={{
            animation: "ev-spark 900ms cubic-bezier(0.16,1,0.3,1) forwards",
            animationDelay: `${s.delay}ms`,
            ["--px" as never]: `${s.x}px`,
            ["--py" as never]: `${s.y}px`,
            fontFamily: "var(--font-serif)",
          }}
        >
          ✦
        </span>
      ))}
    </span>
  );
}
