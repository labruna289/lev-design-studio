/**
 * Élevé monogram crest.
 * Two concentric hairline rings (champagne outer, border inner) with an
 * italic Playfair "É" centered. The outer ring draws on mount via
 * stroke-dashoffset animation.
 */
export function Monogram({ size = 132 }: { size?: number }) {
  const r1 = size / 2 - 2;
  const r2 = r1 - 10;
  const c = 2 * Math.PI * r1;
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r1}
          fill="none"
          stroke="var(--champagne)"
          strokeWidth={1.25}
          strokeDasharray={c}
          strokeDashoffset={c}
          style={{
            animation: "ev-draw 1600ms cubic-bezier(0.16,1,0.3,1) 200ms forwards",
            transformOrigin: "center",
            transform: "rotate(-90deg)",
          }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r2}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      </svg>
      <span
        className="serif-display italic text-espresso"
        style={{ fontSize: size * 0.42, lineHeight: 1, transform: "translateY(2px)" }}
      >
        É
      </span>
    </div>
  );
}
