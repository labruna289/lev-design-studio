// @ts-nocheck
/* ============================================================
   ELEVE — mirror-logic.ts
   PROTECTED FILE: 164 unit tests cover these functions.
   Never edit. Import only.
   ============================================================ */

/* ÉLEVÉ mirror logic — pure functions, testable in Node */

/* Extract the first JSON object from a model reply that may contain extra text. */
function extractLandmarksJSON(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/* Clamp a landmark point into 0..100, or null if malformed. */
function clampPt(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? { x: Math.min(100, Math.max(0, p.x)), y: Math.min(100, Math.max(0, p.y)) }
    : null;
}

/* Map full-image % coords into a 3:4 cover-cropped stage. */
function coverMap(x, y, imgAspect) {
  const Ac = 3 / 4, Ai = imgAspect || Ac;
  if (Math.abs(Ai - Ac) < 0.002) return { x, y };
  if (Ai > Ac) {
    const vis = (Ac / Ai) * 100, off = (100 - vis) / 2;
    return { x: ((x - off) / vis) * 100, y };
  }
  const visH = (Ai / Ac) * 100, offY = (100 - visH) / 2;
  return { x, y: ((y - offY) / visH) * 100 };
}



/* Anthropometric guard: eye-to-mouth distance is ~1.0-1.2x the inter-pupil
   distance. A reported "mouth" too close to the eyes is the philtrum or
   nose base — push it down to true lip height. Too far is the chin — pull up. */
function reconcileEyesMouth(eyeL, eyeR, mouth) {
  const a = clampPt(eyeL), b = clampPt(eyeR), m = clampPt(mouth);
  if (!a || !b || !m) return mouth;
  const L = a.x <= b.x ? a : b, R = a.x <= b.x ? b : a;
  const eyeDist = R.x - L.x;
  if (eyeDist < 2) return mouth;
  const eyeMidY = (L.y + R.y) / 2;
  const unit = m.y - eyeMidY;
  if (unit < eyeDist * 0.8) return { ...mouth, y: eyeMidY + eyeDist * 1.05 };
  if (unit > eyeDist * 1.6) return { ...mouth, y: eyeMidY + eyeDist * 1.2 };
  return mouth;
}
/* Derive ALL makeup points from the three landmarks a detector can find
   reliably: the two iris centers and the mouth center (all image %).
   Eyebrow/eyelid confusion is impossible because lids are computed,
   not asked for. */
function deriveMakeupPoints(eyeL, eyeR, mouth, mouthW) {
  const a = clampPt(eyeL), b = clampPt(eyeR), m = clampPt(mouth);
  if (!a || !b || !m) return null;
  const L = a.x <= b.x ? a : b, R = a.x <= b.x ? b : a;
  if (R.x - L.x < 2) return null;
  const eyeMid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const unit = m.y - eyeMid.y;
  if (unit < 1.5 || unit > 60) return null;
  const lift = unit * 0.16;                       // shadow just above the iris
  const cheekDrop = unit * 0.62;                  // apple of the cheek
  const cheekOut = (R.x - L.x) * 0.28;
  return {
    face_found: true,
    lips: { x: m.x, y: m.y + unit * 0.08, width_pct: mouthW || (R.x - L.x) * 0.7 },
    eyelid_left: { x: L.x, y: L.y - lift },
    eyelid_right: { x: R.x, y: R.y - lift },
    cheek_left: { x: L.x - cheekOut, y: eyeMid.y + cheekDrop },
    cheek_right: { x: R.x + cheekOut, y: eyeMid.y + cheekDrop },
  };
}
/* Convert a native FaceDetector result into our landmark shape (image %). */
function fdFaceToLandmarks(face, W, H) {
  if (!face || !face.boundingBox || !W || !H) return null;
  const bb = face.boundingBox;
  const px = (v) => (v / W) * 100, py = (v) => (v / H) * 100;
  const centerOf = (l) => {
    const pts = l.locations && l.locations.length ? l.locations : (l.location ? [l.location] : []);
    if (!pts.length) return null;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: px(cx), y: py(cy) };
  };
  const lmks = face.landmarks || [];
  const eyes = lmks.filter((l) => l.type === "eye").map(centerOf).filter(Boolean).sort((a, b) => a.x - b.x);
  const mouth = lmks.filter((l) => l.type === "mouth").map(centerOf).filter(Boolean)[0] || null;
  const eyeYDefault = py(bb.y + bb.height * 0.40);
  const eyeL = eyes[0] || { x: px(bb.x + bb.width * 0.32), y: eyeYDefault };
  const eyeR = eyes[1] || { x: px(bb.x + bb.width * 0.68), y: eyeYDefault };
  const m = mouth || { x: px(bb.x + bb.width / 2), y: py(bb.y + bb.height * 0.78) };
  const lm = deriveMakeupPoints(eyeL, eyeR, m, px(bb.width) * 0.34);
  if (lm) lm.source = "device";
  return lm;
}

