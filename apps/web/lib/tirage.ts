import { createHash } from "crypto";
import type { RankBonusResult } from "./rang-config";

/** Bonus rang fixe pour le tirage trimestriel (multiplicateur pondéré). */
export const TIRAGE_BONUS_RANG: Record<RankBonusResult["rankTier"], number> = {
  bronze: 1.0,
  argent: 1.15,
  or: 1.35,
  diamant: 1.6,
};

export type TirageWeightedEntry = {
  membre_id: string;
  weight: number;
};

export function bonusRangForTier(tier: RankBonusResult["rankTier"]): number {
  return TIRAGE_BONUS_RANG[tier];
}

export function computeTicketWeight(
  multiplicateurMembre: number,
  bonusRang: number,
): number {
  const mult = Number.isFinite(multiplicateurMembre) && multiplicateurMembre > 0
    ? multiplicateurMembre
    : 1;
  const bonus = Number.isFinite(bonusRang) && bonusRang > 0 ? bonusRang : 1;
  return mult * bonus;
}

/** seed = SHA256(timestamp_iso + "_" + total_tickets) */
export function generateTirageSeed(timestampIso: string, totalTickets: number): string {
  return createHash("sha256")
    .update(`${timestampIso}_${totalTickets}`)
    .digest("hex");
}

/** Convertit le hash SHA256 en valeur [0, 1) pour sélection déterministe. */
export function seedToUnitInterval(seedHex: string): number {
  const slice = seedHex.slice(0, 13);
  const n = Number.parseInt(slice, 16);
  const max = Math.pow(16, slice.length);
  return n / max;
}

/** Sélection pondérée via tableau cumulatif et seed SHA256. */
export function pickWeightedWinner(
  entries: TirageWeightedEntry[],
  seedHex: string,
): TirageWeightedEntry {
  if (entries.length === 0) {
    throw new Error("Aucun ticket pour le tirage");
  }

  const cumulative: number[] = [];
  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
    cumulative.push(totalWeight);
  }

  if (totalWeight <= 0) {
    throw new Error("Poids total nul");
  }

  const target = seedToUnitInterval(seedHex) * totalWeight;
  for (let i = 0; i < cumulative.length; i += 1) {
    const entry = entries[i];
    const threshold = cumulative[i];
    if (!entry || threshold === undefined) continue;
    if (target < threshold) {
      return entry;
    }
  }

  const last = entries[entries.length - 1];
  if (!last) {
    throw new Error("Aucun ticket pour le tirage");
  }
  return last;
}
