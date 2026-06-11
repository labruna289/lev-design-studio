import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraOff, Download, Power } from "lucide-react";
import { hexToRgb } from "@/lib/makeup-canvas";
import { startMakeup, setShapeColor, setShapeOpacity, destroyWebARRocks } from "@/lib/webarrocks-tier";
import {
  CATALOG, PRODUCTS_BY_ID, DEFAULT_LIVE_LOOK, LIVE_LOOKS,
  type Category, type Finish, type LiveProductState, type MakeupProduct,
} from "@/lib/eleve-shades";

interface LiveMirrorProps { onBack?: () => void; }

const CAT_LABELS: Record<Category, string> = { face: "Face", eyes: "Eyes", lips: "Lips" };

function defaultState(p: MakeupProduct): LiveProductState {
  return {
    shadeHex: p.shades[0].hex,
    finish: p.finishes[0],
    intensity: p.defaultIntensity,
    enabled: false,
    style: p.styles?.[0],
  };
}

// Lip products in priority order — Stage 1 (WebAR.rocks) renders lips only.
const LIP_PRIORITY = ["shine-loud", "butter-gloss", "line-loud"];

export default function LiveMirror(_props: LiveMirrorProps) {
  const canvasVideoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasARRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startKey, setStartKey] = useState(0);

  const [active, setActive] = useState<Record<string, LiveProductState>>(() => ({
    "shine-loud": { shadeHex: "#C2502E", finish: "satin", intensity: 0.85, enabled: true },
  }));
  const [cat, setCat] = useState<Category>("lips");
  const [productId, setProductId] = useState("shine-loud");
  const [beforeAfter, setBeforeAfter] = useState(false);

  const product = PRODUCTS_BY_ID[productId];
  const state = active[productId] ?? defaultState(product);

  // The enabled lip product that drives the live lipstick (priority order).
  const lipDriver = useMemo(() => {
    for (const id of LIP_PRIORITY) { const s = active[id]; if (s?.enabled) return { ...s, id }; }
    return null;
  }, [active]);
  const showAR = !beforeAfter;

  /* ---- helpers to mutate the per-product state ---- */
  function patch(id: string, p: Partial<LiveProductState>) {
    setActive((prev) => {
      const base = prev[id] ?? defaultState(PRODUCTS_BY_ID[id]);
      return { ...prev, [id]: { ...base, ...p } };
    });
  }
  function pickShade(hex: string) { patch(productId, { shadeHex: hex, enabled: true }); }
  function pickFinish(f: Finish) { patch(productId, { finish: f, enabled: true }); }
  function pickStyle(s: string) { patch(productId, { style: s, enabled: true }); }
  function setIntensity(v: number) { patch(productId, { intensity: v }); }
  function toggleEnabled(id = productId) {
    setActive((prev) => {
      const base = prev[id] ?? defaultState(PRODUCTS_BY_ID[id]);
      return { ...prev, [id]: { ...base, enabled: !base.enabled } };
    });
  }
  function applyLook(look: typeof LIVE_LOOKS[number]) {
    setActive((prev) => {
      const next = { ...prev };
      // turn everything off first, then enable the look's products
      for (const k of Object.keys(next)) next[k] = { ...next[k], enabled: false };
      for (const [id, st] of Object.entries(look.products)) next[id] = { ...st };
      return next;
    });
    const firstId = Object.keys(look.products)[0];
    if (firstId) { setProductId(firstId); setCat(PRODUCTS_BY_ID[firstId].category); }
    toast(`${look.title} applied`);
  }

  /* ---- WebAR.rocks lifecycle (StrictMode-safe). The engine owns its own
     camera + video element and self-drives its render loop. ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        await startMakeup({ canvasVideo: canvasVideoRef.current, canvasAR: canvasARRef.current });
        if (cancelled) { await destroyWebARRocks(); return; }
        setCameraReady(true); setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        const msg = String(e?.message || e || "");
        setError(/permission|denied|NotAllowed/i.test(msg)
          ? "Camera access denied. Allow it in your browser, then try again."
          : (msg || "Could not start the mirror."));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      destroyWebARRocks();
      setCameraReady(false);
    };
  }, [startKey]);

  /* ---- push live shades + per-product intensity into the engine
     (lips, eyeshadow, blush). Opacity 0 = product off. ---- */
  useEffect(() => {
    if (!cameraReady) return;
    // Lips (priority lipstick > gloss > liner)
    if (lipDriver) setShapeColor("LIPS", "lipstickColor", hexToRgb(lipDriver.shadeHex));
    setShapeOpacity("LIPS", lipDriver ? lipDriver.intensity : 0);
    // Eyeshadow
    const eye = active["ultimate-shadow"];
    if (eye?.enabled) setShapeColor("EYES", "uEyeColor", hexToRgb(eye.shadeHex));
    setShapeOpacity("EYES", eye?.enabled ? eye.intensity : 0);
    // Blush
    const blush = active["sweet-cheeks"];
    if (blush?.enabled) setShapeColor("CHEEKS", "uBlushColor", hexToRgb(blush.shadeHex));
    setShapeOpacity("CHEEKS", blush?.enabled ? blush.intensity : 0);
  }, [cameraReady, active]);

  function captureScreenshot() {
    const v = canvasVideoRef.current, ar = canvasARRef.current;
    if (!v) return;
    const tmp = document.createElement("canvas");
    tmp.width = v.width; tmp.height = v.height;
    const c = tmp.getContext("2d")!;
    // un-mirror to match the on-screen (CSS-mirrored) view
    c.save(); c.translate(tmp.width, 0); c.scale(-1, 1);
    c.drawImage(v, 0, 0);
    if (ar && showAR) c.drawImage(ar, 0, 0);
    c.restore();
    const url = tmp.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a"); a.href = url; a.download = "eleve-live-look.jpg"; a.click();
    toast("Saved to your device.");
  }

  const enabledCount = useMemo(() => Object.values(active).filter((s) => s.enabled).length, [active]);

  return (
    <div className="w-full">
      {/* STAGE */}
      <div ref={stageRef} className="relative w-full overflow-hidden card-atelier select-none"
        style={{ aspectRatio: "3 / 4", padding: 0, touchAction: "none" }}>
        {/* WebAR.rocks stacked canvases (mirror both identically). The engine
            creates its own <video> + camera internally. */}
        <canvas id="WebARRocksFaceCanvasVideo" ref={canvasVideoRef}
          className="absolute inset-0 h-full w-full object-cover" style={{ transform: "scaleX(-1)", zIndex: 0 }} />
        <canvas id="WebARRocksFaceCanvasAR" ref={canvasARRef}
          className="absolute inset-0 h-full w-full"
          style={{ transform: "scaleX(-1)", zIndex: 1, pointerEvents: "none", opacity: showAR ? 1 : 0, transition: "opacity 150ms" }} />

        {/* before/after */}
        {cameraReady && !loading && !error && (
          <button
            onPointerDown={() => setBeforeAfter(true)}
            onPointerUp={() => setBeforeAfter(false)}
            onPointerLeave={() => setBeforeAfter(false)}
            className="absolute bottom-3 left-3 pill text-[10px] tracking-[0.2em] uppercase press"
            style={{ padding: "7px 14px", background: "rgba(17,17,17,0.6)", color: "#FFFDF9" }}>
            {beforeAfter ? "Before" : "Hold · before"}
          </button>
        )}

        {loading && (
          <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(248,243,236,0.85)", backdropFilter: "blur(10px)" }}>
            <div className="text-center">
              <div className="serif-display italic text-espresso text-[18px]">Starting your mirror…</div>
              <p className="text-[13px] text-muted-foreground mt-2">Allow camera access when prompted.</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(248,243,236,0.9)" }}>
            <div className="text-center px-6">
              <CameraOff size={32} className="mx-auto text-espresso mb-3" strokeWidth={1.25} />
              <div className="serif-display italic text-espresso text-[16px]">{error}</div>
              <button onClick={() => setStartKey((k) => k + 1)} className="mt-4 pill bg-champagne text-espresso press text-[13px]">Try again</button>
            </div>
          </div>
        )}
      </div>

      {/* PRODUCT CONTROLS (lipstick only) */}
      <div className="card-atelier mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="serif-display italic text-[15px] text-espresso">{product.name}</div>
          <button onClick={() => toggleEnabled()}
            className="press inline-flex items-center gap-1.5 text-[11px] tracking-[0.16em] uppercase"
            style={{
              padding: "6px 12px", borderRadius: 999,
              background: state.enabled ? "var(--champagne)" : "transparent",
              color: state.enabled ? "var(--espresso)" : "var(--muted-ink)",
              border: `1px solid ${state.enabled ? "var(--champagne)" : "var(--border)"}`,
            }}>
            <Power size={12} strokeWidth={1.5} /> {state.enabled ? "On" : "Off"}
          </button>
        </div>

        {/* shades */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {product.shades.map((s) => {
            const sel = state.shadeHex.toLowerCase() === s.hex.toLowerCase();
            return (
              <button key={s.hex} onClick={() => pickShade(s.hex)} title={s.name}
                className="press shrink-0 grid place-items-center"
                style={{
                  width: 42, height: 42, borderRadius: 999, background: s.hex,
                  boxShadow: sel ? "0 0 0 2px var(--surface), 0 0 0 4px var(--champagne)" : "inset 0 0 0 1px rgba(0,0,0,0.12)",
                }} aria-label={s.name} />
            );
          })}
        </div>
        <div className="mt-2 serif-display italic text-[13px] text-espresso">
          {product.shades.find((s) => s.hex.toLowerCase() === state.shadeHex.toLowerCase())?.name ?? "—"}
        </div>

        {/* styles */}
        {product.styles && (
          <div className="mt-2 flex flex-wrap gap-2">
            {product.styles.map((st) => (
              <button key={st} onClick={() => pickStyle(st)}
                className="press text-[10.5px] tracking-[0.14em] uppercase"
                style={{
                  padding: "6px 11px", borderRadius: 999,
                  background: state.style === st ? "var(--champagne)" : "transparent",
                  color: state.style === st ? "var(--espresso)" : "var(--muted-ink)",
                  border: `1px solid ${state.style === st ? "var(--champagne)" : "var(--border)"}`,
                }}>
                {st}
              </button>
            ))}
          </div>
        )}

        {/* intensity */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
            <span>Intensity</span><span>{Math.round(state.intensity * 100)}</span>
          </div>
          <IntensitySlider value={state.intensity} onChange={setIntensity} />
        </div>
      </div>

      {/* CAPTURE */}
      <div className="mt-4">
        <button onClick={captureScreenshot}
          className="pill bg-champagne text-espresso press flex items-center justify-center gap-2 text-[13px] w-full">
          <Download size={14} strokeWidth={1.25} /> Capture this look
        </button>
      </div>

      <p className="mt-4 text-center text-[11.5px] text-muted-foreground leading-relaxed italic">
        Lipstick try-on · everything runs on your device. Nothing is stored or uploaded.
      </p>
    </div>
  );
}

function IntensitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);
  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(true);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    function move(ev: PointerEvent | React.PointerEvent) {
      const r = ref.current!.getBoundingClientRect();
      const x = (("clientX" in ev ? ev.clientX : 0) - r.left) / r.width;
      onChange(clamp(x, 0, 1));
    }
    move(e.nativeEvent);
    function mv(ev: PointerEvent) { move(ev); }
    function up() { setDrag(false); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  return (
    <div ref={ref} onPointerDown={onDown} className="relative mt-2" style={{ height: 24, touchAction: "none" }}>
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2" style={{ height: 2, background: "var(--border)", borderRadius: 2 }} />
      <div className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: `calc(${value * 100}% - 11px)`, width: 22, height: 22, borderRadius: 999,
          background: "var(--surface)", boxShadow: "0 0 0 2px var(--champagne), var(--shadow-rise)",
          transform: `translateY(-50%) scale(${drag ? 1.25 : 1})`, transition: "transform 200ms var(--ease-spring)",
        }} />
    </div>
  );
}
