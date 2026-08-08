"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type JSX } from "react";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { AppHeader } from "../../components/app-header";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { signOut } from "../../lib/auth";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
});

const BG = "var(--bg)";
const TEXT = "var(--text)";
const GOLD = "var(--accent)";
const ROUGE = "var(--accent-red)";

type CompteTab = "profil" | "banque" | "parametres";

const TABS: { id: CompteTab; label: string }[] = [
  { id: "profil", label: "PROFIL" },
  { id: "banque", label: "BANQUE" },
  { id: "parametres", label: "PARAMÈTRES" },
];

function displayNameFrom(session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === "string" ? meta.full_name : undefined;
  return fullName || session.user.email?.split("@")[0] || "Membre";
}

export default function ComptePage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<CompteTab>("profil");

  useEffect(() => {
    let cancelled = false;

    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession(next);
      setDataLoaded(true);
    }

    function syncFromCookies(): void {
      void applyCookieSession(readSessionFromAuthCookies());
    }

    void applyCookieSession(readSessionFromAuthCookies());

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        syncFromCookies();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(syncFromCookies, 15000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [router]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined) {
    return (
      <div
        className={fonts}
        style={{
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          fontFamily: "var(--font-dm), system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ opacity: 0.7 }}>Chargement…</p>
      </div>
    );
  }

  if (session && !dataLoaded) {
    return (
      <div
        style={{
          background: "var(--bg)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(212,160,23,0.4)",
          }}
        >
          Chargement...
        </p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const name = displayNameFrom(session);

  return (
    <div
      className={`${fonts} leve-page-compte`}
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        paddingBottom: "6rem",
      }}
    >
      <EnDirectBanner />
      <AppHeader
        displayName={name}
        onSignOut={() => void handleSignOut()}
        signingOut={signingOut}
      />

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        <nav
          role="tablist"
          aria-label="Compte"
          style={{
            display: "flex",
            width: "100%",
            borderBottom: "1px solid rgba(245,240,232,0.12)",
            marginBottom: "1.5rem",
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${GOLD}`
                    : "2px solid transparent",
                  color: active ? GOLD : TEXT,
                  opacity: active ? 1 : 0.4,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "0.85rem 0.5rem",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "profil" ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Contenu profil</p>
        ) : null}
        {activeTab === "banque" ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Contenu banque</p>
        ) : null}
        {activeTab === "parametres" ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Contenu paramètres</p>
        ) : null}
      </main>

      <AppBottomNav session={session} />
    </div>
  );
}
