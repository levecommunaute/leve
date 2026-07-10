/** Géolocalisation IP via ipapi.co — inscription / profils. */

export type GeoLocation = {
  pays: string | null;
  ville: string | null;
  continent: string | null;
};

const CONTINENT_BY_CODE: Record<string, string> = {
  NA: "Amériques",
  SA: "Amériques",
  EU: "Europe",
  AF: "Afrique",
  AS: "Asie",
  OC: "Océanie",
};

const CONTINENT_BY_NAME: Record<string, string> = {
  "north america": "Amériques",
  "south america": "Amériques",
  americas: "Amériques",
  europe: "Europe",
  africa: "Afrique",
  asia: "Asie",
  oceania: "Océanie",
  australia: "Océanie",
};

export function normalizeContinent(
  code: string | null | undefined,
  name: string | null | undefined,
): string | null {
  if (code) {
    const mapped = CONTINENT_BY_CODE[code.trim().toUpperCase()];
    if (mapped) return mapped;
  }
  if (name) {
    const mapped = CONTINENT_BY_NAME[name.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return null;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v === "127.0.0.1" || v === "::1" || v === "localhost") return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;
  return false;
}

type IpApiResponse = {
  error?: boolean;
  reason?: string;
  country_name?: string;
  city?: string;
  continent_code?: string;
  continent_name?: string;
};

export async function lookupGeoFromIp(ip: string | null): Promise<GeoLocation> {
  const empty: GeoLocation = { pays: null, ville: null, continent: null };
  if (!ip || isPrivateOrLocalIp(ip)) return empty;

  try {
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error("[geo-ip] ipapi status:", res.status);
      return empty;
    }
    const data = (await res.json()) as IpApiResponse;
    if (data.error) {
      console.error("[geo-ip] ipapi error:", data.reason ?? "unknown");
      return empty;
    }
    const pays =
      typeof data.country_name === "string" && data.country_name.trim()
        ? data.country_name.trim()
        : null;
    const ville =
      typeof data.city === "string" && data.city.trim() ? data.city.trim() : null;
    const continent = normalizeContinent(data.continent_code, data.continent_name);
    return { pays, ville, continent };
  } catch (e) {
    console.error("[geo-ip] lookup failed:", e);
    return empty;
  }
}