/* Last-resort placement in STAGE space (already cropped), draggable after. */
function heuristicLandmarks() {
  return {
    face_found: true,
    source: "approx",
    stage: true,
    lips: { x: 50, y: 63, width_pct: 13 },
    cheek_left: { x: 35.5, y: 52 },
    cheek_right: { x: 64.5, y: 52 },
    eyelid_left: { x: 40, y: 42 },
    eyelid_right: { x: 60, y: 42 },
  };
}

/* Build the staged application sequence from landmarks. */
function buildApplySequence(lm, imgAspect) {
  const map = lm.stage ? (x, y) => ({ x, y }) : (x, y) => coverMap(x, y, imgAspect);
  const lipP = clampPt(lm.lips);
  if (!lipP) return null;
  const lipSize = Math.max(10, Math.min(18, ((lm.lips && lm.lips.width_pct) || 13) * 1.15));
  const seq = [{ d: 150, t: { ...map(lipP.x, lipP.y), type: "lip", size: lipSize } }];
  const cL = clampPt(lm.cheek_left), cR = clampPt(lm.cheek_right);
  const eL = clampPt(lm.eyelid_left), eR = clampPt(lm.eyelid_right);
  if (cL) seq.push({ d: 520, t: { ...map(cL.x, cL.y), type: "blush" } });
  if (cR) seq.push({ d: 700, t: { ...map(cR.x, cR.y), type: "blush" } });
  if (eL) seq.push({ d: 950, t: { ...map(eL.x, eL.y), type: "eye" } });
  if (eR) seq.push({ d: 1080, t: { ...map(eR.x, eR.y), type: "eye" } });
  return seq;
}

/* Derive a feathered face/person region (stage-space ellipse, %) from
   landmarks, for masking the grade to the person like segmentation apps. */
function computeFaceRegion(lm, imgAspect) {
  if (!lm) return { cx: 50, cy: 48, rx: 30, ry: 34 };
  const map = lm.stage ? (x, y) => ({ x, y }) : (x, y) => coverMap(x, y, imgAspect);
  const lips = clampPt(lm.lips) && map(lm.lips.x, lm.lips.y);
  if (!lips) return { cx: 50, cy: 48, rx: 30, ry: 34 };
  const eL = clampPt(lm.eyelid_left) && map(lm.eyelid_left.x, lm.eyelid_left.y);
  const eR = clampPt(lm.eyelid_right) && map(lm.eyelid_right.x, lm.eyelid_right.y);
  const lipW = (lm.lips && lm.lips.width_pct) || 13;
  let eyeMid, eyeDist;
  if (eL && eR) {
    eyeMid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
    eyeDist = Math.max(Math.abs(eR.x - eL.x), lipW * 1.1);
  } else {
    eyeDist = lipW * 1.4;
    eyeMid = { x: lips.x, y: lips.y - lipW * 1.5 };
  }
  const unit = Math.max(lips.y - eyeMid.y, lipW * 0.9);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    cx: clamp((eyeMid.x + lips.x) / 2, 0, 100),
    cy: clamp(eyeMid.y + unit * 0.5, 0, 100),
    rx: clamp(eyeDist * 1.35, 14, 45),
    ry: clamp(unit * 1.7, 18, 50),
  };
}


