import type { Product } from "@/lib/eleve-mock";

export function ProductCard({ product, delay = 0 }: { product: Product; delay?: number }) {
  return (
    <div
      className="card-atelier overflow-hidden grid grid-cols-[96px_minmax(0,1fr)] gap-0 rise"
      style={{ animationDelay: `${delay}ms`, padding: 0 }}
    >
      <div
        className="relative aspect-square grid place-items-center"
        style={{ background: "linear-gradient(160deg, var(--blush), var(--taupe))" }}
      >
        <span
          className="serif-display italic text-espresso"
          style={{ fontSize: 38, lineHeight: 1 }}
        >
          {product.initial}
        </span>
      </div>
      <div className="p-4 min-w-0">
        <div className="eyebrow">{product.kind}</div>
        <p className="serif-display text-[17px] text-ink mt-1 leading-tight truncate">
          {product.name}
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          {product.house} · {product.price}
        </p>
        <p className="serif-display italic text-[13px] text-espresso/80 mt-2 leading-snug">
          {product.note}
        </p>
      </div>
    </div>
  );
}
