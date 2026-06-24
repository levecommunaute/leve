import { getServiceSupabase } from "./admin-server";
import { currentMonthKey } from "./pcol";

/** Valeur nominale d'un jeton PTC en dollars CAD. */
export const PTC_UNIT_DOLLARS = 5;

export const PTC_SOURCES = ["quiz_perdu", "pending_expire", "collab_perdu"] as const;

export type PtcSource = (typeof PTC_SOURCES)[number];

export type PtcSourcesTotals = Record<PtcSource, number>;

export function dollarsToPtcUnits(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round((dollars / PTC_UNIT_DOLLARS) * 100) / 100;
}

export function roundPtcMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function crediterPtc(params: {
  montant: number;
  source: PtcSource;
  description: string;
  mois?: string;
}): Promise<void> {
  const montant = roundPtcMoney(params.montant);
  if (!Number.isFinite(montant) || montant <= 0) return;

  const svc = getServiceSupabase();
  const mois = params.mois ?? currentMonthKey();
  const description = params.description.trim();
  if (!description) throw new Error("description PTC requise");

  const { data: bank, error: fetchErr } = await svc
    .from("banque_leve")
    .select("id, ptc_balance")
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!bank?.id) throw new Error("banque_leve introuvable");

  const { error: updateErr } = await svc
    .from("banque_leve")
    .update({
      ptc_balance: roundPtcMoney(Number(bank.ptc_balance ?? 0) + montant),
    })
    .eq("id", bank.id);

  if (updateErr) throw new Error(updateErr.message);

  const { error: mvtErr } = await svc.from("ptc_mouvements").insert({
    mois,
    source: params.source,
    montant,
    description,
  });

  if (mvtErr) throw new Error(mvtErr.message);
}

export async function getPtcBalance(): Promise<number> {
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("banque_leve")
    .select("ptc_balance")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return roundPtcMoney(Number(data?.ptc_balance ?? 0));
}

export async function getPtcSourcesTotals(): Promise<PtcSourcesTotals> {
  const svc = getServiceSupabase();
  const totals: PtcSourcesTotals = {
    quiz_perdu: 0,
    pending_expire: 0,
    collab_perdu: 0,
  };

  for (const source of PTC_SOURCES) {
    const { data, error } = await svc
      .from("ptc_mouvements")
      .select("montant")
      .eq("source", source);

    if (error) throw new Error(error.message);

    totals[source] = roundPtcMoney(
      (data ?? []).reduce((sum, row) => sum + Number(row.montant ?? 0), 0),
    );
  }

  return totals;
}

export async function getCollaborateurPtcMensuel(
  _collaborateurId: string,
  mois: string,
): Promise<{ pts: number; dollars: number; ptcUnits: number }> {
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("ptc_mouvements")
    .select("montant")
    .eq("mois", mois)
    .in("source", ["collab_perdu", "pending_expire"]);

  if (error) throw new Error(error.message);

  const dollars = roundPtcMoney(
    (data ?? []).reduce((sum, row) => sum + Number(row.montant ?? 0), 0),
  );

  return {
    pts: dollars,
    dollars,
    ptcUnits: dollarsToPtcUnits(dollars),
  };
}
