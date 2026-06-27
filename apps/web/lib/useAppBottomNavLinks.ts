"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import {
  APP_BOTTOM_NAV_LINKS,
  getAppBottomNavLinks,
  resolveAppBottomNavLinksForSession,
  type AppBottomNavLink,
} from "./appBottomNavLinks";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

/** Liens de navigation bas — inclut /collaborateur si member_type = collaborateur. */
export function useAppBottomNavLinks(
  session: Session | null | undefined,
  memberTypeFromProfile?: string | null,
): AppBottomNavLink[] {
  const [memberType, setMemberType] = useState<string | null | undefined>(
    memberTypeFromProfile,
  );

  useEffect(() => {
    if (memberTypeFromProfile !== undefined) {
      setMemberType(memberTypeFromProfile);
    }
  }, [memberTypeFromProfile]);

  useEffect(() => {
    if (memberTypeFromProfile !== undefined) return;
    if (!session?.access_token) {
      setMemberType(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=member_type`,
          {
            headers: {
              apikey: KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
        const json = (await res.json()) as { member_type?: string }[];
        if (!cancelled) {
          setMemberType(Array.isArray(json) && json[0] ? json[0].member_type ?? null : null);
        }
      } catch {
        if (!cancelled) setMemberType(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, memberTypeFromProfile]);

  if (memberType === undefined && session) {
    return resolveAppBottomNavLinksForSession(APP_BOTTOM_NAV_LINKS, true);
  }
  return resolveAppBottomNavLinksForSession(
    getAppBottomNavLinks(memberType ?? null),
    Boolean(session),
  );
}
