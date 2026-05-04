"use client";
import { signInWithGoogle } from "../lib/auth";

export default function Home() {
  return (
    <main style={{ background: "#080808", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#F5F0E8" }}>
      <h1 style={{ fontSize: "10rem", letterSpacing: "0.05em", lineHeight: 1, margin: 0 }}>LEVE</h1>
      <p style={{ opacity: 0.5, letterSpacing: "0.3em", textTransform: "uppercase", margin: "1rem 0 3rem" }}>Regarde · Trouve · Gagne</p>
      <button onClick={() => signInWithGoogle()} style={{ background: "#C0392B", color: "#F5F0E8", border: "none", padding: "1rem 3rem", cursor: "pointer" }}>
        Se connecter avec Google
      </button>
    </main>
  );
}
