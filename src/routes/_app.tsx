import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomNav } from "@/components/eleve/BottomNav";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
