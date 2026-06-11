import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { Monogram } from "@/components/eleve/Monogram";

const rows = [
  { k: "Your analysis", to: "/analysis" as const },
  { k: "Privacy", to: "/consent" as const },
  { k: "Retake portrait", to: "/upload" as const },
];

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Élevé" }] }),
  component: Profile,
});

function Profile() {
  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Atelier member" />

      <div className="flex flex-col items-center text-center">
        <Monogram size={92} />
        <h1 className="serif-display text-[28px] text-ink mt-5">Adèle Laurent</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Member since June</p>
      </div>

      <ul className="mt-10 card-atelier" style={{ padding: 0 }}>
        {rows.map((r, i) => (
          <li key={r.k} className={i > 0 ? "border-t border-border" : ""}>
            <Link to={r.to} className="flex items-center justify-between px-5 py-4 press">
              <span className="text-[14px] text-ink">{r.k}</span>
              <ChevronRight size={16} strokeWidth={1.25} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
        Quiet, private, yours.
      </p>
    </Frame>
  );
}
