import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLook as getMockLook, looks as mockLooks, type Look } from "@/lib/eleve-mock";

export function useLook(slug: string) {
  return useQuery({
    queryKey: ["look", slug],
    queryFn: async (): Promise<Look> => {
      const { data: look } = await supabase
        .from("looks").select("*").eq("slug", slug).maybeSingle();
      if (!look) {
        const fallback = getMockLook(slug);
        if (fallback) return fallback;
        throw new Error("Look not found");
      }
      const { data: products } = await supabase
        .from("products").select("*").eq("look_id", look.id).order("position");
      return {
        id: look.slug,
        number: look.number,
        name: look.name,
        occasion: look.occasion,
        harmony: look.harmony,
        palette: (look.palette as string[]) ?? [],
        blurb: look.blurb,
        why: look.why,
        products: (products ?? []).map((p) => ({
          kind: p.kind as Look["products"][number]["kind"],
          name: p.name, house: p.house, initial: p.initial,
          price: p.price, note: p.note,
        })),
      };
    },
    staleTime: 60_000,
  });
}

export function useLooks() {
  return useQuery({
    queryKey: ["looks"],
    queryFn: async (): Promise<Look[]> => {
      const { data: looks } = await supabase.from("looks").select("*").order("position");
      if (!looks?.length) return mockLooks;
      const ids = looks.map((l) => l.id);
      const { data: products } = await supabase.from("products").select("*").in("look_id", ids).order("position");
      return looks.map((l) => ({
        id: l.slug, number: l.number, name: l.name, occasion: l.occasion,
        harmony: l.harmony, palette: (l.palette as string[]) ?? [],
        blurb: l.blurb, why: l.why,
        products: (products ?? []).filter((p) => p.look_id === l.id).map((p) => ({
          kind: p.kind as Look["products"][number]["kind"],
          name: p.name, house: p.house, initial: p.initial, price: p.price, note: p.note,
        })),
      }));
    },
    staleTime: 60_000,
  });
}