/* ---- Two-pass localization helpers ---- */

/* Expand a face bounding box (image %) by a margin and clamp to frame. */
function expandBox(box, margin = 0.35) {
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  const mx = box.w * margin, my = box.h * margin;
  const x = Math.max(0, box.x - mx), y = Math.max(0, box.y - my);
  const w = Math.min(100 - x, box.w + 2 * mx), h = Math.min(100 - y, box.h + 2 * my);
  if (w < 5 || h < 5) return null;
  return { x, y, w, h };
}

/* Map a point in crop-% space back to full-image % space. */
function cropToImage(pt, box) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
  return { x: box.x + (pt.x * box.w) / 100, y: box.y + (pt.y * box.h) / 100 };
}

/* Map a full landmark set from crop space to image space. */
function landmarksFromCrop(lm, box) {
  if (!lm || !lm.face_found) return null;
  const conv = (p) => cropToImage(p, box);
  const lips = conv(lm.lips);
  if (!lips) return null;
  return {
    face_found: true,
    lips: { ...lips, width_pct: ((lm.lips.width_pct || 13) * box.w) / 100 },
    cheek_left: conv(lm.cheek_left), cheek_right: conv(lm.cheek_right),
    eyelid_left: conv(lm.eyelid_left), eyelid_right: conv(lm.eyelid_right),
  };
}

/* Geometric sanity: reject landmark sets that cannot be a face. */
function validateLandmarks(lm) {
  if (!lm || !lm.face_found) return false;
  const L = clampPt(lm.lips), eL = clampPt(lm.eyelid_left), eR = clampPt(lm.eyelid_right);
  if (!L) return false;
  if (eL && eR) {
    if (eL.y >= L.y || eR.y >= L.y) return false;            // eyes must sit above lips
    if (eR.x - eL.x < 2) return false;                       // eyes must be apart, L left of R
    const eyeMidX = (eL.x + eR.x) / 2;
    if (Math.abs(eyeMidX - L.x) > (eR.x - eL.x) * 1.2) return false; // mouth under the eyes
    const unit = L.y - (eL.y + eR.y) / 2;
    if (unit < 1.5 || unit > 60) return false;               // plausible face scale
  }
  const cL = clampPt(lm.cheek_left), cR = clampPt(lm.cheek_right);
  if (cL && cR && cR.x - cL.x < 1) return false;
  return true;
}


/* ============ Full facial-feature map ============ */
/* Schema (all image %): brow_left, brow_right, eye_left, eye_right,
   nose_tip, mouth_left, mouth_right, mouth, chin, forehead */

/* Validate anatomical ordering of a feature map. Eyes + mouth required;
   every optional feature present must sit in its anatomically valid zone. */
function validateFeatureMap(f) {
  if (!f || !f.face_found) return false;
  const g = (k) => clampPt(f[k]);
  const eL = g("eye_left"), eR = g("eye_right"), m = g("mouth");
  if (!eL || !eR || !m) return false;
  if (eR.x - eL.x < 2) return false;
  const eyeY = (eL.y + eR.y) / 2;
  if (m.y <= eyeY + 1.5) return false;
  const unit = m.y - eyeY;
  if (unit > 60) return false;
  const bL = g("brow_left"), bR = g("brow_right");
  if (bL && bL.y >= eL.y) return false;            // brows above eyes
  if (bR && bR.y >= eR.y) return false;
  const n = g("nose_tip");
  if (n && (n.y <= eyeY || n.y >= m.y)) return false;   // nose between eyes and mouth
  const c = g("chin");
  if (c && c.y <= m.y) return false;               // chin below mouth
  const fh = g("forehead");
  if (fh && fh.y >= (bL ? bL.y : eL.y)) return false;   // forehead above brows
  const mL = g("mouth_left"), mR = g("mouth_right");
  if (mL && mR && mR.x - mL.x < 1.5) return false;
  if (mL && mR && (m.x < mL.x || m.x > mR.x)) return false; // center between corners
  return true;
}

