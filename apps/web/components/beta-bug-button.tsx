"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "../lib/supabase";

type Severite = "P1" | "P2" | "P3";

const SEVERITE_OPTIONS: { value: Severite; label: string }[] = [
  { value: "P1", label: "P1 — Bloquant" },
  { value: "P2", label: "P2 — Majeur" },
  { value: "P3", label: "P3 — Mineur" },
];

const fabStyle: CSSProperties = {
  position: "fixed",
  bottom: "1.5rem",
  right: "1.5rem",
  zIndex: 9999,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  background: "#991b1b",
  color: "#ffffff",
  border: "none",
  borderRadius: "9999px",
  padding: "0.7rem 1.1rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: "440px",
  background: "#18181b",
  color: "#fafafa",
  borderRadius: "12px",
  padding: "1.5rem",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#a1a1aa",
  marginBottom: "0.3rem",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#27272a",
  color: "#fafafa",
  border: "1px solid #3f3f46",
  borderRadius: "8px",
  padding: "0.6rem 0.7rem",
  fontSize: "0.9rem",
  marginBottom: "1rem",
};

export function BetaBugButton(): JSX.Element | null {
  const pathname = usePathname();
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [membreId, setMembreId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [page, setPage] = useState("");
  const [description, setDescription] = useState("");
  const [severite, setSeverite] = useState<Severite>("P3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const check = async (): Promise<void> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (active) {
          setIsBetaTester(false);
          setMembreId(null);
        }
        return;
      }
      const uid = session.user.id;
      const { data } = await supabase
        .from("profiles")
        .select("is_beta_tester")
        .eq("id", uid)
        .maybeSingle();
      if (active) {
        setIsBetaTester(Boolean(data?.is_beta_tester));
        setMembreId(uid);
      }
    };

    void check();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const openModal = useCallback((): void => {
    setPage(
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : (pathname ?? ""),
    );
    setDescription("");
    setSeverite("P3");
    setError(null);
    setSent(false);
    setOpen(true);
  }, [pathname]);

  const submit = useCallback(async (): Promise<void> => {
    if (!description.trim()) {
      setError("Merci de décrire le bug.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/beta/signaler-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: page.trim(),
          description: description.trim(),
          severite,
          membre_id: membreId,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Échec de l'envoi. Réessayez.");
        return;
      }
      setSent(true);
      window.setTimeout(() => setOpen(false), 1200);
    } catch {
      setError("Échec de l'envoi. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }, [description, page, severite, membreId]);

  if (!isBetaTester) return null;

  return (
    <>
      <button
        type="button"
        style={fabStyle}
        onClick={openModal}
        aria-label="Signaler un bug"
      >
        🐛 Bug
      </button>

      {open ? (
        <div
          style={overlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setOpen(false);
          }}
        >
          <div style={modalStyle} role="dialog" aria-modal="true">
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.15rem", fontWeight: 700 }}>
              🐛 Signaler un bug
            </h2>

            {sent ? (
              <p style={{ color: "#4ade80", fontSize: "0.95rem", margin: "0.5rem 0 1rem" }}>
                Merci ! Votre rapport a bien été envoyé.
              </p>
            ) : (
              <>
                <label style={labelStyle} htmlFor="beta-bug-page">
                  Page concernée
                </label>
                <input
                  id="beta-bug-page"
                  type="text"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                  style={fieldStyle}
                />

                <label style={labelStyle} htmlFor="beta-bug-description">
                  Description
                </label>
                <textarea
                  id="beta-bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Décrivez ce qui ne fonctionne pas, et comment le reproduire…"
                  style={{ ...fieldStyle, resize: "vertical" }}
                />

                <label style={labelStyle} htmlFor="beta-bug-severite">
                  Sévérité
                </label>
                <select
                  id="beta-bug-severite"
                  value={severite}
                  onChange={(e) => setSeverite(e.target.value as Severite)}
                  style={fieldStyle}
                >
                  {SEVERITE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {error ? (
                  <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0 0 0.8rem" }}>
                    {error}
                  </p>
                ) : null}

                <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={submitting}
                    style={{
                      background: "transparent",
                      color: "#a1a1aa",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      padding: "0.55rem 1rem",
                      fontSize: "0.9rem",
                      cursor: submitting ? "default" : "pointer",
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting}
                    style={{
                      background: "#991b1b",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.55rem 1.2rem",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      cursor: submitting ? "default" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
