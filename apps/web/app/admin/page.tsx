"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
});

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";

const STORAGE_KEY = "leve_admin_secret";

type VideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
};

type MemberRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  numero_membre: string | null;
};

/** Valeurs envoyées au PATCH (normalisées côté API). */
type MemberTypeForm = "communaute" | "pionnier" | "fondateur" | "collaborateur";
type MultiplierValue = 1.0 | 1.2 | 2.0;

type MemberDraft = {
  member_type: MemberTypeForm;
  multiplier: MultiplierValue;
  numero_membre: string;
};

function memberTypeToForm(raw: string | null): MemberTypeForm {
  const t = (raw ?? "").trim();
  const lower = t.toLowerCase();
  if (lower === "communaute" || lower === "communauté" || t === "Communauté" || t === "Communaute") return "communaute";
  if (lower === "pionnier" || t === "Pionnier") return "pionnier";
  if (lower === "fondateur" || t === "Fondateur") return "fondateur";
  if (lower === "collaborateur" || t === "Collaborateur") return "collaborateur";
  return "communaute";
}

function memberTypeLabel(form: MemberTypeForm): string {
  const labels: Record<MemberTypeForm, string> = {
    communaute: "Communauté",
    pionnier: "Pionnier",
    fondateur: "Fondateur",
    collaborateur: "Collaborateur",
  };
  return labels[form];
}

function displayMemberType(raw: string | null): string {
  return memberTypeLabel(memberTypeToForm(raw));
}

function multiplierToForm(raw: number | string | null): MultiplierValue {
  const n = Number(raw);
  if (Math.abs(n - 1.2) < 1e-9) return 1.2;
  if (Math.abs(n - 2) < 1e-9) return 2.0;
  return 1.0;
}

/** Valeur affichée / éditée pour le N° (l’API peut renvoyer une chaîne ou un nombre selon le driver). */
function rowNumeroMembreString(m: MemberRow): string {
  const v = m.numero_membre;
  if (v == null) return "";
  return String(v);
}

function memberRowDirty(m: MemberRow, d: MemberDraft): boolean {
  return (
    memberTypeToForm(m.member_type) !== d.member_type ||
    multiplierToForm(m.multiplier) !== d.multiplier ||
    rowNumeroMembreString(m) !== d.numero_membre
  );
}

function defaultMemberDraft(m: MemberRow): MemberDraft {
  return {
    member_type: memberTypeToForm(m.member_type),
    multiplier: multiplierToForm(m.multiplier),
    numero_membre: rowNumeroMembreString(m),
  };
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 6,
});


function cardStyle() {
  return {
    background: "rgba(245, 240, 232, 0.03)",
    border: "1px solid rgba(245, 240, 232, 0.1)",
    borderRadius: "14px",
    padding: "1.5rem",
    marginBottom: "1.75rem",
  };
}

function sectionTitle(text: string): JSX.Element {
  return (
    <h2
      style={{
        fontFamily: "var(--font-bebas), Impact, sans-serif",
        fontSize: "2rem",
        letterSpacing: "0.14em",
        margin: "0 0 1.25rem",
        color: GOLD,
        borderLeft: `4px solid ${ROUGE}`,
        paddingLeft: "0.85rem",
      }}
    >
      {text}
    </h2>
  );
}

