import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, LayoutGrid, Bookmark, User } from "lucide-react";

const tabs = [
  { to: "/app", label: "Atelier", icon: Sparkles },
  { to: "/looks", label: "Looks", icon: LayoutGrid },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [marker, setMarker] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => pathname === t.to || pathname.startsWith(t.to + "/")),
  );

  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    const container = containerRef.current;
    if (!el || !container) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const w = 22;
    setMarker({ x: r.left - c.left + r.width / 2 - w / 2, w });
  }, [activeIndex, pathname]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto mb-4 w-[calc(100%-32px)] max-w-[398px]">
        <div
          ref={containerRef}
          className="relative card-atelier flex items-stretch justify-between px-2 py-2"
          style={{ borderRadius: 28 }}
        >
          <span
            aria-hidden
            className="absolute top-1.5 h-[2px] rounded-full bg-champagne transition-all duration-500"
            style={{
              transform: `translateX(${marker.x}px)`,
              width: marker.w,
              transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
            }}
          />
          {tabs.map((t, i) => {
            const Icon = t.icon;
            const isActive = i === activeIndex;
            return (
              <Link
                key={t.to}
                to={t.to}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="flex flex-1 flex-col items-center gap-1 py-2 press"
              >
                <Icon
                  size={22}
                  strokeWidth={1.25}
                  className={isActive ? "text-ink pop" : "text-muted-foreground"}
                />
                <span
                  className={`text-[10.5px] tracking-[0.18em] uppercase ${
                    isActive ? "text-ink" : "text-muted-foreground"
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
