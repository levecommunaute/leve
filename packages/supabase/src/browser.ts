import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

export function createBrowserClient() {
  return createSupabaseBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
