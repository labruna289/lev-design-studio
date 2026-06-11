import { useState } from "react";
import type { Swatch } from "@/lib/eleve-mock";

export function PaletteStrip({
  swatches,
  staggerMs = 75,
  height = 88,
}: {
  swatches: Swatch[];
  staggerMs?: number;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div
      className="flex w-full overflow-hidden rounded-[18px] border border-border"
      style={{ height }}
    >
      {swatches.map((s, i) => {
        const isActive = active === i;
        return (
          <button
            key={s.name + i}
            type="button"
            onClick={() => setActive(isActive ? null : i)}
            className="relative overflow-hidden"
            style={{
              backgroundColor: s.hex,
              flex: isActive ? 3.2 : 1,
              transition: "flex 520ms cubic-bezier(0.34,1.56,0.64,1)",
              transformOrigin: "bottom",
              animation: `ev-swatch-rise 700ms cubic-bezier(0.16,1,0.3,1) both`,
              animationDelay: `${i * staggerMs}ms`,
            }}
            aria-label={s.name}
          >
            <span
              className="absolute inset-x-0 bottom-2 text-center text-[10.5px] tracking-[0.22em] uppercase"
              style={{
                opacity: isActive ? 1 : 0,
                transition: "opacity 280ms ease",
                color: isLight(s.hex) ? "#3A2118" : "#FFFDF9",
                mixBlendMode: "normal",
              }}
            >
              {s.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isLight(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 170;
}
