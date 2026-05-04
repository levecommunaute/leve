import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, setAuthToken } from "../lib/api";

export type Member = {
  display_name: string;
  email: string;
  member_type: string;
  numero_membre: string;
  multiplier: number;
  points_pmq?: number;
  derniere_redistribution?: string | null;
};

type SessionContextValue = {
  member: Member | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function normalizeMember(raw: unknown): Member | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested =
    typeof o.member === "object" && o.member !== null
      ? (o.member as Record<string, unknown>)
      : o;
  const display_name = String(
    nested.display_name ?? nested.name ?? "Membre"
  );
  return {
    display_name,
    email: String(nested.email ?? ""),
    member_type: String(nested.member_type ?? nested.type ?? ""),
    numero_membre: String(
      nested.numero_membre ?? nested.member_number ?? ""
    ),
    multiplier: Number(nested.multiplier ?? 1) || 1,
    points_pmq:
      nested.points_pmq !== undefined
        ? Number(nested.points_pmq)
        : nested.pointsPMQ !== undefined
          ? Number(nested.pointsPMQ)
          : undefined,
    derniere_redistribution:
      (nested.derniere_redistribution ??
        nested.last_redistribution ??
        null) as string | null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<unknown>("/api/membre/profil");
      setMember(normalizeMember(data));
    } catch {
      setMember(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await setAuthToken(null);
    setMember(null);
  }, []);

  const value = useMemo(
    () => ({ member, isLoading, refresh, signOut }),
    [member, isLoading, refresh, signOut]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
