import type { SupabaseClient } from "@supabase/supabase-js";

const REF_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REF_STORAGE_KEY = "leve_ref";
const REF_CODE_PATTERN = /^LEVE-[A-Z0-9]{6}$/;

export const PARRAINAGE_FILLEUL_PTS = 20;
export const PARRAINAGE_PARRAIN_PTS = 50;
export const PARRAINAGE_ACTIVATION_DAYS = 30;
export const PARRAINAGE_EXPIRE_DAYS = 90;

export function parseReferralRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!REF_CODE_PATTERN.test(normalized)) return null;
  return normalized;
}

export function buildReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += REF_CODE_CHARS[Math.floor(Math.random() * REF_CODE_CHARS.length)];
  }
  return `LEVE-${suffix}`;
}

export function getStoredReferralRef(): string | null {
  if (typeof window === "undefined") return null;
  return parseReferralRef(sessionStorage.getItem(REF_STORAGE_KEY));
}

export function storeReferralRef(raw: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const parsed = parseReferralRef(raw);
  if (parsed) {
    sessionStorage.setItem(REF_STORAGE_KEY, parsed);
  }
}

export function buildReferralLink(code: string, appUrl?: string): string {
  const base = (appUrl ?? "https://levecommunaute.com").replace(/\/$/, "");
  return `${base}?ref=${encodeURIComponent(code)}`;
}

export async function generateUniqueReferralCode(
  svc: SupabaseClient,
): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = buildReferralCode();
    const { data } = await svc
      .from("profiles")
      .select("id")
      .eq("code_parrainage", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Impossible de générer un code parrainage unique");
}

export async function creditPmqPoints(
  svc: SupabaseClient,
  membreId: string,
  amount: number,
  description: string,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;

  const { data: profile } = await svc
    .from("profiles")
    .select("multiplier")
    .eq("id", membreId)
    .maybeSingle();

  const rawMult = Number(profile?.multiplier ?? 1);
  const multiplier = Number.isFinite(rawMult) && rawMult > 0 ? rawMult : 1;
  const ptsPonderes = amount * multiplier;

  const { error: ptError } = await svc.from("points_transactions").insert({
    membre_id: membreId,
    amount,
    type: "quiz",
    description,
  });
  if (ptError) throw new Error(ptError.message);

  const { error: ppError } = await svc.from("points_ponderes").insert({
    membre_id: membreId,
    pts_bruts: amount,
    multiplicateur: multiplier,
    pts_ponderes: ptsPonderes,
    type: "quiz",
  });
  if (ppError) throw new Error(ppError.message);
}

export async function assignReferralCodeIfMissing(
  svc: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await svc
    .from("profiles")
    .select("code_parrainage")
    .eq("id", userId)
    .maybeSingle();

  const current = parseReferralRef(
    typeof existing?.code_parrainage === "string" ? existing.code_parrainage : null,
  );
  if (current) return current;

  const code = await generateUniqueReferralCode(svc);
  const { error } = await svc
    .from("profiles")
    .update({ code_parrainage: code })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  return code;
}

export async function processReferralSignup(
  svc: SupabaseClient,
  filleulId: string,
  refCode: string | null | undefined,
): Promise<void> {
  const code = parseReferralRef(refCode);
  if (!code) return;

  const { data: parrain } = await svc
    .from("profiles")
    .select("id")
    .eq("code_parrainage", code)
    .maybeSingle();

  const parrainId = typeof parrain?.id === "string" ? parrain.id : null;
  if (!parrainId || parrainId === filleulId) return;

  const { error: insertError } = await svc.from("parrainages").insert({
    parrain_id: parrainId,
    filleul_id: filleulId,
    code_parrainage: code,
    statut: "pending",
  });

  if (insertError) {
    if (insertError.code === "23505") return;
    throw new Error(insertError.message);
  }

  await creditPmqPoints(
    svc,
    filleulId,
    PARRAINAGE_FILLEUL_PTS,
    "Bonus parrainage — filleul",
  );
}

export type ParrainageActivationResult = {
  activated: number;
  expired: number;
  errors: string[];
};

export async function activateEligibleParrainages(
  svc: SupabaseClient,
): Promise<ParrainageActivationResult> {
  const now = Date.now();
  const activationCutoff = new Date(now - PARRAINAGE_ACTIVATION_DAYS * 86_400_000).toISOString();
  const expireCutoff = new Date(now - PARRAINAGE_EXPIRE_DAYS * 86_400_000).toISOString();

  const result: ParrainageActivationResult = {
    activated: 0,
    expired: 0,
    errors: [],
  };

  const { data: pendingRows, error: pendingError } = await svc
    .from("parrainages")
    .select("id, parrain_id, filleul_id, code_parrainage, created_at")
    .eq("statut", "pending")
    .lte("created_at", activationCutoff);

  if (pendingError) {
    result.errors.push(pendingError.message);
    return result;
  }

  for (const row of pendingRows ?? []) {
    const filleulId = String(row.filleul_id ?? "");
    if (!filleulId) continue;

    const { data: filleul } = await svc
      .from("profiles")
      .select("derniere_activite")
      .eq("id", filleulId)
      .maybeSingle();

    const lastActivity = filleul?.derniere_activite
      ? new Date(String(filleul.derniere_activite)).getTime()
      : NaN;

    if (!Number.isFinite(lastActivity)) continue;

    const createdAt = new Date(String(row.created_at)).getTime();
    if (now - createdAt < PARRAINAGE_ACTIVATION_DAYS * 86_400_000) continue;

    const { data: updated, error: updateError } = await svc
      .from("parrainages")
      .update({
        statut: "actif",
        active_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("statut", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      result.errors.push(updateError.message);
      continue;
    }
    if (!updated) continue;

    try {
      await creditPmqPoints(
        svc,
        String(row.parrain_id),
        PARRAINAGE_PARRAIN_PTS,
        "Bonus parrainage — parrain",
      );
      result.activated += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push(message);
    }
  }

  const { data: expiredRows, error: expireError } = await svc
    .from("parrainages")
    .update({ statut: "expire" })
    .eq("statut", "pending")
    .lte("created_at", expireCutoff)
    .select("id");

  if (expireError) {
    result.errors.push(expireError.message);
  } else {
    result.expired = expiredRows?.length ?? 0;
  }

  return result;
}
