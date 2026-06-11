import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraOff, Download } from "lucide-react";
import { getVideoLandmarker, detectVideoFrame } from "@/lib/facemesh-tier";
import { installMediapipeCdnShim } from "@/lib/mediapipe-cdn-shim";
import { createMakeupRenderer, hexToRgb } from "@/lib/makeup-canvas";
import { LOOK_GRADES, SHADES, type LookGrade, type Shade } from "@/lib/eleve-shades";

type TintType = "lip" | "blush" | "eye";
type Finish = "glossy" | "matte";

interface LiveMirrorProps {
  onBack?: () => void;
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

  const [lookIdx, setLookIdx] = useState(0);
  const look: LookGrade = LOOK_GRADES[lookIdx];
  const [intensity, setIntensity] = useState(0.8);
  const [tab, setTab] = useState<TintType>("lip");
  const [shades, setShades] = useState(look.defaults);
  const [finish, setFinish] = useState<Finish>("glossy");
  const [enabled, setEnabled] = useState({ lip: true, blush: true, eye: true, liner: false });

  // Live values the rAF loop reads through refs (avoids stale closure state).
  const optsRef = useRef({ shades, intensity, finish, enabled });
  useEffect(() => {
    optsRef.current = { shades, intensity, finish, enabled };
  }, [shades, intensity, finish, enabled]);

  useEffect(() => { installMediapipeCdnShim(); }, []);

  // Reset shades to the look's defaults when the look changes.
  useEffect(() => {
    setShades(LOOK_GRADES[lookIdx].defaults);
  }, [lookIdx]);

  // Camera + model lifecycle. A `cancelled` guard makes this safe against
  // React StrictMode's dev double-mount; re-runs when `startKey` changes
  // (the "Try again" button). play() rejections are benign and ignored —
  // the render loop only needs the video's readyState, not play() success.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        video.play().catch(() => {}); // swallow benign AbortError on remount

        const lmkr = await getVideoLandmarker();
        if (cancelled) return;
        if (!lmkr) {
          setError("Face detection model could not load.");
          setLoading(false);
          return;
        }
        landmarkerRef.current = lmkr;
        rendererRef.current = createMakeupRenderer();
        setCameraReady(true);
        setLoading(false);
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

