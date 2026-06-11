import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Frame } from "@/components/eleve/Frame";
import { ScreenHeader } from "@/components/eleve/ScreenHeader";
import { PrivacyNotice } from "@/components/eleve/PrivacyNotice";
import { PillButton } from "@/components/eleve/PillButton";

export const Route = createFileRoute("/consent")({
  head: () => ({
    meta: [
      { title: "Privacy — Élevé" },
      { name: "description", content: "Your portrait stays between us." },
    ],
  }),
  component: Consent,
});

function Consent() {
  const [agreed, setAgreed] = useState(false);
  const navigate = useNavigate();

  return (
    <Frame>
      <ScreenHeader back="/" eyebrow="Consent" />

      <h1 className="serif-display text-[36px] text-ink leading-[1.05] text-center">
        <span className="mask-line block">
          <span style={{ animationDelay: "120ms" }}>Your portrait stays</span>
        </span>
        <span className="mask-line block italic" style={{ color: "var(--espresso)" }}>
          <span style={{ animationDelay: "320ms" }}>between us.</span>
        </span>
      </h1>

      <div className="mt-10 rise" style={{ animationDelay: "500ms" }}>
        <PrivacyNotice />
      </div>

      <label
        className="mt-8 flex items-start gap-3 select-none rise"
        style={{ animationDelay: "780ms" }}
      >
        <span className="relative mt-0.5 inline-block">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border border-border bg-surface checked:border-champagne checked:bg-champagne press"
          />
          <svg
            viewBox="0 0 14 14"
            className="pointer-events-none absolute inset-0 m-auto h-3 w-3 opacity-0 peer-checked:opacity-100"
          >
            <path d="M2 7 L6 11 L12 3" fill="none" stroke="var(--espresso)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-[13.5px] leading-relaxed text-ink/85">
          I agree to Élevé&apos;s private styling terms and confirm I&apos;d like my portrait
          analysed once for personal styling only.
        </span>
      </label>

      <div className="mt-10 flex flex-col gap-3">
        <PillButton
          variant="ink"
          disabled={!agreed}
          onClick={() => navigate({ to: "/upload" })}
        >
          Continue
        </PillButton>
        <Link to="/" className="block">
          <PillButton variant="ghost">Not now</PillButton>
        </Link>
      </div>
    </Frame>
  );
}
