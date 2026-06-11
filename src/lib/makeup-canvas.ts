// @ts-nocheck
/* ============================================================
   ÉLEVÉ — makeup-canvas.ts
   Photorealistic canvas-2D makeup renderer (ModiFace-style).

   Principle: draw the mirrored, cover-cropped video as a base, then
   composite each product on its own offscreen layer with luminance-
   preserving blends — "multiply" for pigment depth, "color" for hue,
   "screen"/"lighter" for gloss & shimmer. Regions are polygons from the
   exact 478 MediaPipe FaceLandmarker indices, edge-feathered, so makeup
   follows the face. Landmarks are stabilised with a one-euro filter.

   render(ctx, lms, video, W, H, { products, smoothing }) where `products`
   is an ordered (by layer) list of:
     { paint, shade:[r,g,b], finish, intensity, style? }
   ============================================================ */

/* ---------- landmark index sets ---------- */
export const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

const UPPER_LASH_R = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const UPPER_LASH_L = [362, 398, 384, 385, 386, 387, 388, 466, 263];
const LOWER_LASH_R = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LOWER_LASH_L = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const CREASE_R = [226, 247, 30, 29, 27, 28, 56, 190];
const CREASE_L = [446, 467, 260, 259, 257, 258, 286, 414];
const OUTER_EYE_R = 33, INNER_EYE_R = 133;
const OUTER_EYE_L = 263, INNER_EYE_L = 362;

const BROW_R = [107, 66, 105, 63, 70, 46, 53, 52, 65, 55];
const BROW_L = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];

const CHEEK_HOLLOW_R = [116, 117, 118, 119, 50, 205, 206, 207];
const CHEEK_HOLLOW_L = [345, 346, 347, 348, 280, 425, 426, 427];
const CHEEKBONE_TOP_R = [50, 101, 36, 205];
const CHEEKBONE_TOP_L = [280, 330, 266, 425];
const BLUSH_APEX_R = 50, BLUSH_APEX_L = 280;

const NOSE_BRIDGE = [6, 197, 195, 4];
const NOSE_SIDE_R = [168, 193, 122];
const NOSE_SIDE_L = [168, 417, 351];

const CUPID_PEAK_R = 37, CUPID_PEAK_L = 267, CUPID_DIP = 0;
const LIP_LOWER_OUT = 17, LIP_LOWER_IN = 14;

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_RING_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
const EYE_RING_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];

const FACE_LEFT = 234, FACE_RIGHT = 454;
const NOSE_TIP = 1, CHIN = 152, FOREHEAD_TOP = 10;

/* ---------- color helpers ---------- */
export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgba(rgb: number[], a: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
}

/* ---------- geometry helpers ---------- */
function centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function traceSmooth(path, pts, ox = 0, oy = 0) {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2 - ox, y: (a.y + b.y) / 2 - oy });
  const m0 = mid(pts[n - 1], pts[0]);
  path.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    path.quadraticCurveTo(pts[i].x - ox, pts[i].y - oy, m.x, m.y);
  }
  path.closePath();
}
function tracePolyline(path, pts, ox = 0, oy = 0) {
  if (pts.length < 2) return;
  path.moveTo(pts[0].x - ox, pts[0].y - oy);
  for (let i = 1; i < pts.length; i++) {
    const m = { x: (pts[i - 1].x + pts[i].x) / 2 - ox, y: (pts[i - 1].y + pts[i].y) / 2 - oy };
    path.quadraticCurveTo(pts[i - 1].x - ox, pts[i - 1].y - oy, m.x, m.y);
  }
  path.lineTo(pts[pts.length - 1].x - ox, pts[pts.length - 1].y - oy);
}
function bboxOf(pts, pad) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { x: Math.floor(minX - pad), y: Math.floor(minY - pad), w: Math.ceil(maxX - minX + pad * 2), h: Math.ceil(maxY - minY + pad * 2) };
}

