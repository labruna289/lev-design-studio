import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { signInWithEmail, signUpWithEmail, authModal, useAuthModal } from "@/lib/auth-store";
import { Monogram } from "./Monogram";

export function AuthModal() {
  const pending = useAuthModal();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!pending) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = mode === "signup"
        ? await signUpWithEmail(email, password, name || undefined)
        : await signInWithEmail(email, password);
      if (error) { toast(error.message); return; }
      toast(mode === "signup" ? "Welcome to the atelier ✦" : "Welcome back ✦", { className: "eleve-toast" });
      authModal.fireSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      style={{ background: "rgba(58,33,24,0.32)", backdropFilter: "blur(8px)" }}
      onClick={() => authModal.close()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[400px] bg-surface p-6 sm:p-7"
        style={{
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          boxShadow: "var(--shadow-soft)",
          animation: "ev-rise 420ms var(--ease-entrance)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Monogram size={36} />
            <div>
              <div className="eyebrow">Atelier access</div>
              <div className="serif-display italic text-[20px] text-ink leading-tight">
                {pending.label}
              </div>
            </div>
          </div>
          <button onClick={() => authModal.close()} aria-label="Close" className="press p-1 -m-1">
            <X size={18} strokeWidth={1.25} className="text-muted-foreground" />
          </button>
        </div>

        <p className="mt-3 text-[12.5px] text-muted-foreground leading-relaxed">
          A quiet membership. We never share, never sell, never train on you.
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {mode === "signup" && (
            <Field label="Name" value={name} onChange={setName} placeholder="Adèle" />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@atelier" required />
          <Field label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
          <button
            disabled={busy}
            className="pill bg-ink text-surface press text-[14px] mt-2 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signup" ? "Create membership" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 w-full text-center text-[12px] text-muted-foreground press italic"
        >
          {mode === "signup" ? "Already a member? Sign in" : "New here? Create a membership"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, minLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; minLength?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-[10px]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="mt-1 w-full bg-transparent border-b border-border outline-none py-2 text-[14px] text-ink placeholder:text-muted-foreground/60 focus:border-champagne"
      />
    </label>
  );
}