/* Derive makeup placements from the full map. Eyeshadow sits midway
   between eye and detected BROW — brow confusion is now impossible. */
function deriveFromFeatureMap(f) {
  if (!validateFeatureMap(f)) return null;
  const g = (k) => clampPt(f[k]);
  const eL = g("eye_left"), eR = g("eye_right"), m = g("mouth");
  const bL = g("brow_left"), bR = g("brow_right");
  const n = g("nose_tip"), mL = g("mouth_left"), mR = g("mouth_right");
  const eyeMid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
  const eyeDist = eR.x - eL.x;
  const unit = m.y - eyeMid.y;
  const lidY = (eye, brow) => brow ? eye.y - (eye.y - brow.y) * 0.45 : eye.y - unit * 0.16;
  const mouthW = mL && mR ? Math.max(mR.x - mL.x, eyeDist * 0.35) : eyeDist * 0.7;
  const lipX = mL && mR ? (mL.x + mR.x) / 2 : m.x;
  const cheekY = n ? n.y + unit * 0.12 : eyeMid.y + unit * 0.62;
  return {
    face_found: true,
    lips: { x: lipX, y: m.y + unit * 0.08, width_pct: mouthW },
    eyelid_left: { x: eL.x, y: lidY(eL, bL) },
    eyelid_right: { x: eR.x, y: lidY(eR, bR) },
    cheek_left: { x: eL.x - eyeDist * 0.28, y: cheekY },
    cheek_right: { x: eR.x + eyeDist * 0.28, y: cheekY },
  };
}

/* Face region for masking, anchored on forehead and chin when present. */
function regionFromFeatureMap(f, imgAspect) {
  if (!validateFeatureMap(f)) return null;
  const map = f.stage ? (x, y) => ({ x, y }) : (x, y) => coverMap(x, y, imgAspect);
  const g = (k) => { const p = clampPt(f[k]); return p ? map(p.x, p.y) : null; };
  const eL = g("eye_left"), eR = g("eye_right"), m = g("mouth");
  const fh = g("forehead"), c = g("chin");
  const eyeMid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
  const eyeDist = Math.max(eR.x - eL.x, 4);
  const unit = Math.max(m.y - eyeMid.y, 2);
  const top = fh ? fh.y : eyeMid.y - unit * 1.4;
  const bottom = c ? c.y : m.y + unit * 0.7;
  const clampv = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    cx: clampv(eyeMid.x, 0, 100),
    cy: clampv((top + bottom) / 2, 0, 100),
    rx: clampv(eyeDist * 1.05, 12, 40),
    ry: clampv(((bottom - top) / 2) * 1.12, 14, 46),
  };
}

/* Map every point of a crop-space feature map back to image space. */
function featureMapFromCrop(f, box) {
  if (!f || !f.face_found) return null;
  const keys = ["brow_left","brow_right","eye_left","eye_right","nose_tip","mouth_left","mouth_right","mouth","chin","forehead"];
  const out = { face_found: true };
  keys.forEach((k) => {
    const p = clampPt(f[k]);
    if (p) out[k] = cropToImage(p, box);
  });
  return out.eye_left && out.eye_right && out.mouth ? out : null;
}


/* ============ On-device pixel analysis (no network, no models) ============
   Classical CV for frontal selfies: skin-tone segmentation finds the face,
   darkness peaks find the eyes, redness peak finds the lips.
   Input: RGBA pixel array + dimensions (downscaled, ~160px wide). */

