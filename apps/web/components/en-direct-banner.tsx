"use client";

import { useEffect, useState, type JSX } from "react";
import type { ReseauSocialKey, ReseauSocialRow } from "../lib/reseaux-sociaux";
import { useYoutubeSubscriberCount } from "../lib/use-youtube-subscriber-count";

const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const YOUTUBE_RED = "#FF0000";

const RESEAU_LABELS: Record<ReseauSocialKey, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
};

function formatAbonnes(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.floor(n)));
}

function YouTubeIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill={YOUTUBE_RED}
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
      />
    </svg>
  );
}

function FacebookIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

function TikTokIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#EE1D52"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"
      />
    </svg>
  );
}

function InstagramIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#E4405F"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.97.24 2.43.403.59.22 1.01.48 1.45.92.44.44.7.86.92 1.45.163.46.35 1.26.403 2.43.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.053 1.17-.24 1.97-.403 2.43-.22.59-.48 1.01-.92 1.45-.44.44-.86.7-1.45.92-.46.163-1.26.35-2.43.403-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.053-1.97-.24-2.43-.403a3.86 3.86 0 0 1-1.45-.92 3.86 3.86 0 0 1-.92-1.45c-.163-.46-.35-1.26-.403-2.43C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.053-1.17.24-1.97.403-2.43.22-.59.48-1.01.92-1.45.44-.44.86-.7 1.45-.92.46-.163 1.26-.35 2.43-.403C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.74 0 8.333.014 7.053.072 5.775.13 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.13 5.775.072 7.053.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.058 1.278.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.765.297 1.635.5 2.913.558C8.333 23.986 8.74 24 12 24s3.667-.014 4.947-.072c1.278-.058 2.148-.261 2.913-.558a5.87 5.87 0 0 0 2.126-1.384 5.87 5.87 0 0 0 1.384-2.126c.297-.765.5-1.635.558-2.913.058-1.28.072-1.687.072-4.947s-.014-3.667-.072-4.947c-.058-1.278-.261-2.148-.558-2.913a5.87 5.87 0 0 0-1.384-2.126A5.87 5.87 0 0 0 19.86.63c-.765-.297-1.635-.5-2.913-.558C15.667.014 15.26 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
      />
    </svg>
  );
}

function ReseauSocialIcon({ reseau, size = 16 }: { reseau: ReseauSocialKey; size?: number }): JSX.Element {
  switch (reseau) {
    case "youtube":
      return <YouTubeIcon size={size} />;
    case "facebook":
      return <FacebookIcon size={size} />;
    case "tiktok":
      return <TikTokIcon size={size} />;
    case "instagram":
      return <InstagramIcon size={size} />;
  }
}

export function EnDirectBanner(): JSX.Element | null {
  const [reseauxActifs, setReseauxActifs] = useState<ReseauSocialRow[]>([]);
  const youtubeSubscriberCount = useYoutubeSubscriberCount();

  useEffect(() => {
    let cancelled = false;

    async function loadReseauxSociaux(): Promise<void> {
      try {
        const r = await fetch("/api/reseaux-sociaux", { cache: "no-store" });
        const j = (await r.json()) as { reseaux?: ReseauSocialRow[] };
        if (!cancelled && r.ok) {
          setReseauxActifs(j.reseaux ?? []);
        }
      } catch {
        if (!cancelled) setReseauxActifs([]);
      }
    }

    void loadReseauxSociaux();
    return () => {
      cancelled = true;
    };
  }, []);

  if (reseauxActifs.length === 0) {
    return null;
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes leveLiveBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.35; }
            }
          `,
        }}
      />
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "0.65rem 1.25rem",
          padding: "0.45rem 1rem",
          background: "#111111",
          borderBottom: "1px solid #1f1f1f",
          fontSize: "0.72rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          color: TEXT,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontWeight: 600,
            color: TEXT,
          }}
        >
          <span
            aria-hidden
            style={{
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "50%",
              background: ROUGE,
              animation: "leveLiveBlink 1.2s ease-in-out infinite",
            }}
          />
          En direct
        </span>
        {reseauxActifs.map((r) => {
          const abonnes =
            r.reseau === "youtube" && youtubeSubscriberCount !== null
              ? youtubeSubscriberCount
              : r.abonnes;
          return (
            <span
              key={r.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                opacity: 0.92,
              }}
            >
              <ReseauSocialIcon reseau={r.reseau} size={14} />
              <span style={{ opacity: 0.7 }}>{RESEAU_LABELS[r.reseau]}</span>
              <span style={{ fontWeight: 600 }}>{formatAbonnes(abonnes)}</span>
            </span>
          );
        })}
      </div>
    </>
  );
}
