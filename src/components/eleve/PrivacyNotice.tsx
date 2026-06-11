import { Check } from "lucide-react";

const items = [
  "Your photo is analysed once, then encrypted at rest.",
  "Never used to train models. Not now, not ever.",
  "Never appears on share cards without your explicit permission.",
  "Deletable, in full, the moment you choose.",
];

export function PrivacyNotice() {
  return (
    <div className="card-atelier p-6">
      <ul className="flex flex-col gap-4">
        {items.map((text, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rise"
            style={{ animationDelay: `${120 + i * 65}ms` }}
          >
            <span
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
              style={{ border: "1px solid var(--champagne)" }}
            >
              <Check size={13} strokeWidth={1.5} className="text-champagne" />
            </span>
            <span className="text-[14px] leading-relaxed text-ink/85">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
