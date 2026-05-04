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
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/** Uses the browser client; call from Client Components (or after hydration). */
export async function getSession(): Promise<Session | null> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