  // The render loop — draws video + makeup to the canvas every frame.
  useEffect(() => {
    if (!cameraReady || !landmarkerRef.current || !rendererRef.current) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const lmkr = landmarkerRef.current;
    const renderer = rendererRef.current;
    let lastTime = -1;
    let lastFace = false;

    function sizeCanvas() {
      const stage = stageRef.current;
      if (!stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(stage.clientWidth * dpr);
      const h = Math.round(stage.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastTime < 33) return; // ~30fps
      lastTime = now;
      if (video.readyState < 2) return;
      sizeCanvas();
      const W = canvas.width, H = canvas.height;

      const lms = detectVideoFrame(lmkr, video, now);
      const o = optsRef.current;

      if (!lms || lms.length < 478) {
        // No face — show the raw mirrored video so the user still sees themself.
        const vw = video.videoWidth, vh = video.videoHeight;
        if (vw && vh) {
          const s = Math.max(W / vw, H / vh);
          const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
          ctx.setTransform(-s, 0, 0, s, ox + vw * s, oy);
          ctx.drawImage(video, 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        if (lastFace) { lastFace = false; setFaceFound(false); }
        return;
      }
      if (!lastFace) { lastFace = true; setFaceFound(true); }

      renderer.render(ctx, lms, video, W, H, {
        shades: {
          lip: hexToRgb(o.shades.lip),
          blush: hexToRgb(o.shades.blush),
          eye: hexToRgb(o.shades.eye),
        },
        intensity: o.intensity,
        enabled: o.enabled,
        finish: o.finish,
        blushFinish: "dewy",
        smoothing: 0.5,
      });
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraReady]);

  function pickShade(s: Shade) {
    setShades((sh) => ({ ...sh, [tab]: s.hex }));
  }
  function resetTab() {
    setShades((sh) => ({ ...sh, [tab]: look.defaults[tab] }));
  }
  function toggleProduct(key: keyof typeof enabled) {
    setEnabled((e) => ({ ...e, [key]: !e[key] }));
  }

  function captureScreenshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eleve-live-look-${look.number}.jpg`;
    a.click();
    toast("Saved to your device.");
  }

  return (
    <div className="w-full">
      {/* STAGE */}
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden card-atelier select-none"
        style={{ aspectRatio: "3 / 4", padding: 0, touchAction: "none" }}
      >
        {/* Source video — kept behind the canvas (mirrored fallback before first paint). */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Canvas draws the mirrored video + makeup; fully covers the video. */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: "none" }}
        />

        {/* Hint when no face is detected */}
        {cameraReady && !faceFound && !loading && !error && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pill text-[11px] tracking-[0.18em] uppercase"
            style={{ padding: "8px 16px", background: "rgba(17,17,17,0.6)", color: "#FFFDF9" }}>
            Center your face in the frame
          </div>
        )}

        {/* Loading / error overlays */}
        {loading && (
          <div className="absolute inset-0 grid place-items-center"
            style={{ background: "rgba(248,243,236,0.85)", backdropFilter: "blur(10px)" }}>
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
              <button onClick={() => setStartKey((k) => k + 1)} className="mt-4 pill bg-champagne text-espresso press text-[13px]">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Look selector */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {LOOK_GRADES.map((l, i) => {
          const active = i === lookIdx;
          return (
            <button
              key={l.id}
              onClick={() => setLookIdx(i)}
              className="press text-left"
              style={{
                padding: "10px 12px", borderRadius: 14,
                background: active ? "var(--espresso)" : "var(--surface)",
                color: active ? "var(--surface)" : "var(--ink)",
                border: `1px solid ${active ? "var(--champagne)" : "var(--border)"}`,
              }}
            >
              <div className="eyebrow" style={{ color: active ? "var(--champagne)" : undefined }}>{l.number}</div>
              <div className="serif-display italic text-[14px] mt-0.5">{l.title}</div>
            </button>
          );
        })}
      </div>

      {/* Shade bar */}
      <div className="card-atelier mt-4 p-4">
        <div className="flex items-center gap-1">
          {(["lip", "blush", "eye"] as TintType[]).map((t) => (
            <button key={t}
              onClick={() => setTab(t)}
              className="press text-[12px]"
              style={{
                padding: "6px 12px", borderRadius: 999,
                background: tab === t ? "var(--ink)" : "transparent",
                color: tab === t ? "var(--surface)" : "var(--muted-ink)",
                letterSpacing: "0.16em", textTransform: "uppercase",
              }}>
              {t === "lip" ? "Lips" : t === "blush" ? "Blush" : "Eyes"}
            </button>
          ))}
          <button onClick={resetTab} className="ml-auto text-[11px] press tracking-[0.18em] uppercase text-muted-foreground">Reset</button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {SHADES[tab].map((s) => {
            const active = shades[tab].toLowerCase() === s.hex.toLowerCase();
            return (
              <button key={s.hex} onClick={() => pickShade(s)}
                className="press shrink-0 grid place-items-center"
                style={{
                  width: 44, height: 44, borderRadius: 999,
                  background: s.hex,
                  boxShadow: active
                    ? "0 0 0 2px var(--surface), 0 0 0 4px var(--champagne)"
                    : "inset 0 0 0 1px rgba(0,0,0,0.08)",
                }}
                aria-label={s.name}
              />
            );
          })}
        </div>
        <div className="mt-3 serif-display italic text-[14px] text-espresso">
          {SHADES[tab].find((s) => s.hex.toLowerCase() === shades[tab].toLowerCase())?.name ?? "—"}
        </div>

        {/* Intensity */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
            <span>Intensity</span><span>{Math.round(intensity * 100)}</span>
          </div>
          <IntensitySlider value={intensity} onChange={setIntensity} />
        </div>

        {/* Lip finish */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground mr-1">Lip finish</span>
          {(["glossy", "matte"] as Finish[]).map((f) => (
            <button key={f} onClick={() => setFinish(f)}
              className="press text-[11px] tracking-[0.14em] uppercase"
              style={{
                padding: "6px 12px", borderRadius: 999,
                background: finish === f ? "var(--ink)" : "transparent",
                color: finish === f ? "var(--surface)" : "var(--muted-ink)",
                border: `1px solid ${finish === f ? "var(--ink)" : "var(--border)"}`,
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* Product toggles */}
        <div className="mt-4 flex flex-wrap gap-2">
          {([["lip", "Lips"], ["blush", "Blush"], ["eye", "Eyes"], ["liner", "Liner"]] as [keyof typeof enabled, string][]).map(([key, label]) => (
            <button key={key} onClick={() => toggleProduct(key)}
              className="press inline-flex items-center text-[11px] tracking-[0.16em] uppercase"
              style={{
                padding: "8px 12px", borderRadius: 999,
                background: enabled[key] ? "var(--champagne)" : "var(--background)",
                border: `1px solid ${enabled[key] ? "var(--champagne)" : "var(--border)"}`,
                color: enabled[key] ? "var(--espresso)" : "var(--muted-ink)",
              }}>
              {label} {enabled[key] ? "on" : "off"}
            </button>
          ))}
        </div>
      </div>

      {/* Capture */}
      <div className="mt-4">
        <button onClick={captureScreenshot}
          className="pill bg-champagne text-espresso press flex items-center justify-center gap-2 text-[13px] w-full">
          <Download size={14} strokeWidth={1.25} /> Capture this look
        </button>
      </div>

      <p className="mt-5 text-center text-[11.5px] text-muted-foreground leading-relaxed italic">
        Everything runs on your device. Nothing is stored or uploaded.
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
    function up() {
      setDrag(false);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }
  return (
    <div ref={ref} onPointerDown={onDown} className="relative mt-2" style={{ height: 24, touchAction: "none" }}>
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2" style={{ height: 2, background: "var(--border)", borderRadius: 2 }} />
      <div className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: `calc(${value * 100}% - 11px)`, width: 22, height: 22, borderRadius: 999,
          background: "var(--surface)",
          boxShadow: "0 0 0 2px var(--champagne), var(--shadow-rise)",
          transform: `translateY(-50%) scale(${drag ? 1.25 : 1})`,
          transition: "transform 200ms var(--ease-spring)",
        }}
      />
    </div>
  );
}
