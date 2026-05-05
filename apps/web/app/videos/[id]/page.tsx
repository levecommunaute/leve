"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const SUPABASE_URL = "https://lrolatbudvianeazliax.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  points_value: number;
}

export default function VideoPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [f1, setF1] = useState<string>("");
  const [f2, setF2] = useState<string>("");
  const [f3, setF3] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [result, setResult] = useState<{success: boolean; points_awarded?: number; message?: string} | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
      .then(r => r.json())
      .then(data => { if (data.id) setUserId(data.id); });
  }, []);

  useEffect(() => {
    const url = `${SUPABASE_URL}/rest/v1/videos?id=eq.${id}&select=*`;
    const key = SUPABASE_KEY;
    fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      .then(r => r.json())
      .then(data => { setVideo(data[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    const code = `${f1}-${f2}-${f3}`;
    const res = await fetch("/api/code/valider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: id, submitted_code: `${f1}-${f2}-${f3}`, membre_id: userId })
    });
    const data = await res.json();
    setResult(data);
    setSubmitting(false);
  };

  if (loading) return <div style={{ background: "#080808", minHeight: "100vh", color: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>Chargement...</div>;
  if (!video) return <div style={{ background: "#080808", minHeight: "100vh", color: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>Vidéo introuvable</div>;

  return (
    <main style={{ background: "#080808", minHeight: "100vh", color: "#F5F0E8", fontFamily: "DM Sans, sans-serif" }}>
      <nav style={{ padding: "1rem 2rem", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span onClick={() => router.push("/dashboard")} style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.5rem", cursor: "pointer", letterSpacing: ".1em" }}>LEVE</span>
        <span onClick={() => router.push("/videos")} style={{ fontSize: ".8rem", opacity: .5, cursor: "pointer" }}>← Retour aux vidéos</span>
      </nav>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.5rem", marginBottom: ".5rem" }}>{video.title}</h1>
        <span style={{ background: "#D4A017", color: "#080808", padding: ".25rem .75rem", fontSize: ".75rem", fontWeight: 600 }}>{video.points_value} pts</span>

        <div style={{ margin: "2rem 0", aspectRatio: "16/9" }}>
          <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${video.youtube_id}`} allowFullScreen style={{ border: "none" }} />
        </div>

        <div style={{ background: "#111", padding: "2rem", marginTop: "2rem" }}>
          <h2 style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.8rem", marginBottom: "1.5rem", color: "#C0392B" }}>SOUMETS TON CODE</h2>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <input maxLength={4} value={f1} onChange={e => setF1(e.target.value.toUpperCase())} placeholder="XXXX" style={{ width: "80px", padding: ".75rem", background: "#222", border: "1px solid #333", color: "#F5F0E8", textAlign: "center", fontSize: "1.1rem", letterSpacing: ".2em" }} />
            <span style={{ opacity: .4 }}>-</span>
            <input maxLength={4} value={f2} onChange={e => setF2(e.target.value.toUpperCase())} placeholder="XXXX" style={{ width: "80px", padding: ".75rem", background: "#222", border: "1px solid #333", color: "#F5F0E8", textAlign: "center", fontSize: "1.1rem", letterSpacing: ".2em" }} />
            <span style={{ opacity: .4 }}>-</span>
            <input maxLength={4} value={f3} onChange={e => setF3(e.target.value.toUpperCase())} placeholder="XXXX" style={{ width: "80px", padding: ".75rem", background: "#222", border: "1px solid #333", color: "#F5F0E8", textAlign: "center", fontSize: "1.1rem", letterSpacing: ".2em" }} />
            <button onClick={handleSubmit} disabled={submitting || f1.length < 4 || f2.length < 4 || f3.length < 4} style={{ background: "#C0392B", color: "#fff", border: "none", padding: ".75rem 2rem", cursor: "pointer", fontSize: ".9rem", letterSpacing: ".1em", opacity: (f1.length < 4 || f2.length < 4 || f3.length < 4) ? .5 : 1 }}>
              {submitting ? "..." : "VALIDER"}
            </button>
          </div>
          {result && (
            <div style={{ marginTop: "1.5rem", padding: "1rem", background: result.success ? "rgba(46,204,113,.1)" : "rgba(192,57,43,.1)", border: `1px solid ${result.success ? "#2ECC71" : "#C0392B"}` }}>
              {result.success ? `✅ Code correct ! +${result.points_awarded} points` : `❌ ${result.message || "Code incorrect"}`}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
