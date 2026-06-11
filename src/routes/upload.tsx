import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { CameraFrame } from "@/components/eleve/CameraFrame";
import { PillButton } from "@/components/eleve/PillButton";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [{ title: "Portrait — Élevé" }],
  }),
  component: Upload,
});

function Upload() {
  const navigate = useNavigate();
  return (
    <Frame>
      <ScreenHeader back="/consent" eyebrow="Step One" title="A single portrait." />

      <div className="mt-2 rise" style={{ animationDelay: "200ms" }}>
        <CameraFrame />
      </div>

      <p className="mt-6 text-center text-[13px] text-muted-foreground leading-relaxed rise" style={{ animationDelay: "360ms" }}>
        Stand in soft, even light. Centre yourself in the frame. You can retake as often as you like.
      </p>

      <div className="mt-8 rise" style={{ animationDelay: "480ms" }}>
        <PillButton variant="ink" onClick={() => navigate({ to: "/analyzing" })}>
          Continue
        </PillButton>
      </div>
    </Frame>
  );
}
