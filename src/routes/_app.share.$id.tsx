import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PillButton } from "@/components/eleve/PillButton";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth, useSession } from "@/lib/auth-store";
import { useLook } from "@/lib/looks-api";

export const Route = createFileRoute("/_app/share/$id")({
  head: () => ({ meta: [{ title: "Share — Élevé" }] }),
  component: Share,
});

function Share() {
  const { id } = Route.useParams();
  const session = useSession();
  const { data: look } = useLook(id);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function ensureLink() {
    if (!session?.user || !look) return;
    setBusy(true);
    const { data: looksRow } = await supabase.from("looks").select("id").eq("slug", id).maybeSingle();
    if (!looksRow) { setBusy(false); return; }
    const { data: existing } = await supabase.from("share_links")
      .select("token").eq("user_id", session.user.id).eq("look_id", looksRow.id).maybeSingle();
    if (existing) { setToken(existing.token); setBusy(false); return; }
    const tk = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 16);
    const { data: ins, error } = await supabase.from("share_links")
      .insert({ user_id: session.user.id, look_id: looksRow.id, token: tk }).select("token").single();
    setBusy(false);
    if (error) { toast(error.message); return; }
    setToken(ins.token);
  }

  useEffect(() => {
    if (session?.user && look && !token) ensureLink();
  }, [session?.user?.id, look?.id]);

  function copy() {
    if (!token) return;
    const url = `${window.location.origin}/share/${id}?t=${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast("Link copied ✦", { className: "eleve-toast" });
    setTimeout(() => setCopied(false), 1600);
  }

  function send() {
    requireAuth("Send your share card", () => ensureLink());
  }

  return (
    <Frame withNav>
      <ScreenHeader back="/looks" eyebrow={look ? `Look ${look.number}` : "Share"} title="Share, quietly." />

      <div className="card-atelier overflow-hidden p-6 rise" style={{ background: "var(--surface)" }}>
        <div className="eyebrow text-center">Élevé</div>
        <div className="mt-4 aspect-[3/4] w-full rounded-[18px]"
          style={{ background: look ? `linear-gradient(160deg, ${look.palette[1] ?? "#E8CFC3"}, ${look.palette[3] ?? "#C7A66A"})` : "linear-gradient(160deg, #E8CFC3, #C7A66A)" }} />
        <p className="serif-display italic text-[18px] text-espresso text-center mt-4 leading-snug">
          {look?.blurb ?? "A quiet composition."}
        </p>
        <div className="hairline mt-4" />
        <p className="text-[11px] text-muted-foreground tracking-[0.18em] uppercase text-center mt-3">
          Curated privately
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {token ? (
          <button onClick={copy} className="pill bg-ink text-surface press text-[13px] inline-flex items-center justify-center gap-2">
            {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
            {copied ? "Copied" : "Copy share link"}
          </button>
        ) : (
          <PillButton variant="ink" onClick={send} disabled={busy}>
            {busy ? "…" : "Send card"}
          </PillButton>
        )}
        <p className="text-[11.5px] text-center text-muted-foreground italic mt-2 leading-relaxed">
          Only the link holder can open this card. Your portrait is never on share cards.
        </p>
      </div>
    </Frame>
  );
}
