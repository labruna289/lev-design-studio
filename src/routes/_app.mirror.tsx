import { createFileRoute } from "@tanstack/react-router";
import MirrorScreen from "@/components/eleve/MirrorScreen";

export const Route = createFileRoute("/_app/mirror")({
  head: () => ({ meta: [{ title: "The Mirror — Élevé" }] }),
  component: MirrorScreen,
});
