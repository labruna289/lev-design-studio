import { useSyncExternalStore } from "react";

const KEY = "eleve.photo.v1";
type Photo = { dataUrl: string; aspect: number } | null;
let photo: Photo = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) photo = JSON.parse(raw);
  } catch {}
}
function emit() { listeners.forEach((l) => l()); }

export const photoStore = {
  get(): Photo { load(); return photo; },
  async setFromFile(file: File) {
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const aspect: number = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img.naturalWidth / img.naturalHeight || 0.75);
      img.onerror = () => res(0.75);
      img.src = dataUrl;
    });
    photo = { dataUrl, aspect };
    try { localStorage.setItem(KEY, JSON.stringify(photo)); } catch {}
    emit();
  },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

export function usePhoto(): Photo {
  return useSyncExternalStore(
    photoStore.subscribe,
    () => photoStore.get(),
    () => null,
  );
}
