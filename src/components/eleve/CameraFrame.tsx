import { Camera } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { photoStore, usePhoto } from "@/lib/photo-store";

export function CameraFrame() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const existing = usePhoto();
  const [preview, setPreview] = useState<string | null>(existing?.dataUrl ?? null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await photoStore.setFromFile(file);
    setPreview(photoStore.get()?.dataUrl ?? null);
  }

  return (
    <div
      className="relative w-full overflow-hidden card-atelier"
      style={{ aspectRatio: "3 / 4", padding: 0 }}
    >
      {/* Corner ticks */}
      {[
        { pos: "top-3 left-3", d: "M0 14 V0 H14", delay: 0 },
        { pos: "top-3 right-3", d: "M0 0 H14 V14", delay: 90 },
        { pos: "bottom-3 left-3", d: "M0 0 V14 H14", delay: 180 },
        { pos: "bottom-3 right-3", d: "M14 0 V14 H0", delay: 270 },
      ].map((c, i) => (
        <svg
          key={i}
          width="18"
          height="18"
          viewBox="0 0 14 14"
          className={`absolute ${c.pos} tick-in`}
          style={{ animationDelay: `${c.delay}ms` }}
          aria-hidden
        >
          <path d={c.d} fill="none" stroke="var(--champagne)" strokeWidth={1.25} />
        </svg>
      ))}

      {preview ? (
        <img
          src={preview}
          alt="Your portrait"
          className="h-full w-full object-cover"
          style={{
            animation: "ev-rise 600ms cubic-bezier(0.16,1,0.3,1) both",
            transformOrigin: "center",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 grid place-items-center press"
        >
          <div className="flex flex-col items-center gap-4">
            <span
              className="grid h-20 w-20 place-items-center rounded-full breath"
              style={{
                background: "var(--blush)",
                border: "1px solid var(--champagne)",
              }}
            >
              <Camera size={28} strokeWidth={1.25} className="text-espresso" />
            </span>
            <span className="eyebrow">Add your portrait</span>
            <span className="text-[13px] text-muted-foreground max-w-[220px] text-center leading-relaxed">
              Natural light. Shoulders square. One photo is all we need.
            </span>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
