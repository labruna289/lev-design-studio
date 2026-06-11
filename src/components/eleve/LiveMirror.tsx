import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { Camera, CameraOff, Download, Sparkles } from "lucide-react";
import {
  getVideoLandmarker,
  detectVideoFrame,
  meshToFeatureMap,
  contourPct,
  contourToStage,
  polygonToClipPath,
  LIP_OUTER,
  FACE_OVAL,
} from "@/lib/facemesh-tier";
import { installMediapipeCdnShim } from "@/lib/mediapipe-cdn-shim";
import {
  coverMap,
  validateFeatureMap,
  deriveFromFeatureMap,
  buildApplySequence,
  regionFromFeatureMap,
  computeFaceRegion,
} from "@/lib/mirror-logic";
import { LOOK_GRADES, SHADES, type LookGrade, type Shade } from "@/lib/eleve-shades";

type TintType = "lip" | "blush" | "eye";
type Tint = { id: string; type: TintType; x: number; y: number; size?: number; shade: string };
type Polygon = Array<{ x: number; y: number }>;
type Contours = { lipOuter: Polygon | null; faceOval: Polygon | null };
type FeatureMap = Record<string, any> & { face_found: true; stage?: true };

const STRENGTHS: Record<TintType, { color: number; multiply: number }> = {
  lip: { color: 0.95, multiply: 0.5 },
  blush: { color: 0.55, multiply: 0.18 },
  eye: { color: 0.5, multiply: 0.22 },
};

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

function tintBg(t: Tint, intensity: number) {
  const wMul: Record<TintType, number> = { lip: 13, blush: 24, eye: 16 };
  const baseW = wMul[t.type] * (t.size ? t.size / 13 : 1);
  const ratio: Record<TintType, number> = { lip: 0.48, blush: 0.85, eye: 0.42 };
  const fall: Record<TintType, number> = { lip: 0.62, blush: 0.74, eye: 0.72 };
  const w = baseW;
  const h = baseW * ratio[t.type];
  const stop = `${(fall[t.type] * 100).toFixed(0)}%`;
  return (alpha: number) =>
    `radial-gradient(ellipse ${w}% ${h}% at ${t.x}% ${t.y}%, ${hexA(t.shade, alpha)} 0%, ${hexA(t.shade, alpha * 0.6)} 40%, transparent ${stop})`;
}

interface LiveMirrorProps {
  onBack?: () => void;
}

