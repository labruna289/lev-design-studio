import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-store";

const KEY = "eleve.saved.v1";
let saved: Set<string> = new Set();           // slugs
let slugToLookId: Map<string, string> = new Map();
const listeners = new Set<() => void>();
let loaded = false;

function emit() { listeners.forEach((l) => l()); }
function loadLocal() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = new Set(JSON.parse(raw));
  } catch {}
}
function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify([...saved])); } catch {}
}

async function ensureSlugMap() {
  if (slugToLookId.size) return;
  const { data } = await supabase.from("looks").select("id, slug");
  data?.forEach((l) => slugToLookId.set(l.slug, l.id));
}

async function pullRemote(userId: string) {
  await ensureSlugMap();
  const { data } = await supabase.from("saved_looks").select("look_id").eq("user_id", userId);
  if (!data) return;
  const idToSlug = new Map<string, string>();
  slugToLookId.forEach((v, k) => idToSlug.set(v, k));
  const remote = new Set<string>();
  data.forEach((r) => { const s = idToSlug.get(r.look_id); if (s) remote.add(s); });
  // merge local-only into remote
  const localOnly = [...saved].filter((s) => !remote.has(s));
  for (const slug of localOnly) {
    const lid = slugToLookId.get(slug);
    if (lid) await supabase.from("saved_looks").insert({ user_id: userId, look_id: lid }).select().single();
    remote.add(slug);
  }
  saved = remote;
  persistLocal();
  emit();
}

export const savedStore = {
  has(slug: string) { loadLocal(); return saved.has(slug); },
  list() { loadLocal(); return [...saved]; },
  toggle(slug: string): boolean {
    loadLocal();
    const willSave = !saved.has(slug);
    if (willSave) saved.add(slug); else saved.delete(slug);
    persistLocal();
    emit();
    // fire-and-forget remote sync
    syncOne(slug, willSave);
    return willSave;
  },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  pull: pullRemote,
};

async function syncOne(slug: string, save: boolean) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id; if (!uid) return;
  await ensureSlugMap();
  const lid = slugToLookId.get(slug); if (!lid) return;
  if (save) {
    await supabase.from("saved_looks").upsert({ user_id: uid, look_id: lid }, { onConflict: "user_id,look_id" });
  } else {
    await supabase.from("saved_looks").delete().eq("user_id", uid).eq("look_id", lid);
  }
}

export function useSaved() {
  const session = useSession();
  useEffect(() => {
    if (session?.user) savedStore.pull(session.user.id).catch(() => {});
  }, [session?.user?.id]);
  const snap = useSyncExternalStore(
    savedStore.subscribe,
    () => savedStore.list().join(","),
    () => "",
  );
  return snap ? snap.split(",").filter(Boolean) : [];
}
export function useIsSaved(slug: string) {
  const snap = useSyncExternalStore(
    savedStore.subscribe,
    () => (savedStore.has(slug) ? "1" : "0"),
    () => "0",
  );
  return snap === "1";
}
