// @ts-nocheck
/* ============================================================
   ÉLEVÉ — webarrocks-tier.ts
   Client-only wrapper around WebAR.rocks.face (MIT), vendored in
   /public/webarrocks. Loads the engine + helpers as classic scripts
   (matching the upstream demos), then runs the Shape2D lipstick try-on.

   Source: github.com/WebAR-rocks/WebAR.rocks.face (MIT) — shallow clone
   2026-06. Engine sets window.WEBARROCKSFACE; vendored helpers expose
   window.WebARRocksResizer / WebARRocksFaceShape2DHelper / WebARRocksLMStabilizer.
   ============================================================ */

const BASE = "/webarrocks";

/* ---- LIPS shape (verbatim from demos/makeupLipstick/main.js) ---- */
export const SHAPELIPS = {
  name: "LIPS",
  points: [
    "lipsExt0", "lipsExtTop1", "lipsExtTop2", "lipsExtTop3", "lipsExtTop4", "lipsExtTop5",
    "lipsExt6",
    "lipsExtBot7", "lipsExtBot8", "lipsExtBot9", "lipsExtBot10", "lipsExtBot11",
    "lipsInt12",
    "lipsIntTop13", "lipsIntTop14", "lipsIntTop15",
    "lipsInt16",
    "lipsIntBot17", "lipsIntBot18", "lipsIntBot19",
  ],
  iVals: [
    [1], [1], [1], [1], [1], [1],
    [1],
    [1], [1], [1], [1], [1],
    [-1],
    [-1], [-1], [-1],
    [-1],
    [-1], [-1], [-1],
  ],
  tesselation: [
    0, 1, 13, 0, 12, 13, 1, 13, 2, 2, 13, 14, 2, 3, 14, 3, 4, 14, 14, 15, 4, 4, 5, 15, 15, 5, 6, 15, 6, 16,
    0, 12, 19, 0, 19, 11, 11, 10, 19, 10, 18, 19, 10, 9, 18, 8, 9, 18, 8, 17, 18, 7, 8, 17, 6, 7, 17, 6, 17, 16,
  ],
  interpolations: [
    { tangentInfluences: [2, 2, 2], points: [1, 2, 3], ks: [-0.25, 0.25] },
    { tangentInfluences: [2, 2, 2], points: [3, 4, 5], ks: [-0.25, 0.25] },
    { tangentInfluences: [2, 2, 2], points: [2, 3, 4], ks: [-0.25, 0.25] },
    { tangentInfluences: [2, 2, 2], points: [10, 9, 8], ks: [-0.25, 0.25] },
  ],
  outlines: [
    {
      points: [0, 1, 2, 3, 4, 5, 6, 16, 15, 14, 13, 12],
      displacements: [0.01, 0, 0, -0.015, 0, 0, 0.0, 0, 0.01, 0.015, 0.01, 0.01],
    },
    {
      points: [12, 19, 18, 17, 16, 6, 7, 8, 9, 10, 11, 0],
      displacements: [0, 0.015, 0.02, 0.015, 0, 0.0, 0.005, 0.005, 0.005, 0.005, 0.005, 0.0],
    },
  ],
  GLSLFragmentSource: "\n\
    const vec2 ALPHARANGE = vec2(0.1, 0.6);\n\
    const vec3 LUMA = 1.3 * vec3(0.299, 0.587, 0.114);\n\
    float linStep(float edge0, float edge1, float x){\n\
      float val = (x - edge0) / (edge1 - edge0);\n\
      return clamp(val, 0.0, 1.0);\n\
    }\n\
    void main(void){\n\
      vec3 videoColor = texture2D(samplerVideo, vUV).rgb;\n\
      vec3 videoColorGs = vec3(1., 1., 1.) * dot(videoColor, LUMA);\n\
      float alpha = 1.0;\n\
      alpha *= linStep(-1.0, -0.95, abs(iVal));\n\
      alpha *= 0.5 + 0.5 * linStep(1.0, 0.6, abs(iVal));\n\
      float alphaClamped = ALPHARANGE.x + (ALPHARANGE.y - ALPHARANGE.x) * alpha;\n\
      vec3 color = videoColorGs * lipstickColor;\n\
      gl_FragColor = vec4(color*alphaClamped, alphaClamped * uOpacity);\n\
    }",
  uniforms: [
    { name: "lipstickColor", value: [0.76, 0.31, 0.18] },
    { name: "uOpacity", value: [1.0] },
  ],
};

/* ---- classic-script loader (sequential → preserves order) ---- */
let _loadingPromise: Promise<any> | null = null;
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if (document.querySelector(`script[data-war="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.async = false; s.dataset.war = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}
export async function loadWebARRocks() {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    await loadScript(`${BASE}/WebARRocksFace.js`);
    await loadScript(`${BASE}/WebARRocksLMStabilizer2.js`);
    await loadScript(`${BASE}/WebARRocksResizer.js`);
    await loadScript(`${BASE}/WebARRocksFaceShape2DHelper.js`);
    const w = window as any;
    if (!w.WEBARROCKSFACE || !w.WebARRocksResizer || !w.WebARRocksFaceShape2DHelper) {
      throw new Error("WebAR.rocks globals missing after load");
    }
    return { engine: w.WEBARROCKSFACE, Resizer: w.WebARRocksResizer, Shape2D: w.WebARRocksFaceShape2DHelper };
  })();
  return _loadingPromise;
}

/* ---- start the lipstick try-on on the two stacked canvases ---- */
export async function startLipstick({ canvasVideo, canvasAR }) {
  const { Resizer, Shape2D } = await loadWebARRocks();
  await new Promise<void>((resolve, reject) => {
    Resizer.size_canvas({
      isFullScreen: false,
      canvas: canvasVideo,
      overlayCanvas: [canvasAR],
      callback: () => {
        Shape2D.init({
          NNCPath: `${BASE}/neuralNets/NN_LIPS_8.json`,
          canvasVideo,
          canvasAR,
          shapes: [SHAPELIPS],
        }).then(() => resolve()).catch((e: any) => reject(e instanceof Error ? e : new Error(String(e))));
      },
    });
  });
  return Shape2D;
}

/* ---- runtime controls ---- */
export function setLipColor(rgb255: number[]) {
  const Shape2D = (window as any).WebARRocksFaceShape2DHelper;
  if (!Shape2D) return;
  Shape2D.set_uniformValue("LIPS", "lipstickColor", [rgb255[0] / 255, rgb255[1] / 255, rgb255[2] / 255]);
}
export function setLipOpacity(o: number) {
  const Shape2D = (window as any).WebARRocksFaceShape2DHelper;
  if (!Shape2D) return;
  Shape2D.set_uniformValue("LIPS", "uOpacity", [o]);
}

export async function destroyWebARRocks() {
  const engine = (window as any).WEBARROCKSFACE;
  try { if (engine && engine.destroy) await engine.destroy(); } catch {}
  _loadingPromise = null;
}
