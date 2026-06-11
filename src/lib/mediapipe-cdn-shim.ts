/**
 * MediaPipe WASM CDN shim.
 *
 * The MediaPipe wasm binaries exceed our repo's per-file commit limit, so we
 * cannot self-host them at /mediapipe/wasm/*.wasm. The accompanying loader
 * .js files (small, kept in /public/mediapipe/wasm/) request the .wasm by
 * relative URL. This shim patches window.fetch ONCE to redirect any request
 * for /mediapipe/wasm/*.wasm to the jsDelivr CDN copy of the exact same
 * @mediapipe/tasks-vision version we depend on at build time. Everything else
 * is forwarded untouched.
 */
const VERSION = "0.10.35";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;

let installed = false;
export function installMediapipeCdnShim() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" ? input : (input as URL).toString?.() ?? (input as Request).url;
      if (url && /\/mediapipe\/wasm\/[^/?#]+\.wasm(\?|#|$)/.test(url)) {
        const file = url.match(/\/mediapipe\/wasm\/([^/?#]+\.wasm)/)![1];
        return orig(`${CDN}/${file}`, init);
      }
    } catch {}
    return orig(input as any, init);
  }) as typeof window.fetch;
}
