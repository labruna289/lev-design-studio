import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraOff, Download, Power } from "lucide-react";
import { getVideoLandmarker, detectVideoFrame } from "@/lib/facemesh-tier";
import { installMediapipeCdnShim } from "@/lib/mediapipe-cdn-shim";
import { createMakeupRenderer, hexToRgb } from "@/lib/makeup-canvas";
import {
  CATALOG, ALL_PRODUCTS, PRODUCTS_BY_ID, DEFAULT_LIVE_LOOK, LIVE_LOOKS,
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

export default function LiveMirror(_props: LiveMirrorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rendererRef = useRef<ReturnType<typeof createMakeupRenderer> | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faceFound, setFaceFound] = useState(false);
  const [startKey, setStartKey] = useState(0);

  const [active, setActive] = useState<Record<string, LiveProductState>>(() =>
    JSON.parse(JSON.stringify(DEFAULT_LIVE_LOOK)),
  );
  const [cat, setCat] = useState<Category>("lips");
  const [productId, setProductId] = useState("shine-loud");
  const [beforeAfter, setBeforeAfter] = useState(false);

  const product = PRODUCTS_BY_ID[productId];
  const state = active[productId] ?? defaultState(product);

  // Live values for the rAF loop.
  const optsRef = useRef({ active, beforeAfter });
  useEffect(() => { optsRef.current = { active, beforeAfter }; }, [active, beforeAfter]);

  useEffect(() => { installMediapipeCdnShim(); }, []);

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

  /* ---- camera + model lifecycle (StrictMode-safe; benign play() ignored) ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        video.play().catch(() => {});
        const lmkr = await getVideoLandmarker();
        if (cancelled) return;
        if (!lmkr) { setError("Face detection model could not load."); setLoading(false); return; }
        landmarkerRef.current = lmkr;
        rendererRef.current = createMakeupRenderer();
        setCameraReady(true); setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.name === "NotAllowedError"
          ? "Camera access denied. Allow it in your browser, then try again."
          : (e?.message || "Could not start the camera."));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraReady(false);
    };
  }, [startKey]);

  /* ---- render loop ---- */
  useEffect(() => {
    if (!cameraReady || !landmarkerRef.current || !rendererRef.current) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const lmkr = landmarkerRef.current;
    const renderer = rendererRef.current!;
    let lastTime = -1, lastFace = false;

    function sizeCanvas() {
      const stage = stageRef.current; if (!stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function drawVideoOnly(W: number, H: number) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const s = Math.max(W / vw, H / vh);
      const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
      ctx.setTransform(-s, 0, 0, s, ox + vw * s, oy);
      ctx.drawImage(video, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastTime < 33) return;
      lastTime = now;
      if (video.readyState < 2) return;
      sizeCanvas();
      const W = canvas.width, H = canvas.height;
      const o = optsRef.current;

      const lms = detectVideoFrame(lmkr, video, now);
      if (!lms || lms.length < 478) {
        drawVideoOnly(W, H);
        if (lastFace) { lastFace = false; setFaceFound(false); }
        return;
      }
      if (!lastFace) { lastFace = true; setFaceFound(true); }

      const products = o.beforeAfter ? [] : ALL_PRODUCTS
        .filter((p) => o.active[p.id]?.enabled)
        .sort((a, b) => a.layer - b.layer)
        .map((p) => {
          const st = o.active[p.id];
          return { paint: p.paint, shade: hexToRgb(st.shadeHex), shadeHex: st.shadeHex, finish: st.finish, intensity: st.intensity, style: st.style };
        });

      renderer.render(ctx, lms, video, W, H, { products, smoothing: 0.5, now });
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraReady]);

  function captureScreenshot() {
    const canvas = canvasRef.current; if (!canvas) return;
    const url = canvas.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a"); a.href = url; a.download = "eleve-live-look.jpg"; a.click();
    toast("Saved to your device.");
  }

  const enabledCount = useMemo(() => Object.values(active).filter((s) => s.enabled).length, [active]);

  return (
    <div className="w-full">
      {/* STAGE */}
      <div ref={stageRef} className="relative w-full overflow-hidden card-atelier select-none"
        style={{ aspectRatio: "3 / 4", padding: 0, touchAction: "none" }}>
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }} />

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

        {cameraReady && !faceFound && !loading && !error && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pill text-[11px] tracking-[0.18em] uppercase"
            style={{ padding: "8px 16px", background: "rgba(17,17,17,0.6)", color: "#FFFDF9" }}>
            Center your face in the frame
          </div>
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

      {/* CURATED LOOKS */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {LIVE_LOOKS.map((l) => (
          <button key={l.id} onClick={() => applyLook(l)}
            className="press shrink-0 serif-display italic text-[13px]"
            style={{ padding: "8px 16px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}>
            {l.title}
          </button>
        ))}
      </div>

      {/* CATEGORY TABS */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(Object.keys(CAT_LABELS) as Category[]).map((c) => {
          const activeTab = c === cat;
          return (
            <button key={c} onClick={() => { setCat(c); setProductId(CATALOG[c][0].id); }}
              className="press text-[12px]"
              style={{
                padding: "10px 0", borderRadius: 12, letterSpacing: "0.16em", textTransform: "uppercase",
                background: activeTab ? "var(--ink)" : "var(--surface)",
                color: activeTab ? "var(--surface)" : "var(--muted-ink)",
                border: `1px solid ${activeTab ? "var(--ink)" : "var(--border)"}`,
              }}>
              {CAT_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* PRODUCT LIST */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {CATALOG[cat].map((p) => {
          const sel = p.id === productId;
          const on = active[p.id]?.enabled;
          return (
            <button key={p.id} onClick={() => setProductId(p.id)}
              className="press shrink-0 inline-flex items-center gap-2 text-[12px]"
              style={{
                padding: "8px 14px", borderRadius: 999,
                background: sel ? "var(--espresso)" : "var(--surface)",
                color: sel ? "var(--surface)" : "var(--ink)",
                border: `1px solid ${on ? "var(--champagne)" : "var(--border)"}`,
              }}>
              <span style={{
                width: 7, height: 7, borderRadius: 999,
                background: on ? "var(--champagne)" : "transparent",
                boxShadow: on ? "none" : "inset 0 0 0 1px var(--border)",
              }} />
              {p.name}
            </button>
          );
        })}
      </div>

      {/* PRODUCT CONTROLS */}
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

        {/* finishes */}
        {product.finishes.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.finishes.map((f) => (
              <button key={f} onClick={() => pickFinish(f)}
                className="press text-[10.5px] tracking-[0.14em] uppercase"
                style={{
                  padding: "6px 11px", borderRadius: 999,
                  background: state.finish === f ? "var(--ink)" : "transparent",
                  color: state.finish === f ? "var(--surface)" : "var(--muted-ink)",
                  border: `1px solid ${state.finish === f ? "var(--ink)" : "var(--border)"}`,
                }}>
                {f}
              </button>
            ))}
          </div>
        )}

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
        {enabledCount} product{enabledCount === 1 ? "" : "s"} on · everything runs on your device. Nothing is stored or uploaded.
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