/* ---------- one-euro filter (per landmark coord) ---------- */
function makeOneEuro(mincutoff = 1.4, beta = 0.012, dcutoff = 1.2) {
  let xPrev = null, yPrev = null, dxPrev = null, dyPrev = null, tPrev = null;
  const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
  return function filter(pts, now) {
    let dt = tPrev == null ? 1 / 30 : (now - tPrev) / 1000;
    dt = clamp(dt, 0.008, 0.1);
    tPrev = now;
    const n = pts.length;
    if (!xPrev || xPrev.length !== n) {
      xPrev = new Float64Array(n); yPrev = new Float64Array(n);
      dxPrev = new Float64Array(n); dyPrev = new Float64Array(n);
      for (let i = 0; i < n; i++) { xPrev[i] = pts[i].x; yPrev[i] = pts[i].y; }
      return pts;
    }
    const aD = alpha(dcutoff, dt);
    for (let i = 0; i < n; i++) {
      const dx = (pts[i].x - xPrev[i]) / dt;
      const dy = (pts[i].y - yPrev[i]) / dt;
      const edx = aD * dx + (1 - aD) * dxPrev[i];
      const edy = aD * dy + (1 - aD) * dyPrev[i];
      dxPrev[i] = edx; dyPrev[i] = edy;
      const ax = alpha(mincutoff + beta * Math.abs(edx), dt);
      const ay = alpha(mincutoff + beta * Math.abs(edy), dt);
      const x = ax * pts[i].x + (1 - ax) * xPrev[i];
      const y = ay * pts[i].y + (1 - ay) * yPrev[i];
      xPrev[i] = x; yPrev[i] = y;
      pts[i].x = x; pts[i].y = y;
    }
    return pts;
  };
}

/* ============================================================
   Renderer factory
   ============================================================ */
