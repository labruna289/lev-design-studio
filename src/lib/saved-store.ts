import { useSyncExternalStore } from "react";

const KEY = "eleve.saved.v1";
let saved: Set<string> = new Set();
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = new Set(JSON.parse(raw));
  } catch {}
}
function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...saved]));
  } catch {}
}
function emit() {
  listeners.forEach((l) => l());
}

let loaded = false;
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    load();
    loaded = true;
  }
}

export const savedStore = {
  has(id: string) {
    ensureLoaded();
    return saved.has(id);
  },
  list(): string[] {
    ensureLoaded();
    return [...saved];
  },
  toggle(id: string): boolean {
    ensureLoaded();
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    persist();
    emit();
    return saved.has(id);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSavedIds(): string[] {
  return useSyncExternalStore(
    savedStore.subscribe,
    () => {
      ensureLoaded();
      // identity-stable snapshot via JSON length+content; cheap enough
      return JSON.stringify([...saved]);
    },
    () => "[]",
  ) as unknown as string[] extends never ? never : never as any || savedStore.list();
}

// Cleaner hook returning array
export function useSaved() {
  const snap = useSyncExternalStore(
    savedStore.subscribe,
    () => savedStore.list().join(","),
    () => "",
  );
  // re-derive list from snapshot
  return snap ? snap.split(",").filter(Boolean) : [];
}

export function useIsSaved(id: string) {
  const snap = useSyncExternalStore(
    savedStore.subscribe,
    () => (savedStore.has(id) ? "1" : "0"),
    () => "0",
  );
  return snap === "1";
}
