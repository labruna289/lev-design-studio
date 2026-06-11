import { createFileRoute, Link } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { LookCard } from "@/components/eleve/LookCard";
import { Monogram } from "@/components/eleve/Monogram";
import { PillButton } from "@/components/eleve/PillButton";
import { useLooks } from "@/lib/looks-api";
import { useSaved } from "@/lib/saved-store";
import { useSession } from "@/lib/auth-store";

export const Route = createFileRoute("/_app/saved")({
  head: () => ({ meta: [{ title: "Saved — Élevé" }] }),
  component: Saved,
});

function Saved() {
  useSession(); // ensures saved store pulls from DB on sign-in
  const savedIds = useSaved();
  const { data: allLooks = [] } = useLooks();
  const items = allLooks.filter((l) => savedIds.includes(l.id));

  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Your wardrobe" title="Saved." />

      {items.length === 0 ? (
        <div className="card-atelier mt-4 px-6 py-12 text-center flex flex-col items-center">
          <Monogram size={84} />
          <p className="serif-display italic text-[22px] mt-6 text-ink">
            Your wardrobe is open.
          </p>
          <p className="text-[13px] text-muted-foreground mt-2 max-w-[260px] leading-relaxed">
            Save a look from the atelier and it will rest here, quietly waiting.
          </p>
          <div className="mt-8 w-full max-w-[240px]">
            <Link to="/looks" className="block">
              <PillButton variant="ink">Browse the looks</PillButton>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map((l, i) => (
            <LookCard key={l.id} look={l} index={i} />
          ))}
        </div>
      )}
    </Frame>
  );
}