function isSkin(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return r > 60 && (r - g) > 17 && g > b * 0.7 && (r - b) > 20 && (mx - mn) > 18 && luma > 50 && luma < 250;
}

/* Skin presence per row/column + per-row width info. */
function skinProfiles(data, w, h) {
  const rows = new Array(h).fill(0);
  const rowL = new Array(h).fill(-1), rowR = new Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isSkin(data[i], data[i + 1], data[i + 2])) {
        rows[y]++;
        if (rowL[y] < 0) rowL[y] = x;
        rowR[y] = x;
      }
    }
  }
  return { rows, rowL, rowR };
}

/* Estimate the head segment: from the first solid skin row down to where
   width jumps (shoulders) or skin ends. Returns null without enough skin. */
function findHead(profiles, w, h) {
  const { rows, rowL, rowR } = profiles;
  const minRun = Math.max(3, Math.round(w * 0.08));
  let top = -1;
  for (let y = 0; y < h; y++) if (rows[y] >= minRun) { top = y; break; }
  if (top < 0) return null;
  /* Walk down the contiguous skin run. A face widens gradually (running
     max tracks it); shoulders appear as a sudden width jump past 1.5x. */
  let bottom = top, runningMax = 0;
  for (let y = top; y < h; y++) {
    if (rows[y] < minRun) break;
    const width = rowR[y] - rowL[y];
    if (y > top + 2 && runningMax > 0 && width > runningMax * 1.5) break;   // shoulders
    runningMax = Math.max(runningMax, width);
    bottom = y;
  }
  if (bottom - top < h * 0.12) return null;
  let l = w, r = 0;
  for (let y = top; y <= bottom; y++) { if (rowL[y] >= 0) { l = Math.min(l, rowL[y]); r = Math.max(r, rowR[y]); } }
  if (r - l < w * 0.12) return null;
  return { top, bottom, left: l, right: r };
}

/* Eyes: darkness-peak row in the upper face, then two column peaks. */
function findEyes(data, w, h, head) {
  const fh = head.bottom - head.top, fl = head.left, fr = head.right;
  const y0 = Math.round(head.top + fh * 0.18), y1 = Math.round(head.top + fh * 0.62);
  const rowDark = new Array(h).fill(0);
  for (let y = y0; y <= y1; y++) {
    for (let x = fl; x <= fr; x++) {
      const i = (y * w + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < 100) rowDark[y] += (100 - luma);
    }
  }
  let eyeRow = -1, best = 0;
  for (let y = y0; y <= y1; y++) if (rowDark[y] > best) { best = rowDark[y]; eyeRow = y; }
  if (eyeRow < 0 || best < (fr - fl) * 8) return null;
  const band = Math.max(1, Math.round(fh * 0.05));
  const colDark = new Array(w).fill(0);
  for (let y = Math.max(0, eyeRow - band); y <= Math.min(h - 1, eyeRow + band); y++) {
    for (let x = fl; x <= fr; x++) {
      const i = (y * w + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < 100) colDark[x] += (100 - luma);
    }
  }
  const mid = Math.round((fl + fr) / 2);
  let lx = -1, lbest = 0, rx = -1, rbest = 0;
  for (let x = fl; x < mid; x++) if (colDark[x] > lbest) { lbest = colDark[x]; lx = x; }
  for (let x = mid; x <= fr; x++) if (colDark[x] > rbest) { rbest = colDark[x]; rx = x; }
  if (lx < 0 || rx < 0 || lbest < 60 || rbest < 60) return null;
  const sep = rx - lx, fw = fr - fl;
  if (sep < fw * 0.2 || sep > fw * 0.75) return null;
  return { eyeL: { x: lx, y: eyeRow }, eyeR: { x: rx, y: eyeRow } };
}