export default function LiveMirror({ onBack }: LiveMirrorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lookIdx, setLookIdx] = useState(0);
  const look: LookGrade = LOOK_GRADES[lookIdx];
  const [intensity, setIntensity] = useState(0.75);
  const [tab, setTab] = useState<TintType>("lip");
  const [shades, setShades] = useState(look.defaults);

  const [tints, setTints] = useState<Tint[]>([]);
  const [contours, setContours] = useState<Contours | null>(null);
  const [featureMap, setFeatureMap] = useState<FeatureMap | null>(null);

  // Mirror the video horizontally so it feels like looking in a mirror
  const videoStyle: React.CSSProperties = { transform: "scaleX(-1)" };

  useEffect(() => { installMediapipeCdnShim(); }, []);

  useEffect(() => {
    setShades(LOOK_GRADES[lookIdx].defaults);
    setTints((prev) => prev.map((t) => ({ ...t, shade: LOOK_GRADES[lookIdx].defaults[t.type] })));
  }, [lookIdx]);

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 854 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCameraReady(true);

      const lmkr = await getVideoLandmarker();
      if (!lmkr) {
        setError("Face detection model could not load.");
        setLoading(false);
        return;
      }
      landmarkerRef.current = lmkr;
      setLoading(false);
    } catch (e: any) {
      setError(e.message || "Camera access denied.");
      setLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  // The detection loop — runs every frame when camera is ready
  useEffect(() => {
    if (!cameraReady || !landmarkerRef.current) return;
    const video = videoRef.current!;
    const lmkr = landmarkerRef.current;
    const aspect = video.videoWidth / video.videoHeight || 0.75;
    let lastTime = -1;

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      // Throttle to ~20fps to avoid overloading
      if (now - lastTime < 50) return;
      lastTime = now;

      if (video.readyState < 2) return;

      const lms = detectVideoFrame(lmkr, video, now);
      if (!lms || lms.length < 478) return;

      const raw = meshToFeatureMap(lms);
      if (!raw) return;

      const stageMap: any = { face_found: true, stage: true };
      Object.keys(raw).forEach((k: string) => {
        if ((raw as any)[k] && Number.isFinite((raw as any)[k].x))
          stageMap[k] = coverMap((raw as any)[k].x, (raw as any)[k].y, aspect);
      });
      if (!validateFeatureMap(stageMap)) return;

      const nextContours: Contours = {
        lipOuter: contourToStage(contourPct(lms, LIP_OUTER), coverMap, aspect),
        faceOval: contourToStage(contourPct(lms, FACE_OVAL), coverMap, aspect),
      };

      setFeatureMap(stageMap);
      setContours(nextContours);

      const lm = deriveFromFeatureMap(stageMap);
      if (!lm) return;
      (lm as any).stage = true;

      const seq = buildApplySequence(lm, aspect) || [];
      // We read current shades via a ref-trick: we set tints directly from seq
      setTints((prevTints) => {
        // Preserve current shades from previous tints
        const currentShades = prevTints.length > 0
          ? { lip: prevTints.find(t => t.type === "lip")?.shade, blush: prevTints.find(t => t.type === "blush")?.shade, eye: prevTints.find(t => t.type === "eye")?.shade }
          : null;
        return seq.map((s: any, i: number) => ({
          id: `live-${i}-${s.t.type}`,
          type: s.t.type as TintType,
          x: s.t.x,
          y: s.t.y,
          size: s.t.size,
          shade: (currentShades as any)?.[s.t.type] || look.defaults[s.t.type as TintType],
        }));
      });
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraReady, look.defaults]);

  const region = useMemo(() => {
    if (featureMap) {
      const r = regionFromFeatureMap({ ...featureMap }, 0.75);
      if (r) return r;
    }
    return computeFaceRegion(null, 0.75);
  }, [featureMap]);

  const svgFaceMaskUrl = useMemo(() => {
    const poly = contours?.faceOval;
    if (!poly || poly.length < 3) return null;
    const d = poly.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z";
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
      `<defs><filter id='b' x='-20%' y='-20%' width='140%' height='140%'>` +
      `<feGaussianBlur stdDeviation='6'/></filter></defs>` +
      `<path d='${d}' fill='white' filter='url(#b)'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [contours]);

  const gradeMaskStyle = useMemo<React.CSSProperties>(() => {
    if (svgFaceMaskUrl) {
      return {
        WebkitMaskImage: svgFaceMaskUrl, maskImage: svgFaceMaskUrl,
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
      };
    }
    const { cx, cy, rx, ry } = region;
    const m = `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, #000 55%, rgba(0,0,0,0.7) 75%, transparent 100%)`;
    return { WebkitMaskImage: m, maskImage: m, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" };
  }, [svgFaceMaskUrl, region]);

  const lipClipPath = useMemo(() => {
    return contours?.lipOuter ? polygonToClipPath(contours.lipOuter) : null;
  }, [contours]);

  function pickShade(s: Shade) {
    setShades((sh) => ({ ...sh, [tab]: s.hex }));
    setTints((prev) => prev.map((t) => (t.type === tab ? { ...t, shade: s.hex } : t)));
  }

  function resetTab() {
    setShades((sh) => ({ ...sh, [tab]: look.defaults[tab] }));
    setTints((prev) => prev.map((t) => (t.type === tab ? { ...t, shade: look.defaults[tab] } : t)));
  }

  async function captureScreenshot() {
    const video = videoRef.current;
    if (!video) return;
    const W = 1080, H = 1440;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    // Mirror + cover-crop the video
    const vw = video.videoWidth, vh = video.videoHeight;
    const ar = vw / vh, target = W / H;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (ar > target) { sw = vh * target; sx = (vw - sw) / 2; }
    else { sh = vw / target; sy = (vh - sh) / 2; }
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
    // Tints
    for (const t of tints) {
      const w = (t.type === "lip" ? 13 : t.type === "blush" ? 24 : 16) * (W / 100);
      const h = w * (t.type === "lip" ? 0.48 : t.type === "blush" ? 0.85 : 0.42);
      const tx = W * t.x / 100, ty = H * t.y / 100;
      const colorA = STRENGTHS[t.type].color * intensity;
      const multA = STRENGTHS[t.type].multiply * intensity;
      const drawEllipse = (alpha: number, op: GlobalCompositeOperation) => {
        ctx.save();
        ctx.globalCompositeOperation = op;
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, Math.max(w, h));
        g.addColorStop(0, hexA(t.shade, alpha));
        g.addColorStop(1, hexA(t.shade, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(tx, ty, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      drawEllipse(colorA, "color");
      drawEllipse(multA, "multiply");
    }
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
        {/* Video feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={videoStyle}
        />

        {/* Effects overlay — only show when we have tints */}
        {tints.length > 0 && (
          <div className="absolute inset-0" style={{ isolation: "isolate", transform: "scaleX(-1)" }}>
            {/* Tints */}
            {tints.map((t) => {
              const useLipClip = t.type === "lip" && lipClipPath;
              const colorA = STRENGTHS[t.type].color * intensity;
              const multA = STRENGTHS[t.type].multiply * intensity;
              if (useLipClip) {
                return (
                  <div key={t.id + "-lip"} className="absolute inset-0 pointer-events-none"
                    style={{ clipPath: lipClipPath!, WebkitClipPath: lipClipPath! as any, filter: "blur(2px)" }}>
                    <div className="absolute inset-0"
                      style={{ background: hexA(t.shade, colorA), mixBlendMode: "color" }} />
                    <div className="absolute inset-0"
                      style={{ background: hexA(t.shade, multA), mixBlendMode: "multiply" }} />
                  </div>
                );
              }
              return (
                <div key={t.id + "-wrap"}>
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ mixBlendMode: "color", backgroundImage: tintBg(t, intensity)(colorA) }} />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ mixBlendMode: "multiply", backgroundImage: tintBg(t, intensity)(multA) }} />
                </div>
              );
            })}
          </div>
        )}

        {/* Loading / error overlay */}
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
          <div className="absolute inset-0 grid place-items-center"
            style={{ background: "rgba(248,243,236,0.9)" }}>
            <div className="text-center px-6">
              <CameraOff size={32} className="mx-auto text-espresso mb-3" strokeWidth={1.25} />
              <div className="serif-display italic text-espresso text-[16px]">{error}</div>
              <button onClick={startCamera}
                className="mt-4 pill bg-champagne text-espresso press text-[13px]">
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
      </div>

      {/* Capture */}
      <div className="mt-4 grid grid-cols-1 gap-2">
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
