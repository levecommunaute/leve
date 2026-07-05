import { createBrowserClient } from "@repo/supabase/browser";
import type { Session } from "@supabase/supabase-js";

export type AuthMode = "rejoindre" | "connecter";

function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

export async function signInWithGoogle(
  mode: AuthMode = "rejoindre",
  options?: { beta?: boolean; ref?: string | null },
): Promise<void> {
  const supabase = createBrowserClient();
  const origin = getAppOrigin();
  const base = origin ? `${origin}/auth/callback` : "/auth/callback";
  const betaParam = options?.beta ? "&beta=true" : "";
  const refRaw = options?.ref ?? null;
  const refParam =
    refRaw && /^LEVE-[A-Z0-9]{6}$/i.test(refRaw.trim())
      ? `&ref=${encodeURIComponent(refRaw.trim().toUpperCase())}`
      : "";
  const redirectTo = `${base}?mode=${encodeURIComponent(mode)}${betaParam}${refParam}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: ["https://www.googleapis.com/auth/youtube.readonly"].join(" "),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw error;
  }

  if (data.url) {
    window.location.assign(data.url);
  }
}

export async function signOut(): Promise<void> {
  const cookieNames = document.cookie
    .split(";")
    .map(c => c.trim().split("=")[0])
    .filter((name): name is string => typeof name === "string" && (name.includes("supabase") || name.includes("sb-")));

  cookieNames.forEach(name => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${window.location.hostname}`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
  });

  const supabase = createBrowserClient();
  await supabase.auth.signOut().catch(() => {});

  window.location.href = "/";
}

/** Uses the browser client; call from Client Components (or after hydration). */
export async function getSession(): Promise<Session | null> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
