import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeftRight, Download, Eye, EyeOff, Sparkles, Undo2, Share2, Box } from "lucide-react";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { usePhoto } from "@/lib/photo-store";
import { LOOK_GRADES, SHADES, type LookGrade, type Shade } from "@/lib/eleve-shades";
import {
  buildApplySequence,
  coverMap,
  deriveFromFeatureMap,
  validateFeatureMap,
  regionFromFeatureMap,
  computeFaceRegion,
  heuristicLandmarks,
  analyzeFacePixels,
  extractLandmarksJSON,
  validateLandmarks,
  expandBox,
  landmarksFromCrop,
  clampPt,
} from "@/lib/mirror-logic";
import { detectWithFaceMesh } from "@/lib/facemesh-tier";
import { supabase } from "@/integrations/supabase/client";

type TintType = "lip" | "blush" | "eye";
type Tint = { id: string; type: TintType; x: number; y: number; size?: number; shade: string };
type FeatureKey = "forehead" | "brow_left" | "brow_right" | "eye_left" | "eye_right" | "nose_tip" | "mouth_left" | "mouth_right" | "mouth" | "chin";
type FeatureMap = Partial<Record<FeatureKey, { x: number; y: number }>> & { face_found: true; stage?: true };

const FEATURE_LABELS: Record<FeatureKey, string> = {
  forehead: "Forehead",
  brow_left: "Brow",
  brow_right: "Brow",
  eye_left: "Eye",
  eye_right: "Eye",
  nose_tip: "Nose",
  mouth_left: "Corner",
  mouth_right: "Corner",
  mouth: "Lips",
  chin: "Chin",
};

const STRENGTHS: Record<TintType, { color: number; multiply: number }> = {
  lip: { color: 0.95, multiply: 0.5 },
  blush: { color: 0.55, multiply: 0.18 },
  eye: { color: 0.5, multiply: 0.22 },
};

function tintBg(t: Tint, intensity: number) {
  const wMul: Record<TintType, number> = { lip: 13, blush: 24, eye: 16 };
  const baseW = wMul[t.type] * (t.size ? t.size / 13 : 1);
  const ratio: Record<TintType, number> = { lip: 0.48, blush: 0.85, eye: 0.42 };
  const fall: Record<TintType, number> = { lip: 0.62, blush: 0.74, eye: 0.72 };
  const w = baseW;
  const h = baseW * ratio[t.type];
  const stop = `${(fall[t.type] * 100).toFixed(0)}%`;
  const grad = (alpha: number) =>
    `radial-gradient(ellipse ${w}% ${h}% at ${t.x}% ${t.y}%, ${hexA(t.shade, alpha)} 0%, ${hexA(t.shade, alpha * 0.6)} 40%, transparent ${stop})`;
  return grad;
}
function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

function heuristicFeatureMap(): FeatureMap {
  return {
    face_found: true, stage: true,
    forehead: { x: 50, y: 22 },
    brow_left: { x: 40, y: 36 },
    brow_right: { x: 60, y: 36 },
    eye_left: { x: 40, y: 42 },
    eye_right: { x: 60, y: 42 },
    nose_tip: { x: 50, y: 54 },
    mouth_left: { x: 44, y: 63 },
    mouth_right: { x: 56, y: 63 },
    mouth: { x: 50, y: 63 },
    chin: { x: 50, y: 78 },
  };
}

function landmarksToTints(lm: any, shades: { lip: string; blush: string; eye: string }): Tint[] {
  const seq = buildApplySequence(lm, lm.stage ? 0.75 : lm._aspect || 0.75);
  if (!seq) return [];
  return seq.map((s: any, i: number) => ({
    id: `t${i}-${s.t.type}`,
    type: s.t.type as TintType,
    x: s.t.x, y: s.t.y, size: s.t.size,
    shade: shades[s.t.type as TintType],
  }));
}

