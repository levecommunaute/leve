"use client";

import { useEffect } from "react";
import { installGlobalAuthListener } from "../lib/supabase";

/** Monte le listener global de session Supabase (JWT expiré, sign-out). */
export function AuthSessionGuard(): null {
  useEffect(() => installGlobalAuthListener(), []);
  return null;
}
