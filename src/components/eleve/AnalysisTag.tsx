export function AnalysisTag({ k, v, delay = 0 }: { k: string; v: string; delay?: number }) {
  return (
    <div
      className="card-atelier p-4 rise"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="eyebrow">{k}</div>
      <div className="serif-display text-[18px] text-ink mt-1 leading-tight">{v}</div>
    </div>
  );
}
