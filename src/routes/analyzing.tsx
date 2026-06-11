import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Frame } from "@/components/eleve/Frame";
import { Monogram } from "@/components/eleve/Monogram";

const steps = [
  "Studying proportion",
  "Reading colour temperature",
  "Considering silhouette",
  "Composing your atelier",
];

export const Route = createFileRoute("/analyzing")({
  head: () => ({ meta: [{ title: "One moment — Élevé" }] }),
  component: Analyzing,
});

function Analyzing() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, steps.length - 1)), 900);
    const done = setTimeout(() => navigate({ to: "/analysis" }), 4200);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [navigate]);

  return (
    <Frame>
      <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
        <div className="breath">
          <Monogram size={108} />
        </div>

        <div className="mt-12 eyebrow">In session</div>
        <h1 className="serif-display italic mt-3 text-[28px] text-ink">
          One quiet moment.
        </h1>

        <div className="mt-10 w-full max-w-[280px]">
          <div className="h-px w-full overflow-hidden bg-border">
            <div className="h-full w-1/2 shimmer" />
          </div>
          <div className="mt-5 h-5 text-[13px] text-muted-foreground tracking-wide">
            <span key={i} className="rise inline-block">{steps[i]}…</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
