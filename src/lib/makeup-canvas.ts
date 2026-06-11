// @ts-nocheck
/* ============================================================
   ÉLEVÉ — makeup-canvas.ts
   Photorealistic canvas-2D makeup renderer (ModiFace-style).

   Core principle (from L'Oréal/ModiFace patents US11344102B2 &
   US12315090B2): preserve the photo's LUMINANCE, replace only the
   CHROMINANCE. In Canvas 2D this is done by drawing the video frame
   as the base, then compositing pigment with:
     • "multiply" → pigment depth, keeps relative shading (pores,
        creases, lashes show through)
     • "color"    → tone-true recolor, keeps the skin's luminance
     • "screen"   → specular gloss highlight
   Every region is a polygon built from the exact 478 MediaPipe
   FaceLandmarker indices, edge-feathered, so makeup follows the
   face geometry instead of floating as a blob.

   The renderer holds cached offscreen canvases and the previous
   frame's mapped points (for temporal EMA smoothing).
   ============================================================ */

/* ---- Landmark index sets (0-based into faceLandmarks[0], 478 pts) ---- */
// Lips — reuse the same closed loop the rest of the app exports.
export const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
// Upper eyelid lash lines, ordered outer-corner → inner-corner.
export const LEFT_UPPER_EYELID = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const RIGHT_UPPER_EYELID = [33, 246, 161, 160, 159, 158, 157, 173, 133];
// Eyebrow lower edges (ceiling for eyeshadow).
export const LEFT_EYEBROW_LOWER = [336, 296, 334, 293, 300];
export const RIGHT_EYEBROW_LOWER = [107, 66, 105, 63, 70];
// Cheekbone anchor clusters (apex listed first).
export const LEFT_CHEEK_APEX = 280;
export const RIGHT_CHEEK_APEX = 50;
// Eye corners (outer) — used for blush tilt + eyeliner wing.
export const LEFT_OUTER_EYE = 263;
export const RIGHT_OUTER_EYE = 33;
// Face width anchors (jaw/ear sides).
export const FACE_LEFT = 234;
export const FACE_RIGHT = 454;
// Lower-lip mids for gloss placement.
const LIP_OUTER_LOWER_MID = 17;
const LIP_INNER_LOWER_MID = 14;

/* ---- color helpers ---- */
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgba(rgb: number[], a: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
}

/* ---- geometry helpers ---- */
function centroid(pts: { x: number; y: number }[]) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

/* Trace a smooth closed loop through `pts` (quadratic curves through
   midpoints — Catmull-Rom-ish) into a Path2D, offset by (-ox,-oy). */
function traceSmooth(path: Path2D, pts: { x: number; y: number }[], ox = 0, oy = 0) {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a: any, b: any) => ({ x: (a.x + b.x) / 2 - ox, y: (a.y + b.y) / 2 - oy });
  const m0 = mid(pts[n - 1], pts[0]);
  path.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(curr, next);
    path.quadraticCurveTo(curr.x - ox, curr.y - oy, m.x, m.y);
  }
  path.closePath();
}

/* Tight bounding box of points with padding. */
function bboxOf(pts: { x: number; y: number }[], pad: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    w: Math.ceil(maxX - minX + pad * 2),
    h: Math.ceil(maxY - minY + pad * 2),
  };
}

/* ============================================================
   Renderer factory — owns cached offscreen layers + prev frame.
   ============================================================ */
