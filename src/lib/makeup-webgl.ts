// @ts-nocheck
/* ============================================================
   ÉLEVÉ — makeup-webgl.ts
   WebGL1 makeup renderer (ModiFace-style): the camera frame is a GPU
   texture; each product is a feathered face-mesh ribbon/fan drawn with a
   fragment shader that PRESERVES the photo's luminance and replaces only
   chrominance (keep base Y, take makeup Cb/Cr). This is the per-pixel
   technique Canvas-2D blend modes only approximate.

   Drop-in for makeup-canvas: exports createMakeupRenderer() with the same
   render(ctx, lms, video, W, H, { products, smoothing, now }) shape. It owns
   its own offscreen WebGL canvas and blits the result into the passed 2D ctx,
   so LiveMirror (and capture-this-look via toDataURL) is unchanged. Falls back
   to the Canvas-2D renderer if WebGL1 is unavailable.
   ============================================================ */
import { hexToRgb } from "./makeup-canvas";
import { createMakeupRenderer as createCanvasRenderer } from "./makeup-canvas";

export { hexToRgb };

/* ---------- landmark index sets (mirror of makeup-canvas) ---------- */
const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const UPPER_LASH_R = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const UPPER_LASH_L = [362, 398, 384, 385, 386, 387, 388, 466, 263];
const LOWER_LASH_R = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LOWER_LASH_L = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const OUTER_EYE_R = 33, OUTER_EYE_L = 263;
const BLUSH_APEX_R = 50, BLUSH_APEX_L = 280;
const FACE_LEFT = 234, FACE_RIGHT = 454;
const LIP_LOWER_OUT = 17, LIP_LOWER_IN = 14;

/* ---------- helpers ---------- */
function centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function makeOneEuro(mincutoff = 1.4, beta = 0.012, dcutoff = 1.2) {
  let xP = null, yP = null, dxP = null, dyP = null, tP = null;
  const a = (cut, dt) => { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); };
  return (pts, now) => {
    let dt = tP == null ? 1 / 30 : (now - tP) / 1000; dt = clamp(dt, 0.008, 0.1); tP = now;
    const n = pts.length;
    if (!xP || xP.length !== n) {
      xP = new Float64Array(n); yP = new Float64Array(n); dxP = new Float64Array(n); dyP = new Float64Array(n);
      for (let i = 0; i < n; i++) { xP[i] = pts[i].x; yP[i] = pts[i].y; } return pts;
    }
    const aD = a(dcutoff, dt);
    for (let i = 0; i < n; i++) {
      const dx = (pts[i].x - xP[i]) / dt, dy = (pts[i].y - yP[i]) / dt;
      const edx = aD * dx + (1 - aD) * dxP[i], edy = aD * dy + (1 - aD) * dyP[i];
      dxP[i] = edx; dyP[i] = edy;
      const ax = a(mincutoff + beta * Math.abs(edx), dt), ay = a(mincutoff + beta * Math.abs(edy), dt);
      pts[i].x = xP[i] = ax * pts[i].x + (1 - ax) * xP[i];
      pts[i].y = yP[i] = ay * pts[i].y + (1 - ay) * yP[i];
    }
    return pts;
  };
}

// outward lid normals (always point away from the eye centre → onto the lid)
function lidNormals(lash, eyeC) {
  const n = lash.length, out = [];
  for (let i = 0; i < n; i++) {
    const prev = lash[Math.max(0, i - 1)], next = lash[Math.min(n - 1, i + 1)];
    const tx = next.x - prev.x, ty = next.y - prev.y, len = Math.hypot(tx, ty) || 1;
    let nx = -ty / len, ny = tx / len;
    if ((lash[i].x + nx - eyeC.x) ** 2 + (lash[i].y + ny - eyeC.y) ** 2 < (lash[i].x - eyeC.x) ** 2 + (lash[i].y - eyeC.y) ** 2) { nx = -nx; ny = -ny; }
    out.push({ nx, ny });
  }
  return out;
}

