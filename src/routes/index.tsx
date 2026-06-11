import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";
import { Monogram } from "@/components/eleve/Monogram";
import { PillButton } from "@/components/eleve/PillButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Élevé — Private AI Stylist" },
      { name: "description", content: "A quiet, private AI stylist. Begin your consultation." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <Frame>
      <div className="flex min-h-[80vh] flex-col items-center justify-between">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="rise" style={{ animationDelay: "60ms" }}>
            <Monogram size={132} />
          </div>

          <div className="mt-10 eyebrow rise" style={{ animationDelay: "260ms" }}>
            Private AI Stylist
          </div>

          <h1
            className="serif-display mt-3 text-[52px] text-ink rise"
            style={{ animationDelay: "340ms" }}
          >
            Élevé
          </h1>

          <p
            className="serif-display italic mt-4 text-[18px] text-muted-foreground max-w-[280px] rise"
            style={{ animationDelay: "440ms", fontWeight: 400 }}
          >
            A wardrobe, considered. A confidence, restored.
          </p>
        </div>

        <div className="w-full flex flex-col items-center gap-6">
          <div className="w-full rise" style={{ animationDelay: "560ms" }}>
            <Link to="/consent" className="block">
              <PillButton variant="ink">Begin consultation</PillButton>
            </Link>
          </div>

          <div
            className="flex items-center gap-2 text-[12px] text-muted-foreground rise"
            style={{ animationDelay: "680ms" }}
          >
            <Lock size={12} strokeWidth={1.5} className="text-champagne" />
            <span className="tracking-[0.14em] uppercase">Quiet, private, yours.</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