export function createMakeupRenderer() {
  const layers: Record<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = {};
  function layer(name: string, w: number, h: number) {
    let L = layers[name];
    if (!L) {
      const c = document.createElement("canvas");
      L = layers[name] = { canvas: c, ctx: c.getContext("2d")! };
    }
    if (L.canvas.width !== w || L.canvas.height !== h) {
      L.canvas.width = Math.max(1, w);
      L.canvas.height = Math.max(1, h);
    } else {
      L.ctx.clearRect(0, 0, w, h);
    }
    L.ctx.filter = "none";
    L.ctx.globalAlpha = 1;
    L.ctx.globalCompositeOperation = "source-over";
    return L;
  }

  let prevP: { x: number; y: number }[] | null = null;

  function resetCtx(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
  }

  /* ---- LIPS ---- */
  function paintLips(ctx, P, shadeRgb, intensity, finish) {
    const outer = LIP_OUTER.map((i) => P[i]);
    const inner = LIP_INNER.map((i) => P[i]);
    if (outer.some((p) => !p)) return;
    const lipW = Math.max(...outer.map((p) => p.x)) - Math.min(...outer.map((p) => p.x));
    if (lipW <= 0) return;
    const pad = Math.max(6, lipW * 0.14);
    const bb = bboxOf(outer, pad);
    if (bb.w <= 0 || bb.h <= 0) return;
    const L = layer("lip", bb.w, bb.h);
    const o = L.ctx;
    const blur = clamp(lipW * 0.02, 1.5, 3.5);
    o.filter = `blur(${blur}px)`;
    const path = new Path2D();
    traceSmooth(path, outer, bb.x, bb.y);
    traceSmooth(path, inner, bb.x, bb.y);
    o.fillStyle = rgba(shadeRgb, 1);
    o.fill(path, "evenodd");
    o.filter = "none";

    const matte = finish === "matte";
    // Pass A — depth (multiply)
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = (matte ? 0.62 : 0.55) * intensity;
    ctx.drawImage(L.canvas, bb.x, bb.y);
    // Pass B — hue lock (color)
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = 0.5 * intensity;
    ctx.drawImage(L.canvas, bb.x, bb.y);
    // Pass C — gloss (screen), glossy finish only
    if (!matte) {
      const lo = P[LIP_OUTER_LOWER_MID], li = P[LIP_INNER_LOWER_MID];
      if (lo && li) {
        const gx = (lo.x + li.x) / 2, gy = (lo.y + li.y) / 2;
        const gr = Math.max(4, lipW * 0.35);
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.22 * intensity;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(1, 0.45);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, gr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    resetCtx(ctx);
  }

  /* ---- EYESHADOW (one eye) ---- */
  function paintEyeshadow(ctx, P, lashIdx, browIdx, shadeRgb, intensity, key) {
    const lash = lashIdx.map((i) => P[i]);
    const brow = browIdx.map((i) => P[i]);
    if (lash.some((p) => !p) || brow.some((p) => !p)) return;
    const lashC = centroid(lash), browC = centroid(brow);
    const lift = { x: browC.x - lashC.x, y: browC.y - lashC.y };
    const n = lash.length;
    // Upper boundary: push each lash point toward the brow, taller over
    // the outer third (index 0 = outer corner).
    const upper = lash.map((p, i) => {
      const t = i / (n - 1);
      const f = 0.6 - 0.3 * t;
      return { x: p.x + lift.x * f, y: p.y + lift.y * f };
    });
    const region = lash.concat(upper.slice().reverse());
    const eyeW = dist(lash[0], lash[n - 1]);
    const pad = Math.max(4, eyeW * 0.12);
    const bb = bboxOf(region, pad);
    if (bb.w <= 0 || bb.h <= 0) return;
    const L = layer(key, bb.w, bb.h);
    const o = L.ctx;
    const blur = clamp(eyeW * 0.04, 1.5, 5);
    o.filter = `blur(${blur}px)`;
    // Vertical gradient: strong at lash line, fades toward brow.
    const g = o.createLinearGradient(lashC.x - bb.x, lashC.y - bb.y, browC.x - bb.x, browC.y - bb.y);
    g.addColorStop(0, rgba(shadeRgb, 0.62));
    g.addColorStop(0.55, rgba(shadeRgb, 0.22));
    g.addColorStop(1, rgba(shadeRgb, 0));
    o.fillStyle = g;
    const path = new Path2D();
    traceSmooth(path, region, bb.x, bb.y);
    o.fill(path);
    o.filter = "none";

    // Pass A — deepen socket (multiply), lets crease + lashes show through
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.5 * intensity;
    ctx.drawImage(L.canvas, bb.x, bb.y);
    // Pass B — sheer color wash (soft-light)
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.4 * intensity;
    ctx.drawImage(L.canvas, bb.x, bb.y);
    resetCtx(ctx);
  }

  /* ---- EYELINER (one eye) — tapered ribbon along the lash line ---- */
  function paintEyeliner(ctx, P, lashIdx, outerIdx, intensity, key) {
    const lash = lashIdx.map((i) => P[i]);
    if (lash.some((p) => !p)) return;
    const n = lash.length;
    const eyeW = dist(lash[0], lash[n - 1]);
    const wMax = Math.max(1.2, eyeW * 0.05);
    const top: { x: number; y: number }[] = [];
    const bot: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = lash[Math.max(0, i - 1)];
      const next = lash[Math.min(n - 1, i + 1)];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len; // unit normal
      const u = 1 - i / (n - 1); // 1 at outer corner, 0 at inner
      // thin at inner, thickest ~75% toward outer, taper at very outer
      const w = wMax * Math.max(0.12, Math.sin(clamp(u / 0.8, 0, 1) * Math.PI * 0.5));
      top.push({ x: lash[i].x + nx * w, y: lash[i].y + ny * w });
      bot.push({ x: lash[i].x - nx * w * 0.25, y: lash[i].y - ny * w * 0.25 });
    }
    // Wing past the outer corner (index 0).
    const outer = P[outerIdx] || lash[0];
    const dir = { x: lash[0].x - lash[1].x, y: lash[0].y - lash[1].y };
    const dl = Math.hypot(dir.x, dir.y) || 1;
    const wing = { x: outer.x + (dir.x / dl) * eyeW * 0.12, y: outer.y + (dir.y / dl) * eyeW * 0.12 - eyeW * 0.04 };

    const region = [wing, ...top, ...bot.slice().reverse()];
    const pad = 3;
    const bb = bboxOf(region, pad);
    if (bb.w <= 0 || bb.h <= 0) return;
    const L = layer(key, bb.w, bb.h);
    const o = L.ctx;
    o.filter = "blur(0.8px)";
    o.fillStyle = "rgba(20,16,14,1)";
    const path = new Path2D();
    path.moveTo(region[0].x - bb.x, region[0].y - bb.y);
    for (let i = 1; i < region.length; i++) path.lineTo(region[i].x - bb.x, region[i].y - bb.y);
    path.closePath();
    o.fill(path);
    o.filter = "none";

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.9 * intensity;
    ctx.drawImage(L.canvas, bb.x, bb.y);
    resetCtx(ctx);
  }

  /* ---- BLUSH (one cheek) — elliptical radial gradient on the cheekbone ---- */
  function paintBlush(ctx, P, apexIdx, outerEyeIdx, faceWidth, shadeRgb, intensity, finish) {
    const c = P[apexIdx], eye = P[outerEyeIdx];
    if (!c || !eye) return;
    // Lift the centre ~22% up the cheekbone toward the outer eye so the
    // flush sits on the cheekbone, not the apple, and sweeps to the temple.
    const cx = c.x + (eye.x - c.x) * 0.22;
    const cy = c.y + (eye.y - c.y) * 0.22;
    const angle = Math.atan2(eye.y - c.y, eye.x - c.x);
    const radius = Math.max(8, faceWidth * 0.19);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(1, 0.52);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    // Softer, more diffuse falloff so it reads as a natural flush, not a disc.
    g.addColorStop(0, rgba(shadeRgb, 0.26 * intensity));
    g.addColorStop(0.55, rgba(shadeRgb, 0.12 * intensity));
    g.addColorStop(1, rgba(shadeRgb, 0));
    ctx.globalCompositeOperation = finish === "powder" ? "multiply" : "soft-light";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    resetCtx(ctx);
  }

  /* ---- main per-frame entry ---- */
  function render(ctx, lms, video, W, H, opts) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const { shades, intensity, enabled, finish, blushFinish, smoothing } = opts;

    // cover-crop scale + mirror offset
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2;
    const oy = (H - vh * s) / 2;

    // map normalized landmarks → mirrored canvas pixels
    const P: { x: number; y: number }[] = new Array(lms.length);
    for (let i = 0; i < lms.length; i++) {
      P[i] = { x: (1 - lms[i].x) * vw * s + ox, y: lms[i].y * vh * s + oy };
    }
    // temporal EMA smoothing to kill jitter
    const a = smoothing ?? 0.5;
    if (prevP && prevP.length === P.length) {
      for (let i = 0; i < P.length; i++) {
        P[i].x = a * P[i].x + (1 - a) * prevP[i].x;
        P[i].y = a * P[i].y + (1 - a) * prevP[i].y;
      }
    }
    prevP = P;

    // base layer: mirrored cover-cropped video
    ctx.setTransform(-s, 0, 0, s, ox + vw * s, oy);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resetCtx(ctx);

    const faceWidth = P[FACE_LEFT] && P[FACE_RIGHT] ? Math.abs(P[FACE_RIGHT].x - P[FACE_LEFT].x) : W * 0.4;

    // back-to-front: blush → eyeshadow → eyeliner → lips
    if (enabled.blush) {
      paintBlush(ctx, P, LEFT_CHEEK_APEX, LEFT_OUTER_EYE, faceWidth, shades.blush, intensity, blushFinish);
      paintBlush(ctx, P, RIGHT_CHEEK_APEX, RIGHT_OUTER_EYE, faceWidth, shades.blush, intensity, blushFinish);
    }
    if (enabled.eye) {
      paintEyeshadow(ctx, P, LEFT_UPPER_EYELID, LEFT_EYEBROW_LOWER, shades.eye, intensity, "eyeL");
      paintEyeshadow(ctx, P, RIGHT_UPPER_EYELID, RIGHT_EYEBROW_LOWER, shades.eye, intensity, "eyeR");
    }
    if (enabled.liner) {
      paintEyeliner(ctx, P, LEFT_UPPER_EYELID, LEFT_OUTER_EYE, intensity, "linerL");
      paintEyeliner(ctx, P, RIGHT_UPPER_EYELID, RIGHT_OUTER_EYE, intensity, "linerR");
    }
    if (enabled.lip) {
      paintLips(ctx, P, shades.lip, intensity, finish);
    }
  }

  return { render, _hexToRgb: hexToRgb };
}

export { hexToRgb };
