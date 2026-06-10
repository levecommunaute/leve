"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase navigateur partagé (autoRefreshToken, persistSession et
 * detectSessionInUrl sont activés dans @repo/supabase/browser).
 */
export function getSupabaseClient(): SupabaseClient {
  return createBrowserClient();
}

let redirecting = false;

function redirectToHome(): void {
  if (typeof window === "undefined") return;
  if (redirecting) return;
  if (window.location.pathname === "/") return;
  redirecting = true;
  window.location.replace("/");
}

/** Détecte une erreur de JWT expiré (message Supabase/PostgREST ou statut 401). */
export function isJwtExpired(input: { status?: number | null; message?: string | null }): boolean {
  const { status, message } = input;
  if (status === 401) return true;
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("jwt expired") ||
    m.includes("jwt is expired") ||
    m.includes("invalid jwt") ||
    m.includes("token is expired") ||
    m.includes("refresh_token_not_found") ||
    m.includes("session_not_found")
  );
}

/**
 * Déconnecte proprement puis redirige vers la page d'accueil, sans afficher
 * d'erreur. À appeler dès qu'une réponse Supabase indique un JWT expiré.
 */
export async function handleSessionExpired(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await getSupabaseClient().auth.signOut();
  } catch {
    // ignore : la session est déjà invalide côté serveur
  }
  redirecting = false;
  redirectToHome();
}

/**
 * Vérifie une réponse Supabase (status HTTP + message d'erreur éventuel).
 * Si le JWT est expiré : signOut + redirection silencieuse vers "/" et
 * retourne true (l'appelant doit alors arrêter son traitement sans afficher
 * d'erreur). Retourne false sinon.
 */
export async function checkJwtExpired(input: {
  status?: number | null;
  message?: string | null;
}): Promise<boolean> {
  if (!isJwtExpired(input)) return false;
  await handleSessionExpired();
  return true;
}

let listenerInstalled = false;

/**
 * Listener global d'authentification :
 * - SIGNED_OUT ou session devenue null → redirection vers "/"
 * - échec du refresh du token (JWT expiré) → signOut + redirection vers "/"
 * À installer une seule fois au montage de l'application.
 */
export function installGlobalAuthListener(): () => void {
  if (typeof window === "undefined" || listenerInstalled) {
    return () => {};
  }
  listenerInstalled = true;

  const supabase = getSupabaseClient();
  let hadSession = false;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      hadSession = true;
      redirecting = false;
      return;
    }

    if (event === "SIGNED_OUT") {
      redirectToHome();
      return;
    }

    // Session devenue null après avoir existé (ex: refresh token expiré) :
    // on nettoie puis on redirige silencieusement vers l'accueil.
    if (hadSession && event === "TOKEN_REFRESHED") {
      void handleSessionExpired();
    }
  });

  return () => {
    listenerInstalled = false;
    subscription.unsubscribe();
  };
}
