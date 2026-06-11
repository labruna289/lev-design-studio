import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let session: Session | null = null;
let initialized = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    session = data.session;
    emit();
  });
  supabase.auth.onAuthStateChange((_evt, s) => {
    session = s;
    emit();
  });
}

export function useSession(): Session | null {
  init();
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => session,
    () => null,
  );
}

export function useUser(): User | null {
  return useSession()?.user ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  return supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
}
export async function signOut() {
  await supabase.auth.signOut();
}

// ---- Auth modal control ----
type PendingAction = { label: string; onSuccess: () => void } | null;
let pending: PendingAction = null;
const modalListeners = new Set<() => void>();
function emitModal() { modalListeners.forEach((l) => l()); }

export const authModal = {
  open(label: string, onSuccess: () => void) {
    pending = { label, onSuccess };
    emitModal();
  },
  close() { pending = null; emitModal(); },
  current(): PendingAction { return pending; },
  subscribe(cb: () => void) { modalListeners.add(cb); return () => modalListeners.delete(cb); },
  fireSuccess() {
    const p = pending; pending = null; emitModal();
    p?.onSuccess();
  },
};

export function useAuthModal(): PendingAction {
  return useSyncExternalStore(authModal.subscribe, authModal.current, () => null);
}

/** Run `action` if signed in; otherwise open the auth modal first. */
export function requireAuth(label: string, action: () => void) {
  init();
  if (session?.user) { action(); return; }
  authModal.open(label, action);
}
