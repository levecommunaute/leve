import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

type WhitelistRow = {
  id: string;
  email: string;
  nom_testeur: string | null;
};

type ProfileRow = {
  id: string;
  numero_membre: string | number | null;
  display_name: string | null;
  email: string | null;
  beta_points: number | string | null;
  beta_temps_total_secondes: number | string | null;
  beta_derniere_activite: string | null;
};

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Filtre PostgREST `or` : égalité email insensible à la casse (ilike sans wildcards). */
function emailIlikeOrFilter(emails: string[]): string {
  return emails
    .map((email) => {
      const escaped = email.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `email.ilike."${escaped}"`;
    })
    .join(",");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    const { data: whitelist, error: whitelistError } = await supabase
      .from("beta_emails_autorises")
      .select("id, email, nom_testeur")
      .eq("actif", true);

    if (whitelistError) {
      return NextResponse.json({ error: whitelistError.message }, { status: 500 });
    }

    const actifs = (whitelist ?? []) as WhitelistRow[];
    if (actifs.length === 0) {
      return NextResponse.json({ testeurs: [] });
    }

    const emails = actifs
      .map((row) => normalizeEmail(row.email))
      .filter((email) => email.length > 0);

    const profileByEmail = new Map<string, ProfileRow>();

    if (emails.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(
          "id, numero_membre, display_name, email, beta_points, beta_temps_total_secondes, beta_derniere_activite",
        )
        .or(emailIlikeOrFilter(emails));

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 });
      }

      for (const profile of (profiles ?? []) as ProfileRow[]) {
        const key = normalizeEmail(profile.email);
        if (!key) continue;
        // Premier match gagne si doublons (ne devrait pas arriver).
        if (!profileByEmail.has(key)) {
          profileByEmail.set(key, profile);
        }
      }
    }

    const testeurs = actifs
      .map((row) => {
        const email = normalizeEmail(row.email) || row.email;
        const profile = profileByEmail.get(email);

        if (profile) {
          return {
            id: profile.id,
            numero_membre: profile.numero_membre,
            display_name: profile.display_name,
            email: profile.email ?? row.email,
            beta_points: profile.beta_points ?? 0,
            beta_temps_total_secondes: profile.beta_temps_total_secondes ?? 0,
            beta_derniere_activite: profile.beta_derniere_activite,
            statut: null as string | null,
            a_profil: true,
          };
        }

        return {
          id: row.id,
          numero_membre: null,
          display_name: row.nom_testeur,
          email: row.email,
          beta_points: 0,
          beta_temps_total_secondes: 0,
          beta_derniere_activite: null,
          statut: "Jamais connecté",
          a_profil: false,
        };
      })
      .sort((a, b) => Number(b.beta_points ?? 0) - Number(a.beta_points ?? 0));

    return NextResponse.json({ testeurs });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
