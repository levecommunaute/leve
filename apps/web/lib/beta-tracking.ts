"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect } from "react";

/**
 * Tracking Beta LEVE :
 * - trackBetaAction : +10 points (beta_actions + profiles.beta_points)
 * - startBetaSession / endBetaSession : sessions de navigation (beta_sessions
 *   + profiles.beta_temps_total_secondes)
 * - useBetaTracking : hook à brancher sur les pages clés (page_view + session)
 *
 * Les écritures passent par des fonctions RPC SECURITY DEFINER
 * (beta_track_action, beta_start_session, beta_end_session) qui vérifient
 * auth.uid() et profiles.is_beta_tester côté base.
 */

const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

export type BetaActionType = "page_view" | string;

async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
  accessToken: string,
  keepalive = false,
): Promise<T | null> {
  try {
    const res = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
      method: "POST",
      keepalive,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Vérifie profiles.is_beta_tester pour le membre connecté. */
export async function isBetaTester(
  membreId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(membreId)}&select=is_beta_tester`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as { is_beta_tester?: unknown }[];
    return rows[0]?.is_beta_tester === true;
  } catch {
    return false;
  }
}

/**
 * Enregistre une action beta (+10 points) : INSERT beta_actions puis
 * UPDATE profiles (beta_points += 10, beta_derniere_activite = NOW()).
 */
export async function trackBetaAction(
  membreId: string,
  actionType: BetaActionType,
  page: string,
  accessToken: string,
): Promise<string | null> {
  void membreId; // l'identité est garantie côté base via auth.uid()
  return rpc<string>(
    "beta_track_action",
    { p_action_type: actionType, p_page: page },
    accessToken,
  );
}

/** Démarre une session beta (INSERT beta_sessions, debut = NOW()). */
export async function startBetaSession(
  membreId: string,
  accessToken: string,
): Promise<string | null> {
  void membreId;
  return rpc<string>("beta_start_session", {}, accessToken);
}

/**
 * Termine une session beta : fin = NOW(), duree_secondes, et cumul dans
 * profiles.beta_temps_total_secondes. `keepalive` permet l'envoi pendant
 * la fermeture de l'onglet.
 */
export async function endBetaSession(
  sessionId: string,
  accessToken: string,
  keepalive = false,
): Promise<number | null> {
  return rpc<number>(
    "beta_end_session",
    { p_session_id: sessionId },
    accessToken,
    keepalive,
  );
}

// --- État module : une seule session beta active par onglet (survit aux
// navigations client Next.js, terminée à la fermeture/déconnexion). ---

type ActiveBetaSession = { id: string; token: string };

let activeSession: ActiveBetaSession | null = null;
let sessionStarting = false;
let pagehideInstalled = false;
const betaStatusCache = new Map<string, boolean>();
let lastPageView: { key: string; at: number } | null = null;

function installPagehideHandler(): void {
  if (pagehideInstalled || typeof window === "undefined") return;
  pagehideInstalled = true;
  window.addEventListener("pagehide", () => {
    if (!activeSession) return;
    const { id, token } = activeSession;
    activeSession = null;
    void endBetaSession(id, token, true);
  });
}

/** Termine la session beta active (à appeler lors de la déconnexion). */
export async function endActiveBetaSession(): Promise<void> {
  if (!activeSession) return;
  const { id, token } = activeSession;
  activeSession = null;
  await endBetaSession(id, token, true);
}

async function ensureBetaSession(uid: string, token: string): Promise<void> {
  if (activeSession || sessionStarting) return;
  sessionStarting = true;
  try {
    const id = await startBetaSession(uid, token);
    if (id) {
      activeSession = { id, token };
      installPagehideHandler();
    }
  } finally {
    sessionStarting = false;
  }
}

/**
 * Hook à appeler sur les pages clés : si le membre est beta testeur,
 * enregistre un page_view au chargement et maintient une session beta
 * (démarrée à l'arrivée, terminée à la fermeture de l'onglet ou à la
 * déconnexion via endActiveBetaSession).
 */
export function useBetaTracking(
  session: Session | null | undefined,
  page: string,
): void {
  const token = session?.access_token ?? null;
  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (!token || !uid) return;
    let cancelled = false;

    void (async () => {
      let beta = betaStatusCache.get(uid);
      if (beta === undefined) {
        beta = await isBetaTester(uid, token);
        betaStatusCache.set(uid, beta);
      }
      if (!beta || cancelled) return;

      // Garde anti-doublon (StrictMode / re-montages rapprochés)
      const key = `${uid}:${page}`;
      const now = Date.now();
      if (!lastPageView || lastPageView.key !== key || now - lastPageView.at > 5000) {
        lastPageView = { key, at: now };
        void trackBetaAction(uid, "page_view", page, token);
      }

      void ensureBetaSession(uid, token);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, uid, page]);
}