export default function AdminPage(): JSX.Element {
  const fonts = `${bebas.variable} ${dmSans.variable}`;

  const [hydrated, setHydrated] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [codeByVideo, setCodeByVideo] = useState<Record<string, string>>({});
  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null);

  const [newYoutube, setNewYoutube] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPoints, setNewPoints] = useState<15 | 25 | 30>(15);
  const [addVideoLoading, setAddVideoLoading] = useState(false);
  const [addVideoMsg, setAddVideoMsg] = useState<string | null>(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [totalRevenue, setTotalRevenue] = useState("");
  const [redistLoading, setRedistLoading] = useState(false);
  const [redistResult, setRedistResult] = useState<{
    pmq_pool: number;
    value_per_point: number | null;
    total_distributed: number;
  } | null>(null);
  const [redistError, setRedistError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const getStoredSecret = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(STORAGE_KEY);
  }, []);

  const adminHeaders = useCallback(
    (init?: HeadersInit): Headers => {
      const h = new Headers(init);
      const s = getStoredSecret();
      if (s) h.set("X-Admin-Secret", s);
      return h;
    },
    [getStoredSecret],
  );

  useEffect(() => {
    setHydrated(true);
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) setAuthed(true);
  }, []);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const r = await fetch("/api/videos", { cache: "no-store" });
      const data = await r.json();
      setVideos(Array.isArray(data) ? (data as VideoRow[]) : []);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const r = await fetch("/api/admin/members", { headers: adminHeaders() });
      const j = (await r.json()) as { members?: MemberRow[]; error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Erreur membres");
        setMembers([]);
        return;
      }
      setMembers(j.members ?? []);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [adminHeaders]);

  useEffect(() => {
    if (!hydrated || !authed) return;
    void loadVideos();
    void loadMembers();
  }, [hydrated, authed, loadVideos, loadMembers]);

  useEffect(() => {
    const next: Record<string, MemberDraft> = {};
    for (const m of members) {
      next[m.id] = defaultMemberDraft(m);
    }
    setMemberDrafts(next);
  }, [members]);

  async function handleLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAuthError(null);
    setLoginLoading(true);
    try {
      const r = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretInput }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setAuthError(j.error ?? "Accès refusé");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, secretInput);
      setAuthed(true);
      setSecretInput("");
    } catch {
      setAuthError("Erreur réseau");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setCodeByVideo({});
    setRedistResult(null);
    setMembers([]);
    setMemberDrafts({});
    setEditingMemberId(null);
    setVideos([]);
  }

  async function generateCode(videoId: string): Promise<void> {
    setCodeLoadingId(videoId);
    try {
      const r = await fetch("/api/admin/code", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ video_id: videoId }),
      });
      const j = (await r.json()) as { code?: string; error?: string };
      if (!r.ok) {
        setCodeByVideo((prev) => ({
          ...prev,
          [videoId]: j.error ?? "Erreur",
        }));
        return;
      }
      if (j.code) {
        setCodeByVideo((prev) => ({ ...prev, [videoId]: j.code! }));
      }
    } catch {
      setCodeByVideo((prev) => ({ ...prev, [videoId]: "Erreur réseau" }));
    } finally {
      setCodeLoadingId(null);
    }
  }

  async function handleAddVideo(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAddVideoMsg(null);
    setAddVideoLoading(true);
    try {
      const r = await fetch("/api/admin/videos", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          youtube_id: newYoutube.trim(),
          title: newTitle.trim(),
          points_value: newPoints,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setAddVideoMsg(j.error ?? "Échec");
        return;
      }
      setNewYoutube("");
      setNewTitle("");
      setNewPoints(15);
      setAddVideoMsg("Vidéo ajoutée.");
      await loadVideos();
    } catch {
      setAddVideoMsg("Erreur réseau");
    } finally {
      setAddVideoLoading(false);
    }
  }

  async function handleRedistribution(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRedistError(null);
    setRedistResult(null);
    const rev = Number(totalRevenue.replace(",", "."));
    if (!Number.isFinite(rev) || rev <= 0) {
      setRedistError("Indiquez un revenu valide.");
      return;
    }
    setRedistLoading(true);
    try {
      const r = await fetch("/api/admin/redistribution", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ month, total_revenue: rev }),
      });
      const j = (await r.json()) as {
        pmq_pool?: number;
        value_per_point?: number | null;
        total_distributed?: number;
        error?: string;
      };
      if (!r.ok) {
        setRedistError(j.error ?? "Erreur redistribution");
        if (r.status === 422 && j.pmq_pool != null) {
          setRedistResult({
            pmq_pool: j.pmq_pool,
            value_per_point: j.value_per_point ?? null,
            total_distributed: j.total_distributed ?? 0,
          });
        }
        return;
      }
      setRedistResult({
        pmq_pool: j.pmq_pool ?? 0,
        value_per_point: j.value_per_point ?? null,
        total_distributed: j.total_distributed ?? 0,
      });
    } catch {
      setRedistError("Erreur réseau");
    } finally {
      setRedistLoading(false);
    }
  }

  async function saveMember(id: string): Promise<void> {
    const m = members.find((x) => x.id === id);
    const d = memberDrafts[id] ?? (m ? defaultMemberDraft(m) : null);
    if (!m || !d || !memberRowDirty(m, d)) return;
    const numeroTrim = d.numero_membre.trim();
    const numParsed = Number(numeroTrim);
    const isNumeroOneToTen =
      numeroTrim !== "" &&
      Number.isFinite(numParsed) &&
      Number.isInteger(numParsed) &&
      numParsed >= 1 &&
      numParsed <= 10;
    if (isNumeroOneToTen && d.member_type !== "pionnier") {
      setMembersError("Les numéros 1-10 sont réservés aux Pionniers");
      return;
    }
    setSavingMemberId(id);
    setMembersError(null);
    try {
      const r = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id,
          member_type: d.member_type.toLowerCase(),
          multiplier: d.multiplier,
          numero_membre: String(d.numero_membre),
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Échec enregistrement");
        return;
      }
      setEditingMemberId(null);
      await loadMembers();
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSavingMemberId(null);
    }
  }

  if (!hydrated) {
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
        <p style={{ opacity: 0.65 }}>Chargement…</p>
      </div>
    );
  }

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        paddingBottom: "4rem",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.35rem",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          position: "sticky",
          top: 0,
          background: "rgba(8, 8, 8, 0.94)",
          backdropFilter: "blur(10px)",
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "2rem",
              letterSpacing: "0.14em",
              color: TEXT,
              textDecoration: "none",
            }}
          >
            LEVE
          </Link>
          {authed ? (
            <span
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: GOLD,
                opacity: 0.95,
              }}
            >
              Admin
            </span>
          ) : null}
        </div>
        {authed ? (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "transparent",
              color: TEXT,
              border: `1px solid rgba(192, 57, 43, 0.55)`,
              padding: "0.45rem 1rem",
              cursor: "pointer",
              fontSize: "0.8rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Déconnexion
          </button>
        ) : null}
      </header>

      {!authed ? (
        <main
          style={{
            maxWidth: "420px",
            margin: "4rem auto",
            padding: "0 1rem",
          }}
        >
          <div style={cardStyle()}>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2.75rem",
                letterSpacing: "0.12em",
                margin: "0 0 0.35rem",
                color: TEXT,
              }}
            >
              Accès admin
            </h1>
            <p style={{ opacity: 0.72, margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              Saisissez la clé secrète pour gérer les vidéos, la redistribution et les membres.
            </p>
            <form onSubmit={(ev) => void handleLogin(ev)}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  opacity: 0.55,
                  marginBottom: "0.45rem",
                }}
              >
                Clé administrateur
              </label>
              <input
                type="password"
                autoComplete="off"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.85rem 1rem",
                  background: "rgba(245, 240, 232, 0.06)",
                  border: "1px solid rgba(245, 240, 232, 0.14)",
                  borderRadius: "8px",
                  color: TEXT,
                  fontSize: "1rem",
                  marginBottom: "1rem",
                }}
              />
              {authError ? (
                <p style={{ color: ROUGE, fontSize: "0.88rem", margin: "0 0 1rem" }}>{authError}</p>
              ) : null}
              <button
                type="submit"
                disabled={loginLoading || !secretInput.trim()}
                style={{
                  width: "100%",
                  background: ROUGE,
                  color: TEXT,
                  border: "none",
                  padding: "0.95rem",
                  cursor: loginLoading || !secretInput.trim() ? "not-allowed" : "pointer",
                  opacity: loginLoading || !secretInput.trim() ? 0.55 : 1,
                  fontSize: "0.85rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {loginLoading ? "Vérification…" : "Entrer"}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem" }}>
          {/* SECTION VIDÉOS */}
          <section style={cardStyle()}>
            {sectionTitle("VIDÉOS")}
            {videosLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des vidéos…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Titre
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        YouTube
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Points
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((v) => (
                      <tr key={v.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                        <td style={{ padding: "0.75rem 0.5rem", maxWidth: "280px" }}>{v.title ?? "—"}</td>
                        <td style={{ padding: "0.75rem 0.5rem", fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>
                          {v.youtube_id}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>{v.points_value ?? "—"}</td>
                        <td style={{ padding: "0.75rem 0.5rem", verticalAlign: "top" }}>
                          <button
                            type="button"
                            disabled={codeLoadingId === v.id}
                            onClick={() => void generateCode(v.id)}
                            style={{
                              background: "rgba(212, 160, 23, 0.12)",
                              color: GOLD,
                              border: `1px solid rgba(212, 160, 23, 0.35)`,
                              padding: "0.4rem 0.75rem",
                              cursor: codeLoadingId === v.id ? "wait" : "pointer",
                              fontSize: "0.72rem",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                            }}
                          >
                            {codeLoadingId === v.id ? "…" : "Générer le code"}
                          </button>
                          {codeByVideo[v.id] ? (
                            <div
                              style={{
                                marginTop: "0.5rem",
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.82rem",
                                color: TEXT,
                                opacity: 0.92,
                              }}
                            >
                              {codeByVideo[v.id]}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {videos.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune vidéo.</p> : null}
              </div>
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245, 240, 232, 0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.35rem",
                  margin: "0 0 1rem",
                  opacity: 0.9,
                }}
              >
                Nouvelle vidéo
              </h3>
              <form
                onSubmit={(ev) => void handleAddVideo(ev)}
                style={{
                  display: "grid",
                  gap: "1rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={labelSm}>ID YouTube</label>
                  <input
                    value={newYoutube}
                    onChange={(e) => setNewYoutube(e.target.value)}
                    placeholder="dQw4w9WgXcQ"
                    style={inputBase}
                  />
                </div>
                <div>
                  <label style={labelSm}>Titre</label>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titre affiché" style={inputBase} />
                </div>
                <div>
                  <label style={labelSm}>Points</label>
                  <select
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value) as 15 | 25 | 30)}
                    style={{ ...inputBase, cursor: "pointer" }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addVideoLoading}
                  style={{
                    background: ROUGE,
                    color: TEXT,
                    border: "none",
                    padding: "0.75rem 1.25rem",
                    cursor: addVideoLoading ? "wait" : "pointer",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontSize: "0.72rem",
                    height: "fit-content",
                  }}
                >
                  {addVideoLoading ? "…" : "Ajouter"}
                </button>
              </form>
              {addVideoMsg ? (
                <p style={{ marginTop: "0.85rem", fontSize: "0.88rem", opacity: 0.85 }}>{addVideoMsg}</p>
              ) : null}
            </div>
          </section>

          {/* SECTION REDISTRIBUTION */}
          <section style={cardStyle()}>
            {sectionTitle("REDISTRIBUTION")}
            <form
              onSubmit={(ev) => void handleRedistribution(ev)}
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelSm}>Mois</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputBase} />
              </div>
              <div>
                <label style={labelSm}>Revenu total (CAD)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalRevenue}
                  onChange={(e) => setTotalRevenue(e.target.value)}
                  placeholder="10000"
                  style={inputBase}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={redistLoading}
                  style={{
                    background: `linear-gradient(135deg, ${ROUGE}, #9b2f24)`,
                    color: TEXT,
                    border: "none",
                    padding: "0.85rem 1.5rem",
                    cursor: redistLoading ? "wait" : "pointer",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    width: "100%",
                  }}
                >
                  {redistLoading ? "Traitement…" : "Déclencher la redistribution"}
                </button>
              </div>
            </form>
            {redistError ? <p style={{ color: ROUGE, marginTop: "1rem", fontSize: "0.9rem" }}>{redistError}</p> : null}
            {redistResult ? (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  background: "rgba(212, 160, 23, 0.06)",
                  border: `1px solid rgba(212, 160, 23, 0.22)`,
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.72rem", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
                  Résultat
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.9 }}>
                  <li>
                    <strong style={{ color: GOLD }}>pmq_pool</strong> : {cad.format(redistResult.pmq_pool)}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>value_per_point</strong> :{" "}
                    {redistResult.value_per_point != null ? cad.format(redistResult.value_per_point) : "—"}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>total_distributed</strong> :{" "}
                    {cad.format(redistResult.total_distributed)}
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          {/* SECTION GESTION DES MEMBRES */}
          <section style={cardStyle()}>
            {sectionTitle("GESTION DES MEMBRES")}
            <p style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>
              Total :{" "}
              <strong style={{ color: GOLD, fontSize: "1.35rem" }}>{membersLoading ? "…" : members.length}</strong>{" "}
              membre{members.length !== 1 ? "s" : ""}
            </p>
            {membersError ? <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{membersError}</p> : null}
            {membersLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {["Id", "Nom", "Courriel", "Type", "Mult.", "N° membre", ""].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            minWidth: i === 0 ? "7.5rem" : undefined,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    {members.map((m) => {
                      const d = memberDrafts[m.id] ?? defaultMemberDraft(m);
                      const dirty = memberRowDirty(m, d);
                      const multKey = d.multiplier === 1.2 ? "1.2" : d.multiplier === 2 ? "2" : "1";
                      const multDisplay =
                        typeof m.multiplier === "number"
                          ? String(m.multiplier)
                          : m.multiplier != null && String(m.multiplier).length
                            ? String(m.multiplier)
                            : "—";
                      return (
                        <tbody key={m.id}>
                          <tr style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td
                              style={{
                                padding: "0.6rem 0.5rem",
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.72rem",
                                wordBreak: "break-all",
                                verticalAlign: "top",
                                maxWidth: "10rem",
                              }}
                              title={m.id}
                            >
                              {m.id}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.display_name ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.email ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={d.member_type}
                                  onChange={(e) => {
                                    const v = e.target.value as MemberTypeForm;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, member_type: v },
                                    }));
                                  }}
                                  aria-label="Type de membre"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="pionnier">pionnier</option>
                                  <option value="fondateur">fondateur</option>
                                  <option value="communaute">communaute</option>
                                  <option value="collaborateur">collaborateur</option>
                                </select>
                              ) : (
                                displayMemberType(m.member_type)
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "3.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={multKey}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    const mult = (v === 1.2 ? 1.2 : v === 2 ? 2.0 : 1.0) as MultiplierValue;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, multiplier: mult },
                                    }));
                                  }}
                                  aria-label="Multiplicateur"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="1">1.0</option>
                                  <option value="1.2">1.2</option>
                                  <option value="2">2.0</option>
                                </select>
                              ) : (
                                multDisplay
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <input
                                  type="text"
                                  value={d.numero_membre}
                                  onChange={(e) =>
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, numero_membre: e.target.value },
                                    }))
                                  }
                                  aria-label="Numéro membre"
                                  autoComplete="off"
                                  placeholder="N° membre"
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : rowNumeroMembreString(m).length ? (
                                rowNumeroMembreString(m)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>
                              {editingMemberId === m.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", alignItems: "stretch" }}>
                                  <button
                                    type="button"
                                    disabled={!dirty || savingMemberId === m.id}
                                    onClick={() => void saveMember(m.id)}
                                    style={{
                                      background: dirty ? ROUGE : "rgba(245, 240, 232, 0.06)",
                                      color: TEXT,
                                      border: `1px solid ${dirty ? ROUGE : "rgba(245, 240, 232, 0.12)"}`,
                                      padding: "0.45rem 0.55rem",
                                      cursor: !dirty || savingMemberId === m.id ? "not-allowed" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      opacity: dirty ? 1 : 0.5,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {savingMemberId === m.id ? "…" : "Sauvegarder"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingMemberId === m.id}
                                    onClick={() => setEditingMemberId(null)}
                                    style={{
                                      background: "transparent",
                                      color: TEXT,
                                      border: "1px solid rgba(245, 240, 232, 0.2)",
                                      padding: "0.45rem 0.55rem",
                                      cursor: savingMemberId === m.id ? "wait" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.08em",
                                      textTransform: "uppercase",
                                      opacity: 0.85,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: defaultMemberDraft(m),
                                    }));
                                    setEditingMemberId(m.id);
                                  }}
                                  style={{
                                    background: "rgba(212, 160, 23, 0.12)",
                                    color: GOLD,
                                    border: "1px solid rgba(212, 160, 23, 0.35)",
                                    padding: "0.45rem 0.65rem",
                                    cursor: "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Modifier
                                </button>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      );
                    })}
                </table>
                {members.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun membre.</p> : null}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

const labelSm = {
  display: "block",
  fontSize: "0.68rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  opacity: 0.5,
  marginBottom: "0.4rem",
} as const;

const inputBase = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.65rem 0.75rem",
  background: "rgba(245, 240, 232, 0.05)",
  border: "1px solid rgba(245, 240, 232, 0.12)",
  borderRadius: "8px",
  color: TEXT,
  fontSize: "0.9rem",
} as const;