export function createMakeupRenderer() {
  const layers: Record<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = {};
  function layer(name, w, h) {
    let L = layers[name];
    if (!L) { const c = document.createElement("canvas"); L = layers[name] = { canvas: c, ctx: c.getContext("2d") }; }
    if (L.canvas.width !== w || L.canvas.height !== h) { L.canvas.width = Math.max(1, w); L.canvas.height = Math.max(1, h); }
    else L.ctx.clearRect(0, 0, w, h);
    L.ctx.filter = "none"; L.ctx.globalAlpha = 1; L.ctx.globalCompositeOperation = "source-over";
    return L;
  }
  function reset(ctx) { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.filter = "none"; }

  // cached speckle sprite for shimmer/metallic finishes
  let speckle = null;
  function getSpeckle() {
    if (speckle) return speckle;
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const x = c.getContext("2d");
    for (let i = 0; i < 320; i++) {
      const r = Math.random() * 1.6 + 0.3;
      x.globalAlpha = Math.random() * 0.6 + 0.2;
      x.fillStyle = Math.random() > 0.5 ? "#fff" : "#fff4e0";
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2); x.fill();
    }
    speckle = c; return c;
  }

  const euro = makeOneEuro();

  /* ---- shimmer / specular helper: stamps sparkle inside the given layer's
     own alpha (call right after a layer's color fill, on that layer ctx) ---- */
  function addSpeckle(o, bb, alpha) {
    o.save();
    o.globalCompositeOperation = "source-atop"; // only where layer already painted
    o.globalAlpha = alpha;
    const sp = getSpeckle();
    for (let yy = 0; yy < bb.h; yy += 128) for (let xx = 0; xx < bb.w; xx += 128) o.drawImage(sp, xx, yy);
    o.restore();
  }

  /* ---------- FACE products ---------- */

  function paintSkinTint(ctx, P, fw, rgb, finish, intensity, W, H) {
    const oval = FACE_OVAL.map(i => P[i]);
    if (oval.some(p => !p)) return;
    // face mask (feathered) minus eyes / lips
    const m = layer("skinMask", W, H);
    const mo = m.ctx;
    mo.filter = `blur(${fw * 0.02}px)`;
    const fp = new Path2D(); traceSmooth(fp, oval); mo.fillStyle = "#fff"; mo.fill(fp);
    mo.filter = "none";
    mo.globalCompositeOperation = "destination-out";
    for (const ring of [EYE_RING_R, EYE_RING_L, LIP_OUTER, BROW_R, BROW_L]) {
      const pts = ring.map(i => P[i]); if (pts.some(p => !p)) continue;
      const rp = new Path2D(); traceSmooth(rp, pts); mo.fill(rp);
    }
    mo.globalCompositeOperation = "source-over";
    // airbrush: blurred copy of the current frame, through the mask
    const b = layer("skinBlur", W, H);
    b.ctx.filter = `blur(${Math.max(1, fw * 0.014)}px)`;
    b.ctx.drawImage(ctx.canvas, 0, 0);
    b.ctx.filter = "none";
    b.ctx.globalCompositeOperation = "destination-in";
    b.ctx.drawImage(m.canvas, 0, 0);
    b.ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = clamp(0.55 * intensity, 0, 0.7);
    ctx.drawImage(b.canvas, 0, 0);
    reset(ctx);
    // subtle tone wash
    const t = layer("skinTone", W, H);
    t.ctx.fillStyle = rgba(rgb, 1); t.ctx.fillRect(0, 0, W, H);
    t.ctx.globalCompositeOperation = "destination-in"; t.ctx.drawImage(m.canvas, 0, 0);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = clamp(0.18 * intensity, 0, 0.3);
    ctx.drawImage(t.canvas, 0, 0);
    reset(ctx);
    if (finish === "dewy") {
      // T-zone glow
      const hi = [P[NOSE_TIP], P[FOREHEAD_TOP], P[6]].filter(Boolean);
      ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.12 * intensity;
      for (const h of hi) softBlob(ctx, h.x, h.y, fw * 0.16, [255, 250, 240]);
      reset(ctx);
    }
  }

  function softBlob(c, x, y, r, rgb, peak = 0.9) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgb, peak)); g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  function paintBronzer(ctx, P, fw, rgb, finish, intensity) {
    const anchors = [P[10], P[338], P[109], P[127], P[356], P[50], P[280], P[172], P[397]].filter(Boolean);
    const L = layer("bronzer", ctxW(ctx), ctxH(ctx));
    const o = L.ctx;
    o.filter = `blur(${fw * 0.02}px)`;
    for (const a of anchors) softBlob(o, a.x, a.y, fw * 0.13, rgb, 1);
    o.filter = "none";
    if (finish === "shimmer") addSpeckle(o, { w: ctxW(ctx), h: ctxH(ctx) }, 0.1 * intensity);
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = clamp(0.28 * intensity, 0, 0.4);
    ctx.drawImage(L.canvas, 0, 0);
    reset(ctx);
  }

  function paintContour(ctx, P, fw, rgb, finish, intensity) {
    const W = ctxW(ctx), H = ctxH(ctx);
    const L = layer("contour", W, H); const o = L.ctx;
    o.filter = `blur(${fw * 0.022}px)`;
    o.fillStyle = rgba(rgb, 1);
    for (const hollow of [CHEEK_HOLLOW_R, CHEEK_HOLLOW_L]) {
      const pts = hollow.map(i => P[i]); if (pts.some(p => !p)) continue;
      const p = new Path2D(); traceSmooth(p, pts); o.fill(p);
    }
    for (const side of [NOSE_SIDE_R, NOSE_SIDE_L]) {
      const pts = side.map(i => P[i]); if (pts.some(p => !p)) continue;
      o.save(); o.lineWidth = fw * 0.02; o.lineCap = "round"; o.strokeStyle = rgba(rgb, 0.8);
      const p = new Path2D(); tracePolyline(p, pts); o.stroke(p); o.restore();
    }
    o.filter = "none";
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = clamp(0.22 * intensity, 0, 0.32);
    ctx.drawImage(L.canvas, 0, 0);
    reset(ctx);
  }

  function paintBlush(ctx, P, fw, rgb, finish, intensity) {
    for (const [apexI, outerI] of [[BLUSH_APEX_R, OUTER_EYE_R], [BLUSH_APEX_L, OUTER_EYE_L]]) {
      const c = P[apexI], eye = P[outerI]; if (!c || !eye) continue;
      const cx = c.x + (eye.x - c.x) * 0.22, cy = c.y + (eye.y - c.y) * 0.22;
      const angle = Math.atan2(eye.y - c.y, eye.x - c.x);
      const radius = Math.max(8, fw * 0.19);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(1, 0.52);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      g.addColorStop(0, rgba(rgb, 0.26 * intensity)); g.addColorStop(0.55, rgba(rgb, 0.12 * intensity)); g.addColorStop(1, rgba(rgb, 0));
      ctx.globalCompositeOperation = finish === "powder" ? "multiply" : "soft-light";
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (finish === "shimmer") {
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.12 * intensity;
        softBlob(ctx, cx, cy, radius * 0.5, [255, 240, 230], 0.5);
      }
      reset(ctx);
    }
  }

  function paintBrows(ctx, P, fw, rgb, finish, intensity) {
    const W = ctxW(ctx), H = ctxH(ctx);
    for (const idx of [BROW_R, BROW_L]) {
      const pts = idx.map(i => P[i]); if (pts.some(p => !p)) continue;
      const bb = bboxOf(pts, fw * 0.02);
      const L = layer("brow_" + idx[0], bb.w, bb.h); const o = L.ctx;
      // soft fill
      o.filter = `blur(${fw * 0.006}px)`;
      const p = new Path2D(); traceSmooth(p, pts, bb.x, bb.y);
      o.fillStyle = rgba(rgb, 0.5); o.fill(p);
      o.filter = "none";
      // hair strokes
      o.save(); o.beginPath(); traceSmooth(o, pts.map(q => ({ x: q.x, y: q.y })), bb.x, bb.y); o.clip();
      o.lineCap = "round"; o.lineWidth = Math.max(0.6, fw * 0.004);
      const c0 = centroid(pts);
      for (let i = 0; i < 110; i++) {
        const j = Math.floor(Math.random() * (pts.length - 1));
        const a = pts[j], b = pts[(j + 1) % pts.length];
        const t = Math.random();
        const sx = a.x + (b.x - a.x) * t - bb.x, sy = a.y + (b.y - a.y) * t - bb.y;
        const u = (a.x + (b.x - a.x) * t - c0.x); // x relative to centre → growth dir
        const ang = (-u / (fw * 0.5)) * 0.5 - 0.15; // front up, tail down
        const len = fw * 0.02 * (0.7 + Math.random() * 0.6);
        o.strokeStyle = rgba(rgb, 0.18 + Math.random() * 0.18);
        o.beginPath(); o.moveTo(sx, sy); o.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 0.6 - len * 0.5); o.stroke();
      }
      o.restore();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = clamp(0.55 * intensity, 0, 0.8);
      ctx.drawImage(L.canvas, bb.x, bb.y);
      reset(ctx);
    }
  }

  /* ---------- EYE products ---------- */

  function liftToward(arc, target, fLo, fHi) {
    const n = arc.length, tc = centroid(target);
    return arc.map((p, i) => {
      const t = i / (n - 1), f = fHi - (fHi - fLo) * t;
      return { x: p.x + (tc.x - p.x) * f * 0.0 + (tc.x - centroid(arc).x) * 0, y: p.y + (tc.y - p.y) * f };
    });
  }

  function paintEyeshadow(ctx, P, fw, rgb, finish, intensity, style) {
    style = style || "lid";
    const zones = {
      lid: ["lid"],
      halo: ["lid", "inner"],
      smoky: ["lid", "crease", "outerV", "lower"],
      outerV: ["lid", "outerV"],
      fullCrease: ["lid", "crease"],
    }[style] || ["lid"];
    const W = ctxW(ctx), H = ctxH(ctx);
    for (const [lashIdx, creaseIdx, outerI, innerI, lowerIdx] of [
      [UPPER_LASH_R, CREASE_R, OUTER_EYE_R, INNER_EYE_R, LOWER_LASH_R],
      [UPPER_LASH_L, CREASE_L, OUTER_EYE_L, INNER_EYE_L, LOWER_LASH_L],
    ]) {
      const lash = lashIdx.map(i => P[i]); if (lash.some(p => !p)) continue;
      const crease = creaseIdx.map(i => P[i]).filter(Boolean);
      const lashC = centroid(lash);
      const creaseC = crease.length ? centroid(crease) : { x: lashC.x, y: lashC.y - fw * 0.1 };
      const lift = { x: creaseC.x - lashC.x, y: creaseC.y - lashC.y };
      const n = lash.length;
      const all = lash.concat(crease.length ? crease.slice().reverse() : lash.map((p, i) => {
        const t = i / (n - 1), f = 0.65 - 0.3 * t;
        return { x: p.x + lift.x * f, y: p.y + lift.y * f };
      }).reverse());
      const bb = bboxOf(all, fw * 0.08);
      const L = layer("eye_" + lashIdx[0], bb.w, bb.h); const o = L.ctx;
      const blur = clamp(fw * 0.04, 1.5, 6);

      // LID WASH
      if (zones.includes("lid")) {
        const upper = lash.map((p, i) => { const t = i / (n - 1), f = 0.62 - 0.28 * t; return { x: p.x + lift.x * f, y: p.y + lift.y * f }; });
        const region = lash.concat(upper.slice().reverse());
        o.filter = `blur(${blur}px)`;
        const g = o.createLinearGradient(lashC.x - bb.x, lashC.y - bb.y, creaseC.x - bb.x, creaseC.y - bb.y);
        g.addColorStop(0, rgba(rgb, 0.6)); g.addColorStop(0.55, rgba(rgb, 0.22)); g.addColorStop(1, rgba(rgb, 0));
        o.fillStyle = g; const p = new Path2D(); traceSmooth(p, region, bb.x, bb.y); o.fill(p);
        o.filter = "none";
      }
      // CREASE deepening
      if (zones.includes("crease") && crease.length) {
        o.filter = `blur(${blur}px)`;
        o.strokeStyle = rgba(rgb.map(v => v * 0.8), 0.5); o.lineWidth = fw * 0.04; o.lineCap = "round";
        const p = new Path2D(); tracePolyline(p, crease, bb.x, bb.y); o.stroke(p);
        o.filter = "none";
      }
      // OUTER-V
      if (zones.includes("outerV")) {
        const outer = P[outerI];
        o.filter = `blur(${blur}px)`;
        softBlob(o, outer.x - bb.x, outer.y - bb.y, fw * 0.06, rgb.map(v => v * 0.6), 0.55);
        o.filter = "none";
      }
      // LOWER smoke
      if (zones.includes("lower")) {
        const lower = lowerIdx.map(i => P[i]).filter(Boolean);
        if (lower.length) {
          o.filter = `blur(${blur}px)`; o.strokeStyle = rgba(rgb, 0.3); o.lineWidth = fw * 0.018; o.lineCap = "round";
          const p = new Path2D(); tracePolyline(p, lower, bb.x, bb.y); o.stroke(p); o.filter = "none";
        }
      }

      if (finish === "shimmer" || finish === "metallic") addSpeckle(o, bb, finish === "metallic" ? 0.22 : 0.14);

      // composite union: multiply + soft-light
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.5 * intensity; ctx.drawImage(L.canvas, bb.x, bb.y);
      ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.4 * intensity; ctx.drawImage(L.canvas, bb.x, bb.y);
      reset(ctx);

      // INNER-CORNER highlight
      if (zones.includes("inner")) {
        const inner = P[innerI];
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.28 * intensity;
        softBlob(ctx, inner.x, inner.y, fw * 0.028, [255, 245, 230], 0.5);
        reset(ctx);
      }
    }
  }

  function paintEyeliner(ctx, P, fw, rgb, finish, intensity, style) {
    style = style || "winged";
    for (const [lashIdx, outerI] of [[UPPER_LASH_R, OUTER_EYE_R], [UPPER_LASH_L, OUTER_EYE_L]]) {
      const lash = lashIdx.map(i => P[i]); if (lash.some(p => !p)) continue;
      const n = lash.length;
      const eyeW = dist(lash[0], lash[n - 1]);
      let wMax = fw * 0.05;
      if (style === "thin" || style === "tightline") wMax *= 0.55;
      if (style === "graphic") wMax *= 1.4;
      const top = [], bot = [];
      for (let i = 0; i < n; i++) {
        const prev = lash[Math.max(0, i - 1)], next = lash[Math.min(n - 1, i + 1)];
        const tx = next.x - prev.x, ty = next.y - prev.y; const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len, ny = tx / len;
        const u = 1 - i / (n - 1);
        const w = wMax * Math.max(0.12, Math.sin(clamp(u / 0.8, 0, 1) * Math.PI * 0.5));
        top.push({ x: lash[i].x + nx * w, y: lash[i].y + ny * w });
        bot.push({ x: lash[i].x - nx * w * 0.2, y: lash[i].y - ny * w * 0.2 });
      }
      const region = [...top, ...bot.slice().reverse()];
      // wing
      if (style === "winged" || style === "graphic") {
        const outer = P[outerI] || lash[0];
        const dir = { x: lash[0].x - lash[1].x, y: lash[0].y - lash[1].y };
        const dl = Math.hypot(dir.x, dir.y) || 1;
        const wl = eyeW * (style === "graphic" ? 0.18 : 0.12);
        region.unshift({ x: outer.x + (dir.x / dl) * wl, y: outer.y + (dir.y / dl) * wl - eyeW * 0.05 });
      }
      const bb = bboxOf(region, 3);
      const L = layer("liner_" + lashIdx[0], bb.w, bb.h); const o = L.ctx;
      o.filter = "blur(0.7px)"; o.fillStyle = rgba(rgb, 1);
      const p = new Path2D();
      p.moveTo(region[0].x - bb.x, region[0].y - bb.y);
      for (let i = 1; i < region.length; i++) p.lineTo(region[i].x - bb.x, region[i].y - bb.y);
      p.closePath(); o.fill(p); o.filter = "none";
      if (finish === "metallic") addSpeckle(o, bb, 0.25);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = (style === "tightline" ? 0.7 : 0.9) * intensity;
      ctx.drawImage(L.canvas, bb.x, bb.y);
      reset(ctx);
    }
  }

  function paintMascara(ctx, P, fw, rgb, finish, intensity) {
    for (const [lashIdx, isUpper] of [[UPPER_LASH_R, true], [UPPER_LASH_L, true], [LOWER_LASH_R, false], [LOWER_LASH_L, false]]) {
      const lash = lashIdx.map(i => P[i]); if (lash.some(p => !p)) continue;
      const n = lash.length;
      const eyeC = centroid(lash);
      const top = [], bot = [];
      const baseW = fw * (isUpper ? 0.012 : 0.007);
      for (let i = 0; i < n; i++) {
        const prev = lash[Math.max(0, i - 1)], next = lash[Math.min(n - 1, i + 1)];
        const tx = next.x - prev.x, ty = next.y - prev.y; const len = Math.hypot(tx, ty) || 1;
        let nx = -ty / len, ny = tx / len;
        // ensure normal points away from eye centre
        if ((lash[i].x + nx - eyeC.x) ** 2 + (lash[i].y + ny - eyeC.y) ** 2 < (lash[i].x - eyeC.x) ** 2 + (lash[i].y - eyeC.y) ** 2) { nx = -nx; ny = -ny; }
        const center = 1 - Math.abs(i / (n - 1) - 0.5) * 2;
        const w = baseW * (0.4 + center);
        top.push({ x: lash[i].x + nx * w, y: lash[i].y + ny * w });
        bot.push({ x: lash[i].x - nx * baseW * 0.2, y: lash[i].y - ny * baseW * 0.2 });
      }
      const region = [...top, ...bot.slice().reverse()];
      const bb = bboxOf(region.concat(lash), fw * 0.03);
      const L = layer("masc_" + lashIdx[0], bb.w, bb.h); const o = L.ctx;
      o.fillStyle = rgba(rgb, 1);
      const p = new Path2D();
      p.moveTo(region[0].x - bb.x, region[0].y - bb.y);
      for (let i = 1; i < region.length; i++) p.lineTo(region[i].x - bb.x, region[i].y - bb.y);
      p.closePath(); o.fill(p);
      // faux lash tips (upper only)
      if (isUpper) {
        o.strokeStyle = rgba(rgb, 0.85); o.lineCap = "round";
        for (let i = 1; i < n - 1; i++) {
          const prev = lash[i - 1], next = lash[i + 1];
          const tx = next.x - prev.x, ty = next.y - prev.y; const len = Math.hypot(tx, ty) || 1;
          let nx = -ty / len, ny = tx / len;
          if ((lash[i].y + ny) > lash[i].y) { nx = -nx; ny = -ny; } // upward
          const outerBias = 0.5 + (i / (n - 1)) * 0.8;
          const ll = fw * 0.02 * outerBias;
          o.lineWidth = Math.max(0.6, fw * 0.003);
          o.beginPath();
          o.moveTo(lash[i].x - bb.x, lash[i].y - bb.y);
          o.lineTo(lash[i].x + nx * ll - bb.x, lash[i].y + ny * ll - bb.y);
          o.stroke();
        }
      }
      if (finish === "glossy") { o.globalCompositeOperation = "screen"; o.globalAlpha = 0.4; softBlob(o, eyeC.x - bb.x, eyeC.y - bb.y - fw * 0.01, fw * 0.02, [255, 255, 255], 0.6); o.globalAlpha = 1; o.globalCompositeOperation = "source-over"; }
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = (isUpper ? 0.92 : 0.5) * intensity;
      ctx.drawImage(L.canvas, bb.x, bb.y);
      reset(ctx);
    }
  }

  function paintHighlighter(ctx, P, fw, rgb, finish, intensity) {
    // Cheekbone spots sit HIGH on the bone (lift toward the outer eye), kept
    // small + soft so the result is a sheen, not a white disc.
    const spots = [];
    for (const [arr, outerI] of [[CHEEKBONE_TOP_R, OUTER_EYE_R], [CHEEKBONE_TOP_L, OUTER_EYE_L]]) {
      const c = centroid(arr.map(i => P[i]).filter(Boolean));
      const eye = P[outerI];
      const cx = eye ? c.x + (eye.x - c.x) * 0.3 : c.x;
      const cy = eye ? c.y + (eye.y - c.y) * 0.3 : c.y;
      spots.push({ x: cx, y: cy, r: fw * 0.08 });
    }
    const nose = NOSE_BRIDGE.map(i => P[i]).filter(Boolean);
    const cupids = [P[CUPID_PEAK_R], P[CUPID_PEAK_L]].filter(Boolean);
    const inner = [P[INNER_EYE_R], P[INNER_EYE_L]].filter(Boolean);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(0.22 * intensity, 0, 0.32);
    for (const s of spots) softBlob(ctx, s.x, s.y, s.r, rgb, 0.45);
    for (const i of inner) softBlob(ctx, i.x, i.y, fw * 0.022, rgb, 0.4);
    for (const c of cupids) softBlob(ctx, c.x, c.y, fw * 0.018, rgb, 0.32);
    if (nose.length >= 2) {
      ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = fw * 0.014; ctx.strokeStyle = rgba(rgb, 0.22 * intensity);
      const p = new Path2D(); tracePolyline(p, nose); ctx.stroke(p); ctx.restore();
    }
    reset(ctx);
    if (finish === "shimmer" || finish === "metallic") {
      const W = ctxW(ctx), H = ctxH(ctx);
      const L = layer("hlSpk", W, H); const o = L.ctx;
      for (const s of spots) softBlob(o, s.x, s.y, s.r, [255, 255, 255], 1);
      o.globalCompositeOperation = "source-in"; o.drawImage(getSpeckle(), 0, 0, W, H);
      ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = (finish === "metallic" ? 0.22 : 0.14) * intensity;
      ctx.drawImage(L.canvas, 0, 0);
      reset(ctx);
    }
  }

  /* ---------- LIP products ---------- */

  function lipBodyPath(P, ox, oy) {
    const outer = LIP_OUTER.map(i => P[i]), inner = LIP_INNER.map(i => P[i]);
    if (outer.some(p => !p) || inner.some(p => !p)) return null;
    const path = new Path2D(); traceSmooth(path, outer, ox, oy); traceSmooth(path, inner, ox, oy);
    return { path, outer, inner };
  }

  function paintLipLiner(ctx, P, fw, rgb, finish, intensity) {
    const outer = LIP_OUTER.map(i => P[i]); if (outer.some(p => !p)) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = rgba(rgb, clamp(0.7 * intensity, 0, 0.85));
    ctx.lineWidth = Math.max(1, fw * 0.012);
    const p = new Path2D(); traceSmooth(p, outer); ctx.stroke(p);
    // soft inner fade
    ctx.filter = `blur(${Math.max(0.6, fw * 0.004)}px)`;
    ctx.strokeStyle = rgba(rgb, 0.35 * intensity); ctx.lineWidth = Math.max(0.6, fw * 0.006);
    ctx.stroke(p);
    ctx.restore();
    reset(ctx);
  }

  function paintLipstick(ctx, P, fw, rgb, finish, intensity) {
    const lb = lipBodyPath(P, 0, 0); if (!lb) return;
    const outer = lb.outer;
    const lipW = Math.max(...outer.map(p => p.x)) - Math.min(...outer.map(p => p.x));
    const pad = Math.max(6, lipW * 0.14);
    const bb = bboxOf(outer, pad);
    const L = layer("lip", bb.w, bb.h); const o = L.ctx;
    o.filter = `blur(${clamp(lipW * 0.02, 1.5, 3.5)}px)`;
    const path = new Path2D();
    traceSmooth(path, outer, bb.x, bb.y); traceSmooth(path, lb.inner, bb.x, bb.y);
    o.fillStyle = rgba(rgb, 1); o.fill(path, "evenodd"); o.filter = "none";
    const matte = finish === "matte";
    ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = (matte ? 0.62 : 0.55) * intensity; ctx.drawImage(L.canvas, bb.x, bb.y);
    ctx.globalCompositeOperation = "color"; ctx.globalAlpha = 0.5 * intensity; ctx.drawImage(L.canvas, bb.x, bb.y);
    reset(ctx);
    // finish specular on lower lip
    if (finish !== "matte") {
      const lo = P[LIP_LOWER_OUT], li = P[LIP_LOWER_IN];
      if (lo && li) {
        const gx = (lo.x + li.x) / 2, gy = (lo.y + li.y) / 2;
        const sharp = finish === "glossy";
        const gr = lipW * (sharp ? 0.22 : 0.4);
        const al = (finish === "glossy" ? 0.4 : finish === "cream" ? 0.18 : 0.12) * intensity;
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = al;
        ctx.save(); ctx.translate(gx, gy); ctx.scale(sharp ? 2.4 : 1.4, 0.45);
        softBlob(ctx, 0, 0, gr, [255, 255, 255], 0.9); ctx.restore();
        reset(ctx);
      }
    }
  }

  function paintLipGloss(ctx, P, fw, rgb, finish, intensity, shadeHex) {
    const lb = lipBodyPath(P, 0, 0); if (!lb) return;
    const outer = lb.outer;
    const lipW = Math.max(...outer.map(p => p.x)) - Math.min(...outer.map(p => p.x));
    const isClear = shadeHex && shadeHex.toUpperCase() === "#FFFFFF";
    const bb = bboxOf(outer, Math.max(4, lipW * 0.1));
    const L = layer("gloss", bb.w, bb.h); const o = L.ctx;
    const path = new Path2D(); traceSmooth(path, outer, bb.x, bb.y); traceSmooth(path, lb.inner, bb.x, bb.y);
    // tint (skip for clear)
    if (!isClear) {
      o.save(); o.fillStyle = rgba(rgb, 1); o.fill(path, "evenodd"); o.restore();
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.3 * intensity; ctx.drawImage(L.canvas, bb.x, bb.y);
      reset(ctx);
    }
    // shine — clip specular highlights to the lip body
    const S = layer("glossS", bb.w, bb.h); const so = S.ctx;
    const anchors = [P[LIP_LOWER_OUT], P[LIP_LOWER_IN], P[CUPID_PEAK_R], P[CUPID_PEAK_L]].filter(Boolean);
    const lo = P[LIP_LOWER_OUT], li = P[LIP_LOWER_IN];
    if (lo && li) { so.save(); so.translate((lo.x + li.x) / 2 - bb.x, (lo.y + li.y) / 2 - bb.y); so.scale(2.5, 0.5); softBlob(so, 0, 0, lipW * 0.18, [255, 255, 255], 0.95); so.restore(); }
    for (const a of anchors) softBlob(so, a.x - bb.x, a.y - bb.y, lipW * (finish === "sheer" ? 0.14 : 0.09), [255, 255, 255], finish === "sheer" ? 0.5 : 0.9);
    so.globalCompositeOperation = "destination-in"; so.fill(path, "evenodd");
    if (finish === "shimmer") { so.globalCompositeOperation = "source-atop"; so.globalAlpha = 0.3; so.drawImage(getSpeckle(), 0, 0, bb.w, bb.h); so.globalAlpha = 1; }
    so.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = clamp(0.9 * intensity, 0, 1); ctx.drawImage(S.canvas, bb.x, bb.y);
    reset(ctx);
  }

  function ctxW(ctx) { return ctx.canvas.width; }
  function ctxH(ctx) { return ctx.canvas.height; }

  const painters = {
    skinTint: (ctx, P, fw, p) => paintSkinTint(ctx, P, fw, p.shade, p.finish, p.intensity, ctxW(ctx), ctxH(ctx)),
    bronzer: (ctx, P, fw, p) => paintBronzer(ctx, P, fw, p.shade, p.finish, p.intensity),
    contour: (ctx, P, fw, p) => paintContour(ctx, P, fw, p.shade, p.finish, p.intensity),
    blush: (ctx, P, fw, p) => paintBlush(ctx, P, fw, p.shade, p.finish, p.intensity),
    brows: (ctx, P, fw, p) => paintBrows(ctx, P, fw, p.shade, p.finish, p.intensity),
    eyeshadow: (ctx, P, fw, p) => paintEyeshadow(ctx, P, fw, p.shade, p.finish, p.intensity, p.style),
    eyeliner: (ctx, P, fw, p) => paintEyeliner(ctx, P, fw, p.shade, p.finish, p.intensity, p.style),
    mascara: (ctx, P, fw, p) => paintMascara(ctx, P, fw, p.shade, p.finish, p.intensity),
    highlighter: (ctx, P, fw, p) => paintHighlighter(ctx, P, fw, p.shade, p.finish, p.intensity),
    lipLiner: (ctx, P, fw, p) => paintLipLiner(ctx, P, fw, p.shade, p.finish, p.intensity),
    lipstick: (ctx, P, fw, p) => paintLipstick(ctx, P, fw, p.shade, p.finish, p.intensity),
    lipGloss: (ctx, P, fw, p) => paintLipGloss(ctx, P, fw, p.shade, p.finish, p.intensity, p.shadeHex),
  };

  function render(ctx, lms, video, W, H, opts) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const { products, smoothing } = opts;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    let P = new Array(lms.length);
    for (let i = 0; i < lms.length; i++) P[i] = { x: (1 - lms[i].x) * vw * s + ox, y: lms[i].y * vh * s + oy };
    P = euro(P, opts.now ?? performance.now());

    // base video
    ctx.setTransform(-s, 0, 0, s, ox + vw * s, oy);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    reset(ctx);

    const fw = P[FACE_LEFT] && P[FACE_RIGHT] ? Math.abs(P[FACE_RIGHT].x - P[FACE_LEFT].x) : W * 0.4;
    for (const p of products) {
      const fn = painters[p.paint];
      if (fn) { try { fn(ctx, P, fw, p); } catch (e) { reset(ctx); } }
    }
  }

  return { render };
}