export default function MirrorScreen() {
  const navigate = useNavigate();
  const photo = usePhoto();
  const [lookIdx, setLookIdx] = useState(0);
  const look: LookGrade = LOOK_GRADES[lookIdx];
  const [intensity, setIntensity] = useState(0.75);
  const [tab, setTab] = useState<TintType>("lip");
  const [shades, setShades] = useState(look.defaults);
  const [tints, setTints] = useState<Tint[]>([]);
  const [tintsHistory, setTintsHistory] = useState<Tint[][]>([]);
  const [featureMap, setFeatureMap] = useState<FeatureMap | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [splitPct, setSplitPct] = useState(0); // 0 = no before; user drag to set
  const [holdBefore, setHoldBefore] = useState(false);
  const [working, setWorking] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Reset shades when look changes
  useEffect(() => {
    setShades(LOOK_GRADES[lookIdx].defaults);
    setTints((prev) => prev.map((t) => ({ ...t, shade: LOOK_GRADES[lookIdx].defaults[t.type] })));
  }, [lookIdx]);

  const region = useMemo(() => {
    if (featureMap) {
      const r = regionFromFeatureMap({ ...featureMap }, photo?.aspect ?? 0.75);
      if (r) return r;
    }
    return computeFaceRegion(null, photo?.aspect ?? 0.75);
  }, [featureMap, photo]);

  const maskImage = useMemo(() => {
    const { cx, cy, rx, ry } = region;
    return `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, #000 55%, rgba(0,0,0,0.7) 75%, transparent 100%)`;
  }, [region]);

  const pushHistory = useCallback((next: Tint[]) => {
    setTintsHistory((h) => [...h.slice(-20), tints]);
    setTints(next);
  }, [tints]);

  // Apply makeup pipeline
  async function applyMakeup() {
    if (!photo) { toast("Add a portrait first."); return; }
    setWorking(true);
    try {
      const img = await loadImage(photo.dataUrl);
      // 1) FaceMesh
      let stageMap: FeatureMap | null = null;
      try {
        const r = await detectWithFaceMesh(img as any, photo.aspect, {
          coverMap, validateFeatureMap, deriveFromFeatureMap,
        });
        if (r) stageMap = r.stageMap as FeatureMap;
      } catch {}
      // 2) pixel analysis
      if (!stageMap) {
        const px = downscaleToImageData(img, 160);
        if (px) {
          const imgF = analyzeFacePixels(px.data, px.w, px.h);
          if (imgF) {
            const sf: any = { face_found: true, stage: true };
            (Object.keys(imgF) as FeatureKey[]).forEach((k) => {
              const p = (imgF as any)[k];
              if (p && typeof p.x === "number") sf[k] = coverMap(p.x, p.y, photo.aspect);
            });
            if (validateFeatureMap(sf)) stageMap = sf;
          }
        }
      }
      // 3) Vision model via Lovable Cloud edge function (two-pass with gridded image)
      if (!stageMap) {
        try {
          const lmFull = await detectLandmarksViaEdge(img);
          if (lmFull) {
            const sf: any = { face_found: true, stage: true };
            const eL = clampPt(lmFull.eyelid_left);
            const eR = clampPt(lmFull.eyelid_right);
            const cL = clampPt(lmFull.cheek_left);
            const cR = clampPt(lmFull.cheek_right);
            const lips = clampPt(lmFull.lips);
            if (eL) sf.eye_left = coverMap(eL.x, eL.y, photo.aspect);
            if (eR) sf.eye_right = coverMap(eR.x, eR.y, photo.aspect);
            if (cL) sf.cheek_left = coverMap(cL.x, cL.y, photo.aspect);
            if (cR) sf.cheek_right = coverMap(cR.x, cR.y, photo.aspect);
            if (lips) sf.mouth = coverMap(lips.x, lips.y, photo.aspect);
            if (validateFeatureMap(sf)) stageMap = sf;
          }
        } catch {}
      }
      // 4) heuristic
      let placedByEye = false;
      if (!stageMap) { stageMap = heuristicFeatureMap(); placedByEye = true; }
      setFeatureMap(stageMap);
      const lm = deriveFromFeatureMap(stageMap as any);
      if (!lm) throw new Error("derive failed");
      (lm as any).stage = true;
      const seq = buildApplySequence(lm, photo.aspect) || [];
      // Choreograph
      const next: Tint[] = [];
      setTints([]);
      for (const s of seq) {
        await sleep(s.d / 3); // compress a touch
        const t: Tint = {
          id: `t${next.length}-${s.t.type}`,
          type: s.t.type as TintType,
          x: s.t.x, y: s.t.y, size: s.t.size,
          shade: shades[s.t.type as TintType],
        };
        next.push(t);
        setTints([...next]);
        try { navigator.vibrate?.(8); } catch {}
      }
      toast(placedByEye ? "Placed by eye — open Features to fit your face" : "Applied by the atelier ✦");
    } finally {
      setWorking(false);
    }
  }

  // Drag tint
  function onTintPointerDown(e: React.PointerEvent, id: string) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    function move(ev: PointerEvent) {
      const rect = stage.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      setTints((prev) => prev.map((t) => (t.id === id ? { ...t, x: clamp(x, 0, 100), y: clamp(y, 0, 100) } : t)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Drag feature dot
  function onFeaturePointerDown(e: React.PointerEvent, key: FeatureKey) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    function move(ev: PointerEvent) {
      const rect = stage.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      setFeatureMap((prev) => {
        if (!prev) return prev;
        const nf = { ...prev, [key]: { x: clamp(x, 0, 100), y: clamp(y, 0, 100) } } as FeatureMap;
        if (validateFeatureMap(nf as any)) {
          const lm = deriveFromFeatureMap(nf as any);
          if (lm) {
            (lm as any).stage = true;
            const seq = buildApplySequence(lm, photo?.aspect ?? 0.75) || [];
            setTints(seq.map((s: any, i: number) => ({
              id: `f${i}-${s.t.type}`, type: s.t.type as TintType, x: s.t.x, y: s.t.y, size: s.t.size,
              shade: shades[s.t.type as TintType],
            })));
          }
        }
        return nf;
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Drag split handle
  function onSplitPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    function move(ev: PointerEvent) {
      const rect = stage.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(clamp(x, 0, 100));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const effectsHidden = holdBefore;
  const clipPath = `inset(0 0 0 ${splitPct}%)`;

  // Quick "place" chips
  function placeQuick(type: TintType) {
    const stage = stageRef.current; if (!stage) return;
    const defaults = type === "lip" ? { x: 50, y: 63 } : type === "blush" ? { x: 35, y: 52 } : { x: 40, y: 42 };
    const next: Tint[] = [...tints, {
      id: `m${Date.now()}-${type}`, type, x: defaults.x, y: defaults.y, shade: shades[type],
    }];
    pushHistory(next);
  }
  function undo() {
    setTintsHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setTints(last);
      return h.slice(0, -1);
    });
  }
  function pickShade(s: Shade) {
    setShades((sh) => ({ ...sh, [tab]: s.hex }));
    setTints((prev) => prev.map((t) => (t.type === tab ? { ...t, shade: s.hex } : t)));
  }
  function resetTab() {
    setShades((sh) => ({ ...sh, [tab]: look.defaults[tab] }));
    setTints((prev) => prev.map((t) => (t.type === tab ? { ...t, shade: look.defaults[tab] } : t)));
  }

  async function download() {
    if (!photo) return;
    const W = 1080, H = 1440;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const img = await loadImage(photo.dataUrl);
    // cover-crop
    const ar = img.width / img.height;
    const target = W / H;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (ar > target) { sw = img.height * target; sx = (img.width - sw) / 2; }
    else { sh = img.width / target; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    // graded layer (face masked) — draw graded to offscreen, then mask + composite
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d")!;
    octx.filter = look.filter;
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    octx.filter = "none";
    // destination-in radial mask = face region
    const { cx, cy, rx, ry } = region;
    octx.globalCompositeOperation = "destination-in";
    const grad = octx.createRadialGradient(W * cx / 100, H * cy / 100, 0, W * cx / 100, H * cy / 100, Math.max(W * rx / 100, H * ry / 100));
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.55, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    octx.fillStyle = grad;
    octx.fillRect(0, 0, W, H);
    ctx.drawImage(off, 0, 0);
    // tints
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
    a.download = `eleve-look-${look.number}.jpg`;
    a.click();
    toast("Saved to your device.");
  }

  if (!photo) {
    return (
      <Frame withNav>
        <ScreenHeader back="/app" eyebrow="The Mirror" title="A portrait first." />
        <div className="card-atelier p-8 text-center">
          <p className="text-[14px] text-muted-foreground mb-6">
            The Mirror needs your portrait. It is read on your device.
          </p>
          <button onClick={() => navigate({ to: "/upload" })}
            className="pill bg-ink text-surface press w-full">Add a portrait</button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame withNav>
      <ScreenHeader back="/app" eyebrow="The Mirror" title="See it on you." />

      {/* STAGE */}
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden card-atelier select-none"
        style={{ aspectRatio: "3 / 4", padding: 0, touchAction: "none" }}
      >
        {/* 1. base photo */}
        <img src={photo.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />

        {/* Effects stack — clipped for before/after */}
        <div
          className="absolute inset-0"
          style={{
            isolation: "isolate",
            clipPath,
            opacity: effectsHidden ? 0 : 1,
            transition: "opacity 180ms",
          }}
        >
          {/* 2. graded copy, face-masked */}
          <img
            src={photo.dataUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            style={{
              filter: look.filter,
              WebkitMaskImage: maskImage,
              maskImage: maskImage,
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />
          {/* 3. bloom */}
          <img
            src={photo.dataUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            style={{
              filter: "blur(10px) brightness(1.2) saturate(1.05)",
              mixBlendMode: "screen",
              opacity: look.bloom * intensity,
              WebkitMaskImage: maskImage,
              maskImage: maskImage,
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />
          {/* 4. wash */}
          <div
            className="absolute inset-0"
            style={{
              background: look.wash,
              mixBlendMode: look.washBlend,
              WebkitMaskImage: maskImage,
              maskImage: maskImage,
            }}
          />
          {/* 5. tints */}
          {tints.map((t) => (
            <div key={t.id + "-c"} className="absolute inset-0 pointer-events-none"
              style={{ mixBlendMode: "color", backgroundImage: tintBg(t, intensity)(STRENGTHS[t.type].color * intensity) }} />
          ))}
          {tints.map((t) => (
            <div key={t.id + "-m"} className="absolute inset-0 pointer-events-none"
              style={{ mixBlendMode: "multiply", backgroundImage: tintBg(t, intensity)(STRENGTHS[t.type].multiply * intensity) }} />
          ))}
        </div>

        {/* Tint drag handles (small invisible discs you can grab) */}
        {tints.map((t) => (
          <div
            key={t.id + "-h"}
            onPointerDown={(e) => onTintPointerDown(e, t.id)}
            className="absolute rounded-full"
            style={{
              left: `${t.x}%`, top: `${t.y}%`,
              width: 36, height: 36, transform: "translate(-50%,-50%)",
              cursor: "grab", touchAction: "none",
            }}
            aria-label={`Move ${t.type}`}
          />
        ))}

        {/* 6. feature dots */}
        {showFeatures && featureMap && (Object.entries(featureMap) as [FeatureKey, any][])
          .filter(([k, v]) => v && typeof v.x === "number")
          .map(([k, p]) => (
            <button
              key={k}
              onPointerDown={(e) => onFeaturePointerDown(e, k)}
              className="absolute"
              style={{
                left: `${p.x}%`, top: `${p.y}%`,
                width: 16, height: 16, transform: "translate(-50%,-50%)",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1.25px solid var(--champagne)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                touchAction: "none",
              }}
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 top-[18px] text-[8px] tracking-[0.18em] uppercase font-medium"
                style={{ color: "#FFFDF9", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
              >
                {FEATURE_LABELS[k]}
              </span>
            </button>
          ))}

        {/* BEFORE label */}
        {splitPct > 4 && !effectsHidden && (
          <div className="absolute top-3 left-3 pill text-[10px] tracking-[0.22em] uppercase"
            style={{ padding: "6px 12px", background: "rgba(17,17,17,0.65)", color: "#FFFDF9" }}>
            Before
          </div>
        )}

        {/* Split handle */}
        <div
          onPointerDown={onSplitPointerDown}
          className="absolute top-0 bottom-0"
          style={{ left: `calc(${splitPct}% - 18px)`, width: 36, cursor: "ew-resize", touchAction: "none" }}
        >
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2" style={{ width: 1, background: splitPct > 0.5 ? "rgba(255,253,249,0.8)" : "transparent" }} />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full grid place-items-center"
            style={{ width: 36, height: 36, background: "var(--surface)", border: "1.25px solid var(--champagne)", boxShadow: "var(--shadow-rise)" }}
          >
            <ArrowLeftRight size={14} strokeWidth={1.25} className="text-espresso" />
          </div>
        </div>

        {/* Working overlay */}
        {working && (
          <div className="absolute inset-0 grid place-items-center"
            style={{ background: "rgba(248,243,236,0.55)", backdropFilter: "blur(10px)" }}>
            <div className="text-center">
              <div className="serif-display italic text-espresso text-[18px]">The artiste is reading your features…</div>
            </div>
          </div>
        )}
      </div>

      {/* Apply + before-hold */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={applyMakeup}
          disabled={working}
          className="pill bg-champagne text-espresso press flex-1 text-[13px]"
        >
          <Sparkles size={14} strokeWidth={1.25} className="mr-2" /> Apply the makeup for me
        </button>
        <button
          onPointerDown={() => setHoldBefore(true)}
          onPointerUp={() => setHoldBefore(false)}
          onPointerLeave={() => setHoldBefore(false)}
          className="pill bg-transparent border border-border text-ink press text-[12px]"
          style={{ padding: "12px 16px" }}
        >
          Hold · before
        </button>
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
                padding: "10px 12px",
                borderRadius: 14,
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

        {/* Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip onClick={() => placeQuick("lip")}>Place lip</Chip>
          <Chip onClick={() => placeQuick("blush")}>Place blush</Chip>
          <Chip onClick={undo}><Undo2 size={12} strokeWidth={1.5} className="mr-1.5" />Undo</Chip>
          <Chip onClick={() => setShowFeatures((v) => !v)}>
            {showFeatures ? <EyeOff size={12} strokeWidth={1.5} className="mr-1.5" /> : <Eye size={12} strokeWidth={1.5} className="mr-1.5" />}
            Features {showFeatures ? "off" : "on"}
          </Chip>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <ActionBtn onClick={download}><Download size={14} strokeWidth={1.25} />Download</ActionBtn>
        <ActionBtn onClick={() => navigate({ to: "/looks/$id", params: { id: look.id } })}><Box size={14} strokeWidth={1.25} />The pieces</ActionBtn>
        <ActionBtn onClick={() => navigate({ to: "/share/$id", params: { id: look.id } })}><Share2 size={14} strokeWidth={1.25} />Share</ActionBtn>
      </div>

      <p className="mt-5 text-center text-[11.5px] text-muted-foreground leading-relaxed italic">
        Only your face is graded — hair and room stay exactly as photographed.<br />
        Read on your device when possible. Nothing is stored.
      </p>
    </Frame>
  );
}

/* ---------- small helpers/components ---------- */

function Chip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="press inline-flex items-center text-[11px] tracking-[0.16em] uppercase"
      style={{
        padding: "8px 12px", borderRadius: 999,
        background: "var(--background)", border: "1px solid var(--border)", color: "var(--ink)",
      }}>
      {children}
    </button>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="press inline-flex items-center justify-center gap-1.5 text-[12px]"
      style={{
        padding: "12px 8px", borderRadius: 14,
        background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)",
      }}>
      {children}
    </button>
  );
}

function IntensitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);
  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(true);
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
function downscaleToImageData(img: HTMLImageElement, targetW: number) {
  const w = targetW; const h = Math.round(targetW * (img.height / img.width));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { data: d.data as unknown as Uint8ClampedArray, w, h };
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
