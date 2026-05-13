import type { Session } from "@supabase/supabase-js";

/** Cookie d’auth Supabase découpé (ref projet lrolatbudvianeazliax). */
export const SB_AUTH_COOKIE_BASE = "sb-lrolatbudvianeazliax-auth-token";

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const s = part.trim();
    if (s.startsWith(prefix)) {
      try {
        return decodeURIComponent(s.slice(prefix.length));
      } catch {
        return s.slice(prefix.length);
      }
    }
  }
  return null;
}

/**
 * Lit les segments `.0` / `.1`, décode le base64 et retourne une session
 * utilisable (access_token, user.id) sans `createBrowserClient` / getSession.
 */
export function readSessionFromAuthCookies(): Session | null {
  const p0 = readCookieValue(`${SB_AUTH_COOKIE_BASE}.0`);
  const p1 = readCookieValue(`${SB_AUTH_COOKIE_BASE}.1`);
  const combined = [p0, p1].filter(Boolean).join("");
  if (!combined) return null;
  try {
    const b64 = combined.replace(/^base64-/, "");
    const jsonStr = atob(b64);
    const parsed = JSON.parse(jsonStr) as unknown;
    const body =
      parsed &&
      typeof parsed === "object" &&
      "access_token" in parsed &&
      "user" in parsed
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            "currentSession" in parsed &&
            (parsed as { currentSession?: unknown }).currentSession &&
            typeof (parsed as { currentSession: unknown }).currentSession ===
              "object"
          ? (parsed as { currentSession: Session }).currentSession
          : null;
    if (!body || typeof body !== "object") return null;
    const s = body as Session;
    if (typeof s.access_token !== "string" || !s.user?.id) return null;
    return s;
  } catch {
    return null;
  }
}