/* ---------- shaders ---------- */
const BASE_VS = `
precision highp float;
attribute vec2 aPos; attribute vec2 aUV; varying vec2 vUv;
void main(){ vUv = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BASE_FS = `
precision highp float;
uniform sampler2D uTex; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }`;

const REGION_VS = `
precision highp float;
attribute vec2 aPos; attribute float aEdge;
varying vec2 vUv; varying float vEdge;
void main(){
  vEdge = aEdge;
  vUv = vec2(aPos.x * 0.5 + 0.5, 1.0 - (aPos.y * 0.5 + 0.5));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const REGION_FS = `
precision highp float;
varying vec2 vUv; varying float vEdge;
uniform sampler2D uScene;
uniform vec3 uColor; uniform float uOpacity; uniform float uFeather;
uniform float uTime; uniform vec2 uRes;
uniform float uMatte, uSatin, uGloss, uShimmer, uMetallic, uSheer;
uniform vec3 uFlake;

const mat3 RGB2YCC = mat3(0.299,-0.168736,0.5, 0.587,-0.331264,-0.418688, 0.114,0.5,-0.081312);
const mat3 YCC2RGB = mat3(1.0,1.0,1.0, 0.0,-0.344136,1.772, 1.402,-0.714136,0.0);
vec3 rgb2ycc(vec3 c){ vec3 y = RGB2YCC*c; y.yz += 0.5; return y; }
vec3 ycc2rgb(vec3 y){ y.yz -= 0.5; return clamp(YCC2RGB*y, 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
float slCh(float b, float s){ float d = (b<=0.25)?((16.0*b-12.0)*b+4.0)*b:sqrt(b); return (s<=0.5)?b-(1.0-2.0*s)*b*(1.0-b):b+(2.0*s-1.0)*(d-b); }
vec3 softLight(vec3 b, vec3 s){ return vec3(slCh(b.r,s.r), slCh(b.g,s.g), slCh(b.b,s.b)); }
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

void main(){
  vec3 base = texture2D(uScene, vUv).rgb;
  float cover = smoothstep(0.0, max(uFeather,1e-3), vEdge) * uOpacity;
  if (cover <= 0.0){ gl_FragColor = vec4(0.0); return; }

  vec3 bY = rgb2ycc(base);
  vec3 mY = rgb2ycc(uColor);
  float Y = bY.x, Cb = mY.y, Cr = mY.z;

  float peak = smoothstep(0.62, 0.95, Y);
  float flatten = clamp(uMatte*0.85 + uSatin*0.30, 0.0, 1.0);
  float Ym = mix(Y, 0.5, flatten);
  Ym = mix(Ym, min(Ym, 0.72), uMatte*peak);
  Y = mix(Y, Ym, step(0.0001, flatten));

  vec3 col = ycc2rgb(vec3(Y, Cb, Cr));
  float gloss = pow(peak, 3.0) * uGloss;
  col += mix(vec3(1.0), uColor, 0.25) * gloss;

  vec2 sp = floor(vUv * uRes / 3.0);
  float spark = pow(hash21(sp + floor(uTime*12.0)), 6.0);
  float fres = pow(1.0 - clamp(peak,0.0,1.0), 3.0) * uMetallic;
  float shim = uShimmer * (spark*(0.4+0.6*peak) + 0.25*fres);
  col += mix(uFlake, vec3(1.0), spark) * shim;
  col = clamp(col, 0.0, 1.0);

  if (uSheer > 0.0){
    float Yb = luma(base);
    vec3 hybrid = clamp(mix(base*uColor, softLight(base,uColor), Yb), 0.0, 1.0);
    col = mix(col, hybrid, uSheer);
  }
  gl_FragColor = vec4(col * cover, cover);
}`;

// opaque pigment (eyeliner / mascara) — no chroma transfer
const TINT_FS = `
precision highp float;
varying vec2 vUv; varying float vEdge;
uniform vec3 uColor; uniform float uOpacity; uniform float uFeather;
void main(){
  float cover = smoothstep(0.0, max(uFeather,1e-3), vEdge) * uOpacity;
  if (cover <= 0.0){ gl_FragColor = vec4(0.0); return; }
  gl_FragColor = vec4(uColor * cover, cover);
}`;

/* ---------- finish → shader uniform weights ---------- */
function finishWeights(finish) {
  const f = { matte: 0, satin: 0, gloss: 0, shimmer: 0, metallic: 0, sheer: 0, flake: [1, 0.85, 0.5] };
  switch (finish) {
    case "matte": f.matte = 1; break;
    case "satin": f.satin = 1; break;
    case "cream": f.satin = 0.5; f.sheer = 0.15; break;
    case "glossy": f.gloss = 1; f.sheer = 0.25; break;
    case "shimmer": f.shimmer = 1; break;
    case "metallic": f.shimmer = 1; f.metallic = 1; break;
    case "sheer": f.sheer = 0.6; break;
    case "dewy": f.gloss = 0.5; break;
    case "powder": f.matte = 0.4; break;
    case "pearl": f.shimmer = 0.5; f.flake = [1, 0.97, 0.9]; break;
    default: f.satin = 1;
  }
  return f;
}

/* ============================================================
   Renderer
   ============================================================ */
export function createMakeupRenderer() {
  let gl = null, glCanvas = null;
  let ok = false;
  try {
    glCanvas = document.createElement("canvas");
    const opts = { alpha: false, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance", desynchronized: true };
    gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
    ok = !!gl;
  } catch { ok = false; }

  // Graceful fallback to the Canvas-2D renderer.
  if (!ok) return createCanvasRenderer();

  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn("[eleve] shader:", gl.getShaderInfoLog(sh)); }
    return sh;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn("[eleve] link:", gl.getProgramInfoLog(p));
    return p;
  }

  const baseProg = program(BASE_VS, BASE_FS);
  const regionProg = program(REGION_VS, REGION_FS);
  const tintProg = program(REGION_VS, TINT_FS);

  // attrib / uniform locations
  const loc = {
    base: { pos: gl.getAttribLocation(baseProg, "aPos"), uv: gl.getAttribLocation(baseProg, "aUV"), tex: gl.getUniformLocation(baseProg, "uTex") },
    region: {
      pos: gl.getAttribLocation(regionProg, "aPos"), edge: gl.getAttribLocation(regionProg, "aEdge"),
      scene: gl.getUniformLocation(regionProg, "uScene"), color: gl.getUniformLocation(regionProg, "uColor"),
      opacity: gl.getUniformLocation(regionProg, "uOpacity"), feather: gl.getUniformLocation(regionProg, "uFeather"),
      time: gl.getUniformLocation(regionProg, "uTime"), res: gl.getUniformLocation(regionProg, "uRes"),
      matte: gl.getUniformLocation(regionProg, "uMatte"), satin: gl.getUniformLocation(regionProg, "uSatin"),
      gloss: gl.getUniformLocation(regionProg, "uGloss"), shimmer: gl.getUniformLocation(regionProg, "uShimmer"),
      metallic: gl.getUniformLocation(regionProg, "uMetallic"), sheer: gl.getUniformLocation(regionProg, "uSheer"),
      flake: gl.getUniformLocation(regionProg, "uFlake"),
    },
    tint: {
      pos: gl.getAttribLocation(tintProg, "aPos"), edge: gl.getAttribLocation(tintProg, "aEdge"),
      color: gl.getUniformLocation(tintProg, "uColor"), opacity: gl.getUniformLocation(tintProg, "uOpacity"),
      feather: gl.getUniformLocation(tintProg, "uFeather"),
    },
  };

  // buffers
  const baseQuad = gl.createBuffer();   // 4 verts: pos(2)+uv(2)
  const posBuf = gl.createBuffer();
  const edgeBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();

  // textures + FBO for the screen-space scene (base video)
  const camTex = gl.createTexture();
  const sceneTex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let camAlloc = false, texW = 0, texH = 0;

  function setupTex(tex) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  setupTex(camTex); setupTex(sceneTex);

  const euro = makeOneEuro();
  let W = 0, H = 0, vw = 0, vh = 0, s = 1, ox = 0, oy = 0;
  const toClip = (px, py) => [px / W * 2 - 1, 1 - py / H * 2];

  function ensureSize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h; glCanvas.width = w; glCanvas.height = h;
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    texW = w; texH = h;
  }

  // base quad UVs invert the mirror+cover-crop so base pixels coincide with landmarks
  function baseQuadData() {
    // NDC corners → screen uv (top-left origin) → video uv
    const corners = [
      [-1, -1, 0, 1], [1, -1, 1, 1], [-1, 1, 0, 0], [1, 1, 1, 0], // x,y, su,sv
    ];
    const arr = [];
    for (const [x, y, su, sv] of corners) {
      const sx = su * W, sy = sv * H;
      const u = 1 - (sx - ox) / (vw * s);   // mirror (1-) + cover
      const v = (sy - oy) / (vh * s);
      arr.push(x, y, u, v);
    }
    return new Float32Array(arr);
  }

  /* ---- geometry builders (return {pos:Float32Array clip, edge:Float32Array, idx:Uint16Array}) ---- */
  function ribbon(rings, closed) {
    const N = rings[0].pts.length;
    const pos = [], edge = [], idx = [];
    for (const r of rings) for (let i = 0; i < N; i++) { const c = toClip(r.pts[i].x, r.pts[i].y); pos.push(c[0], c[1]); edge.push(r.edge); }
    const last = closed ? N : N - 1;
    for (let r = 0; r < rings.length - 1; r++) {
      const a = r * N, b = (r + 1) * N;
      for (let i = 0; i < last; i++) {
        const i2 = (i + 1) % N;
        idx.push(a + i, a + i2, b + i, b + i, a + i2, b + i2);
      }
    }
    return { pos: new Float32Array(pos), edge: new Float32Array(edge), idx: new Uint16Array(idx) };
  }
  function fan(apex, rim) {
    const pos = [toClip(apex.x, apex.y)[0], toClip(apex.x, apex.y)[1]], edge = [1], idx = [];
    const N = rim.length;
    for (const p of rim) { const c = toClip(p.x, p.y); pos.push(c[0], c[1]); edge.push(0); }
    for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
    return { pos: new Float32Array(pos), edge: new Float32Array(edge), idx: new Uint16Array(idx) };
  }

  function lipMesh(P) {
    const outer = LIP_OUTER.map(i => P[i]), inner = LIP_INNER.map(i => P[i]);
    if (outer.some(p => !p) || inner.some(p => !p)) return null;
    // outer (edge 0, soft border) → inner (edge 1, full to mouth line)
    return ribbon([{ pts: outer, edge: 0 }, { pts: inner, edge: 1 }], true);
  }
  function lipLinerMesh(P) {
    const outer = LIP_OUTER.map(i => P[i]); if (outer.some(p => !p)) return null;
    const c = centroid(outer);
    const outIn = outer.map(p => ({ x: p.x + (c.x - p.x) * 0.18, y: p.y + (c.y - p.y) * 0.18 }));
    const outOut = outer.map(p => ({ x: p.x + (p.x - c.x) * 0.03, y: p.y + (p.y - c.y) * 0.03 }));
    return ribbon([{ pts: outOut, edge: 0 }, { pts: outer, edge: 1 }, { pts: outIn, edge: 0 }], true);
  }
  function lidMesh(P, lashIdx, lowerIdx, outerEye, fw, style) {
    const lash = lashIdx.map(i => P[i]); if (lash.some(p => !p)) return null;
    const lower = lowerIdx.map(i => P[i]).filter(Boolean);
    const eyeC = centroid(lash.concat(lower));
    const norm = lidNormals(lash, eyeC);
    const n = lash.length;
    const outerAtStart = lashIdx[0] === outerEye;
    const lidH = fw * (style === "smoky" || style === "fullCrease" || style === "outerV" ? 0.085 : 0.058);
    const at = (h) => lash.map((p, i) => {
      const u = outerAtStart ? 1 - i / (n - 1) : i / (n - 1);
      const hh = h * (0.7 + u * 0.6);
      return { x: p.x + norm[i].nx * hh, y: p.y + norm[i].ny * hh };
    });
    const mid = at(lidH * 0.5), top = at(lidH);
    // lash edge 0 (off the eyeball), mid 1, top 0 → feathered band on the lid
    return ribbon([{ pts: lash, edge: 0 }, { pts: mid, edge: 1 }, { pts: top, edge: 0 }], false);
  }
  function blushMesh(P, apexI, outerI, fw) {
    const a = P[apexI], eye = P[outerI]; if (!a || !eye) return null;
    const cx = a.x + (eye.x - a.x) * 0.22, cy = a.y + (eye.y - a.y) * 0.22;
    const ang = Math.atan2(eye.y - a.y, eye.x - a.x);
    const r = Math.max(8, fw * 0.19), ry = r * 0.52;
    const rim = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 2;
      const ex = Math.cos(t) * r, ey = Math.sin(t) * ry;
      rim.push({ x: cx + ex * Math.cos(ang) - ey * Math.sin(ang), y: cy + ex * Math.sin(ang) + ey * Math.cos(ang) });
    }
    return fan({ x: cx, y: cy }, rim);
  }
  function lashBandMesh(P, lashIdx, outerEye, fw, widthMul, wing) {
    const lash = lashIdx.map(i => P[i]); if (lash.some(p => !p)) return null;
    const eyeC = centroid(lash); const norm = lidNormals(lash, eyeC);
    const n = lash.length;
    const outerAtStart = lashIdx[0] === outerEye;
    const w = fw * widthMul;
    const top = lash.map((p, i) => {
      const u = outerAtStart ? 1 - i / (n - 1) : i / (n - 1);
      const ww = w * Math.max(0.12, Math.sin(clamp(u / 0.7, 0, 1) * Math.PI * 0.5));
      return { x: p.x + norm[i].nx * ww, y: p.y + norm[i].ny * ww };
    });
    // lash edge solid (1), top edge soft (0)
    const rings = [{ pts: lash, edge: 1 }, { pts: top, edge: 0 }];
    return ribbon(rings, false);
  }

  function drawMesh(prog, locp, mesh, setUniforms) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locp.pos); gl.vertexAttribPointer(locp.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.edge, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locp.edge); gl.vertexAttribPointer(locp.edge, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.DYNAMIC_DRAW);
    setUniforms();
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }

  function regionUniforms(color, opacity, feather, finish, now) {
    const f = finishWeights(finish);
    gl.uniform1i(loc.region.scene, 0);
    gl.uniform3f(loc.region.color, color[0] / 255, color[1] / 255, color[2] / 255);
    gl.uniform1f(loc.region.opacity, opacity);
    gl.uniform1f(loc.region.feather, feather);
    gl.uniform1f(loc.region.time, (now || 0) / 1000);
    gl.uniform2f(loc.region.res, W, H);
    gl.uniform1f(loc.region.matte, f.matte); gl.uniform1f(loc.region.satin, f.satin);
    gl.uniform1f(loc.region.gloss, f.gloss); gl.uniform1f(loc.region.shimmer, f.shimmer);
    gl.uniform1f(loc.region.metallic, f.metallic); gl.uniform1f(loc.region.sheer, f.sheer);
    gl.uniform3f(loc.region.flake, f.flake[0], f.flake[1], f.flake[2]);
  }
  function tintUniforms(color, opacity, feather) {
    gl.uniform3f(loc.tint.color, color[0] / 255, color[1] / 255, color[2] / 255);
    gl.uniform1f(loc.tint.opacity, opacity);
    gl.uniform1f(loc.tint.feather, feather);
  }

  function render(ctx, lms, video, w, h, opts) {
    vw = video.videoWidth; vh = video.videoHeight;
    if (!vw || !vh) return;
    ensureSize(w, h);
    const { products, now } = opts;
    s = Math.max(W / vw, H / vh); ox = (W - vw * s) / 2; oy = (H - vh * s) / 2;

    // landmarks → mirrored cover-crop pixel space, one-euro smoothed
    let P = new Array(lms.length);
    for (let i = 0; i < lms.length; i++) P[i] = { x: (1 - lms[i].x) * vw * s + ox, y: lms[i].y * vh * s + oy };
    P = euro(P, now ?? 0);
    const fw = P[FACE_LEFT] && P[FACE_RIGHT] ? Math.abs(P[FACE_RIGHT].x - P[FACE_LEFT].x) : W * 0.4;

    // upload video → camTex
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, camTex);
    try {
      if (!camAlloc || texW !== vw || texH !== vh) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); camAlloc = true; }
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch { return; }

    // PASS 1: base video → sceneTex (FBO), screen space
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(baseProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, baseQuad);
    gl.bufferData(gl.ARRAY_BUFFER, baseQuadData(), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.base.pos); gl.vertexAttribPointer(loc.base.pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(loc.base.uv); gl.vertexAttribPointer(loc.base.uv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, camTex); gl.uniform1i(loc.base.tex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // PASS 2: blit sceneTex → default framebuffer (visible)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(baseProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(loc.base.tex, 0);
    // reuse a screen-space quad: aPos=NDC corners, aUV=screen uv (flip Y to match sceneTex)
    gl.bindBuffer(gl.ARRAY_BUFFER, baseQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.base.pos); gl.vertexAttribPointer(loc.base.pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(loc.base.uv); gl.vertexAttribPointer(loc.base.uv, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // PASS 3: makeup regions, premultiplied OVER, sampling sceneTex
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);

    for (const p of products || []) {
      const shade = p.shade, fin = p.finish, it = p.intensity, style = p.style;
      if (p.paint === "lipstick" || p.paint === "lipGloss") {
        const m = lipMesh(P); if (!m) continue;
        const op = p.paint === "lipGloss" ? it * 0.7 : it;
        drawMesh(regionProg, loc.region, m, () => regionUniforms(shade, op, 0.32, fin, now));
      } else if (p.paint === "lipLiner") {
        const m = lipLinerMesh(P); if (!m) continue;
        drawMesh(regionProg, loc.region, m, () => regionUniforms(shade, it * 0.85, 0.5, fin, now));
      } else if (p.paint === "eyeshadow") {
        for (const [lashI, lowI, oe] of [[UPPER_LASH_R, LOWER_LASH_R, OUTER_EYE_R], [UPPER_LASH_L, LOWER_LASH_L, OUTER_EYE_L]]) {
          const m = lidMesh(P, lashI, lowI, oe, fw, style); if (!m) continue;
          drawMesh(regionProg, loc.region, m, () => regionUniforms(shade, it, 0.5, fin, now));
        }
      } else if (p.paint === "blush") {
        for (const [ai, oi] of [[BLUSH_APEX_R, OUTER_EYE_R], [BLUSH_APEX_L, OUTER_EYE_L]]) {
          const m = blushMesh(P, ai, oi, fw); if (!m) continue;
          drawMesh(regionProg, loc.region, m, () => regionUniforms(shade, it * 0.7, 0.95, fin, now));
        }
      } else if (p.paint === "eyeliner") {
        const wmul = style === "thin" || style === "tightline" ? 0.02 : style === "graphic" ? 0.04 : 0.03;
        for (const [lashI, oe] of [[UPPER_LASH_R, OUTER_EYE_R], [UPPER_LASH_L, OUTER_EYE_L]]) {
          const m = lashBandMesh(P, lashI, oe, fw, wmul, true); if (!m) continue;
          drawMesh(tintProg, loc.tint, m, () => tintUniforms(shade, it * 0.85, 0.2));
        }
      } else if (p.paint === "mascara") {
        for (const [lashI, oe] of [[UPPER_LASH_R, OUTER_EYE_R], [UPPER_LASH_L, OUTER_EYE_L]]) {
          const m = lashBandMesh(P, lashI, oe, fw, 0.014, false); if (!m) continue;
          drawMesh(tintProg, loc.tint, m, () => tintUniforms(shade, it * 0.8, 0.25));
        }
      }
      // brows / skinTint / bronzer / contour / highlighter: WebGL stages 2-3 (skipped for now)
    }

    // present onto the visible 2D canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(glCanvas, 0, 0);
  }

  return { render, _webgl: true };
}
