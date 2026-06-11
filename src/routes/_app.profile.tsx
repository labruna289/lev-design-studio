import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { Monogram } from "@/components/eleve/Monogram";
import { PillButton } from "@/components/eleve/PillButton";
import { useSession, signOut, requireAuth } from "@/lib/auth-store";
import { supabase } from "@/integrations/supabase/client";

const rows = [
  { k: "Your analysis", to: "/analysis" as const },
  { k: "Privacy", to: "/consent" as const },
  { k: "Retake portrait", to: "/upload" as const },
];

const REGISTERS = ["Discreet", "Considered", "Elevated", "Couture"];

export const Function = "";
export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Élevé" }] }),
  component: Profile,
});

function Profile() {
  const session = useSession();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [styleDirection, setStyleDirection] = useState("");
  const [budgetRegister, setBudgetRegister] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [savingP, setSavingP] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    supabase.from("users").select("*").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setDisplayName(data.display_name ?? "");
      setStyleDirection(data.style_direction ?? "");
      setBudgetRegister(data.budget_register ?? "");
      const d = new Date(data.created_at);
      setMemberSince(d.toLocaleString("en", { month: "long", year: "numeric" }));
    });
  }, [session?.user?.id]);

  async function saveProfile() {
    if (!session?.user) {
      requireAuth("Open your member card", () => {});
      return;
    }
    setSavingP(true);
    const { error } = await supabase.from("users").update({
      display_name: displayName || null,
      style_direction: styleDirection || null,
      budget_register: budgetRegister || null,
    }).eq("id", session.user.id);
    setSavingP(false);
    toast(error ? error.message : "Kept in the atelier ✦", { className: "eleve-toast" });
  }

  async function eraseAll() {
    if (!session?.user) return;
    setErasing(true);
    const uid = session.user.id;
    // Delete user-owned rows (RLS-scoped)
    await Promise.all([
      supabase.from("saved_looks").delete().eq("user_id", uid),
      supabase.from("share_links").delete().eq("user_id", uid),
      supabase.from("analyses").delete().eq("user_id", uid),
    ]);
    // Remove portrait from storage
    await supabase.storage.from("portraits").remove([`${uid}/portrait.jpg`]).catch(() => {});
    // Delete profile row
    await supabase.from("users").delete().eq("id", uid);
    // Clear local
    try { localStorage.removeItem("eleve.saved.v1"); localStorage.removeItem("eleve.photo.v1"); } catch {}
    await signOut();
    setErasing(false);
    toast("Erased. The atelier forgets quietly.", { className: "eleve-toast" });
    navigate({ to: "/" });
  }

  if (!session?.user) {
    return (
      <Frame withNav>
        <ScreenHeader eyebrow="Atelier member" title="Sign in." />
        <div className="flex flex-col items-center text-center mt-2">
          <Monogram size={84} />
          <p className="serif-display italic text-[20px] mt-5 text-ink">A private membership.</p>
          <p className="text-[13px] text-muted-foreground mt-2 max-w-[280px] leading-relaxed">
            Saved looks, your analysis and share cards rest here. Quiet, private, yours.
          </p>
          <div className="mt-8 w-full max-w-[240px]">
            <PillButton variant="ink" onClick={() => requireAuth("Open your member card", () => {})}>
              Become a member
            </PillButton>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame withNav>
      <ScreenHeader eyebrow="Atelier member" />

      <div className="flex flex-col items-center text-center">
        <Monogram size={92} />
        <h1 className="serif-display text-[28px] text-ink mt-5">{displayName || "Member"}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">{memberSince ? `Member since ${memberSince}` : "—"}</p>
      </div>

      <div className="card-atelier mt-8 p-5">
        <div className="eyebrow">Your details</div>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Adèle Laurent" />
          <Field label="Style direction" value={styleDirection} onChange={setStyleDirection} placeholder="Quiet, warm, considered" />
          <div>
            <span className="eyebrow text-[10px]">Budget register</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {REGISTERS.map((r) => {
                const active = budgetRegister === r;
                return (
                  <button key={r} onClick={() => setBudgetRegister(r)}
                    className="press text-[11px] tracking-[0.16em] uppercase"
                    style={{
                      padding: "8px 14px", borderRadius: 999,
                      background: active ? "var(--ink)" : "transparent",
                      color: active ? "var(--surface)" : "var(--ink)",
                      border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
                    }}>{r}</button>
                );
              })}
            </div>
          </div>
          <button onClick={saveProfile} disabled={savingP}
            className="pill bg-ink text-surface press text-[13px] mt-2 disabled:opacity-50">
            {savingP ? "…" : "Keep changes"}
          </button>
        </div>
      </div>

      <ul className="mt-6 card-atelier" style={{ padding: 0 }}>
        {rows.map((r, i) => (
          <li key={r.k} className={i > 0 ? "border-t border-border" : ""}>
            <Link to={r.to} className="flex items-center justify-between px-5 py-4 press">
              <span className="text-[14px] text-ink">{r.k}</span>
              <ChevronRight size={16} strokeWidth={1.25} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="card-atelier mt-6 p-5">
        <div className="eyebrow">The quiet exit</div>
        {!confirmErase ? (
          <>
            <p className="text-[12.5px] text-muted-foreground mt-2 leading-relaxed italic">
              Erase your portrait, analysis, saved looks and share cards. The atelier forgets you completely.
            </p>
            <button onClick={() => setConfirmErase(true)}
              className="press text-[12px] tracking-[0.16em] uppercase mt-4 underline text-espresso">
              Erase all my data
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink mt-2 italic serif-display">Are you certain?</p>
            <div className="flex gap-2 mt-3">
              <button onClick={eraseAll} disabled={erasing}
                className="pill bg-espresso text-surface press text-[12px] flex-1">
                {erasing ? "…" : "Yes, erase"}
              </button>
              <button onClick={() => setConfirmErase(false)}
                className="pill bg-transparent border border-border text-ink press text-[12px] flex-1">
                Keep
              </button>
            </div>
          </>
        )}
      </div>

      <button onClick={async () => { await signOut(); toast("Signed out.", { className: "eleve-toast" }); }}
        className="mt-6 w-full press inline-flex items-center justify-center gap-2 text-[12px] tracking-[0.18em] uppercase text-muted-foreground">
        <LogOut size={12} strokeWidth={1.5} /> Sign out
      </button>

      <p className="mt-8 text-center text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
        Quiet, private, yours.
      </p>
    </Frame>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; }) {
  return (
    <label className="block">
      <span className="eyebrow text-[10px]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full bg-transparent border-b border-border outline-none py-2 text-[14px] text-ink placeholder:text-muted-foreground/60 focus:border-champagne" />
    </label>
  );
}
