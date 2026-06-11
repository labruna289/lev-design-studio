import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Frame } from "@/components/eleve/Frame";

const phrases = [
  "Reading your undertone…",
  "Mapping light across the face…",
  "Measuring contrast and depth…",
  "Composing your palette…",
  "Selecting from the atelier…",
  "Composed.",
];

const DURATION = 5000;

export const Route = createFileRoute("/analyzing")({
  head: () => ({ meta: [{ title: "One moment — Élevé" }] }),
  component: Analyzing,
});

function Analyzing() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setI((v) => Math.min(v + 1, phrases.length - 1)),
      800,
    );
    const done = setTimeout(
      () => navigate({ to: "/analysis" }),
      DURATION + 400,
    );
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [navigate]);

  const size = 124;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;

  return (
    <Frame>
      <div className="flex min-h-[82vh] flex-col items-center justify-center text-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0"
            aria-hidden
          >
            {/* Hairline track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1}
            />
            {/* Champagne draw */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--champagne)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c}
              style={{
                animation: `ev-draw ${DURATION}ms cubic-bezier(0.65,0,0.35,1) forwards`,
                transformOrigin: "center",
                transform: "rotate(-90deg)",
              }}
            />
          </svg>

          {/* Orbiting glowing dot */}
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2"
            style={{
              width: 0,
              height: 0,
              animation: `ev-orbit ${DURATION}ms linear forwards`,
              transformOrigin: "0 0",
            }}
          >
            <span
              className="absolute block rounded-full"
              style={{
                width: 8,
                height: 8,
                background: "var(--champagne)",
                boxShadow: "0 0 16px 4px rgba(199,166,106,0.6)",
                transform: `translate(-50%, -50%) translate(0, -${r}px)`,
              }}
            />
          </span>

          {/* Breathing É */}
          <span
            className="absolute inset-0 grid place-items-center serif-display italic text-espresso breath"
            style={{ fontSize: size * 0.42, lineHeight: 1 }}
          >
            É
          </span>
        </div>

        <div className="mt-12 eyebrow">In session</div>

        <div className="mt-3 h-7 w-full max-w-[300px] relative">
          {phrases.map((p, idx) => (
            <p
              key={idx}
              className="serif-display italic text-[18px] text-ink absolute inset-x-0"
              style={{
                opacity: idx === i ? 1 : 0,
                transform: idx === i ? "translateY(0)" : "translateY(6px)",
                transition: "opacity 500ms ease, transform 500ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>
    </Frame>
  );
}
