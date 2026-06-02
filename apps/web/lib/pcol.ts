/** Répartition PCOL sur quiz vidéo collaborateur (points bruts avant multiplicateur membre). */
export const PCOL_MEMBER_SHARE = 0.8;
export const PCOL_COLLAB_IMMEDIATE_SHARE = 0.12;
export const PCOL_COLLAB_PENDING_SHARE = 0.08;
export const PCOL_COLLAB_TOTAL_SHARE = 0.2;

export type PcolQuizSplit = {
  ptsMembresGagnes: number;
  ptsMembresNets: number;
  ptsCollabImmediate: number;
  ptsPending: number;
  ptsCollabTotal: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitPcolQuizPoints(pointsEarned: number): PcolQuizSplit {
  const ptsMembresGagnes = pointsEarned;
  const ptsMembresNets = round2(pointsEarned * PCOL_MEMBER_SHARE);
  const ptsPending = round2(pointsEarned * PCOL_COLLAB_PENDING_SHARE);
  const ptsCollabImmediate = round2(pointsEarned * PCOL_COLLAB_IMMEDIATE_SHARE);
  const ptsCollabTotal = round2(ptsCollabImmediate + ptsPending);
  return {
    ptsMembresGagnes,
    ptsMembresNets,
    ptsCollabImmediate,
    ptsPending,
    ptsCollabTotal,
  };
}

export function currentMonthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isCollaborateurMemberType(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  const lower = raw.trim().toLowerCase();
  return lower === "collaborateur" || raw.trim() === "Collaborateur";
}

/** Pourcentage PCOL fixé après quiz de récupération par le collaborateur (erreurs = total − bonnes). */
export function pourcentageFixeFromErrors(errors: number): number {
  if (errors <= 1) return 20;
  if (errors === 2) return 18;
  if (errors === 4) return 15;
  if (errors >= 5) return 12;
  return 18;
}

export type PcolEffectiveShares = {
  totalShare: number;
  immediateShare: number;
  pendingShare: number;
};

/** Répartition effective (12 % / 8 % du total collaborateur) selon pourcentage fixé ou 20 % par défaut. */
export function pcolEffectiveShares(pourcentageFixe: number | null | undefined): PcolEffectiveShares {
  const totalPct = pourcentageFixe != null && Number.isFinite(pourcentageFixe)
    ? pourcentageFixe / 100
    : PCOL_COLLAB_TOTAL_SHARE;
  const ratio = totalPct / PCOL_COLLAB_TOTAL_SHARE;
  return {
    totalShare: totalPct,
    immediateShare: PCOL_COLLAB_IMMEDIATE_SHARE * ratio,
    pendingShare: PCOL_COLLAB_PENDING_SHARE * ratio,
  };
}
