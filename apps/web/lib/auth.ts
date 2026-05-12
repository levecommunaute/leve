import { createBrowserClient } from "@repo/supabase/browser";
import type { Session } from "@supabase/supabase-js";

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

export async function signInWithGoogle(): Promise<void> {
  const supabase = createBrowserClient();
  const origin = getAppOrigin();
  const redirectTo = origin ? `${origin}/auth/callback` : "/auth/callback";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
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