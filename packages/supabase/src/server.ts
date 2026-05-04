import {
  createServerClient as createSupabaseServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Cookie writes are not allowed in some Server Component contexts.
        }
      },
    },
  });
}