/* Mouth: redness-peak row at anthropometric distance below the eyes. */
function findMouth(data, w, h, head, eyes) {
  const eyeMidY = eyes.eyeL.y, eyeDist = eyes.eyeR.x - eyes.eyeL.x;
  const y0 = Math.round(eyeMidY + eyeDist * 0.6), y1 = Math.min(h - 1, Math.round(eyeMidY + eyeDist * 1.8));
  const x0 = Math.round(eyes.eyeL.x - eyeDist * 0.2), x1 = Math.round(eyes.eyeR.x + eyeDist * 0.2);
  if (y1 <= y0) return null;
  const rowRed = new Array(h).fill(0);
  for (let y = y0; y <= y1; y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const red = r - (g + b) / 2;
      if (r > 70 && r > (g + b) * 0.78) rowRed[y] += red;
    }
  }
  let mouthY = -1, best = 0, baseline = 0, n = 0;
  for (let y = y0; y <= y1; y++) { baseline += rowRed[y]; n++; if (rowRed[y] > best) { best = rowRed[y]; mouthY = y; } }
  baseline = n ? baseline / n : 0;
  if (mouthY < 0 || best < 60 || best < baseline * 1.25) return null;
  let sum = 0, wsum = 0;
  const band = Math.max(1, Math.round(eyeDist * 0.08));
  for (let y = Math.max(0, mouthY - band); y <= Math.min(h - 1, mouthY + band); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const i = (y * w + x) * 4;
      const red = data[i] - (data[i + 1] + data[i + 2]) / 2;
      if (data[i] > 70 && data[i] > (data[i + 1] + data[i + 2]) * 0.78) { sum += red * x; wsum += red; }
    }
  }
  const mouthX = wsum > 0 ? sum / wsum : (eyes.eyeL.x + eyes.eyeR.x) / 2;
  return { x: mouthX, y: mouthY };
}

/* Full pixel analysis → feature map in image %, or null if low confidence. */
function analyzeFacePixels(data, w, h) {
  if (!data || !w || !h || data.length < w * h * 4) return null;
  const head = findHead(skinProfiles(data, w, h), w, h);
  if (!head) return null;
  const eyes = findEyes(data, w, h, head);
  if (!eyes) return null;
  const mouth = findMouth(data, w, h, head, eyes);
  if (!mouth) return null;
  const px = (x) => (x / w) * 100, py = (y) => (y / h) * 100;
  const eyeMidY = eyes.eyeL.y;
  const unitPx = mouth.y - eyeMidY;
  if (unitPx <= 0) return null;
  const f = {
    face_found: true,
    forehead: { x: px((eyes.eyeL.x + eyes.eyeR.x) / 2), y: py(Math.max(head.top, eyeMidY - unitPx * 1.1)) },
    brow_left: { x: px(eyes.eyeL.x), y: py(eyeMidY - unitPx * 0.32) },
    brow_right: { x: px(eyes.eyeR.x), y: py(eyeMidY - unitPx * 0.32) },
    eye_left: { x: px(eyes.eyeL.x), y: py(eyes.eyeL.y) },
    eye_right: { x: px(eyes.eyeR.x), y: py(eyes.eyeR.y) },
    nose_tip: { x: px((eyes.eyeL.x + eyes.eyeR.x) / 2), y: py(eyeMidY + unitPx * 0.62) },
    mouth: { x: px(mouth.x), y: py(mouth.y) },
    chin: { x: px(mouth.x), y: py(Math.min(h - 1, mouth.y + unitPx * 0.55)) },
  };
  return validateFeatureMap(f) ? f : null;
}



export {
  extractLandmarksJSON, clampPt, coverMap,
  reconcileEyesMouth, deriveMakeupPoints, fdFaceToLandmarks,
  heuristicLandmarks, buildApplySequence, computeFaceRegion,
  expandBox, cropToImage, landmarksFromCrop, validateLandmarks,
  validateFeatureMap, deriveFromFeatureMap, regionFromFeatureMap,
  featureMapFromCrop, isSkin, analyzeFacePixels,
};
