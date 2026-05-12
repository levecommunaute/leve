import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

const globalKey = "__repoSupabaseBrowserClient__" as const;

type GlobalWithSupabase = typeof globalThis & {
  [globalKey]?: SupabaseClient;
};

const globalForSupabase = globalThis as GlobalWithSupabase;

let browserClient: SupabaseClient | undefined;

export function createBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    return createSupabaseBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  }

  browserClient ??=
    globalForSupabase[globalKey] ??
    createSupabaseBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());

  globalForSupabase[globalKey] = browserClient;

  return browserClient;
}
