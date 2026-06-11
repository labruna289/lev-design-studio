// @ts-nocheck
/**
 * Élevé — facemesh-tier.js
 * Production detection tier: MediaPipe FaceLandmarker → Élevé feature map.
 *
 * Usage (inside autoApply / mirror-entry effect, BEFORE detectOnDevice):
 *   import { detectWithFaceMesh } from "./facemesh-tier";
 *   let result = await detectWithFaceMesh(downscaledImg, aspect, { coverMap, validateFeatureMap, deriveFromFeatureMap });
 *   if (result) result.lm.source = "mesh";
 *
 * Assets (self-hosted, see spec §2):
 *   /public/mediapipe/wasm/*           (from @mediapipe/tasks-vision package)
 *   /public/mediapipe/face_landmarker.task
 */

let landmarkerPromise = null;

/** Lazy singleton. Resolves to null (never throws) if unavailable. */
async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
          runningMode: "IMAGE",
          numFaces: 1,
          outputFaceBlendshapes: false,
        });
      } catch (e) {
        console.warn("[eleve] FaceLandmarker unavailable:", e?.message || e);
        return null;
      }
    })();
  }
  return landmarkerPromise;
}

/* ---- Topology (verify via golden-image tests before release, spec §3/§7) ---- */
const IRIS_A = [468, 469, 470, 471, 472];   // one eye's iris ring
const IRIS_B = [473, 474, 475, 476, 477];   // the other eye's iris ring
const LIP_UPPER_INNER = 13, LIP_LOWER_INNER = 14;
const MOUTH_CORNER_A = 61, MOUTH_CORNER_B = 291;
const NOSE_TIP = 1, CHIN = 152, OVAL_TOP = 10;
const BROW_A = 105, BROW_B = 334;
export const LIP_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
export const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

const pct = (p) => ({ x: p.x * 100, y: p.y * 100 });
const mean = (lms, idxs) => {
  const pts = idxs.map((i) => lms[i]).filter(Boolean);
  if (pts.length !== idxs.length) return null;
  return pct({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
};
const pt = (lms, i) => (lms[i] ? pct(lms[i]) : null);

/** 478 landmarks (normalized) → Élevé feature map in image-% space. Pure; unit-test with fixtures. */
export function meshToFeatureMap(lms) {
  if (!lms || lms.length < 478) return null;
  const irisA = mean(lms, IRIS_A), irisB = mean(lms, IRIS_B);
  const lipTop = pt(lms, LIP_UPPER_INNER), lipBot = pt(lms, LIP_LOWER_INNER);
  if (!irisA || !irisB || !lipTop || !lipBot) return null;
  // viewer-side naming: sort by x so subject/viewer convention cannot swap features
  const [eyeL, eyeR] = irisA.x <= irisB.x ? [irisA, irisB] : [irisB, irisA];
  const browA = pt(lms, BROW_A), browB = pt(lms, BROW_B);
  const [browL, browR] = browA && browB ? (browA.x <= browB.x ? [browA, browB] : [browB, browA]) : [null, null];
  const cornA = pt(lms, MOUTH_CORNER_A), cornB = pt(lms, MOUTH_CORNER_B);
  const [mouthL, mouthR] = cornA && cornB ? (cornA.x <= cornB.x ? [cornA, cornB] : [cornB, cornA]) : [null, null];
  const ovalTop = pt(lms, OVAL_TOP);
  const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
  const f = {
    face_found: true,
    eye_left: eyeL, eye_right: eyeR,
    mouth: { x: (lipTop.x + lipBot.x) / 2, y: (lipTop.y + lipBot.y) / 2 },
    nose_tip: pt(lms, NOSE_TIP),
    chin: pt(lms, CHIN),
    // raw oval-top sits at the hairline; blend 25% toward the eyes = "center of forehead"
    forehead: ovalTop ? { x: ovalTop.x, y: ovalTop.y + (eyeMid.y - ovalTop.y) * 0.25 } : null,
    brow_left: browL, brow_right: browR,
    mouth_left: mouthL, mouth_right: mouthR,
  };
  Object.keys(f).forEach((k) => f[k] == null && delete f[k]);
  return f;
}

/** Contour (normalized landmarks) → array of image-% points. */
export function contourPct(lms, indices) {
  const pts = indices.map((i) => lms[i]).filter(Boolean);
  return pts.length === indices.length ? pts.map(pct) : null;
}

/** Image-% polygon → stage-% polygon via the app's coverMap. */
export function contourToStage(poly, coverMap, aspect) {
  return poly ? poly.map((p) => coverMap(p.x, p.y, aspect)) : null;
}

/** Stage-% polygon → CSS clip-path string for the lip pigment layers. */
export function polygonToClipPath(poly) {
  if (!poly || poly.length < 3) return null;
  return `polygon(${poly.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(", ")})`;
}

/**
 * The tier. Returns { lm, stageMap } matching the app's toDerived shape,
 * with stageMap.contours = { lipOuter, faceOval } (stage-space), or null.
 * `deps` injects the app's tested pure functions to keep one source of truth.
 */
export async function detectWithFaceMesh(img, aspect, deps) {
  const { coverMap, validateFeatureMap, deriveFromFeatureMap } = deps;
  const lmkr = await getLandmarker();
  if (!lmkr) return null;
  let res;
  try { res = lmkr.detect(img); } catch { return null; }
  const lms = res?.faceLandmarks?.[0];
  const raw = meshToFeatureMap(lms);
  if (!raw) return null;
  // image-% → stage-% (same conversion the app uses)
  const stageMap = { face_found: true, stage: true };
  Object.keys(raw).forEach((k) => {
    if (raw[k] && Number.isFinite(raw[k].x)) stageMap[k] = coverMap(raw[k].x, raw[k].y, aspect);
  });
  if (!validateFeatureMap(stageMap)) return null;
  const lm = deriveFromFeatureMap(stageMap);
  if (!lm) return null;
  lm.stage = true;
  stageMap.contours = {
    lipOuter: contourToStage(contourPct(lms, LIP_OUTER), coverMap, aspect),
    faceOval: contourToStage(contourPct(lms, FACE_OVAL), coverMap, aspect),
  };
  return { lm, stageMap };
}
