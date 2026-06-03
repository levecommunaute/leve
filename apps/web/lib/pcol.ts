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

export function splitPcolQuizPoints(pointsEarned: number): PcolQuizSplit {
  const ptsMembresGagnes = pointsEarned;
  const ptsMembresNets = pointsEarned * PCOL_MEMBER_SHARE;
  const ptsPending = pointsEarned * PCOL_COLLAB_PENDING_SHARE;
  const ptsCollabImmediate = pointsEarned * PCOL_COLLAB_IMMEDIATE_SHARE;
  const ptsCollabTotal = ptsCollabImmediate + ptsPending;
  return {
    ptsMembresGagnes,
    ptsMembresNets,
    ptsCollabImmediate,
    ptsPending,
    ptsCollabTotal,
  };
}

/** Répartition PCOL sur points pondérés (pts_bruts × multiplicateur). */
export function splitPcolQuizPointsPonderes(ptsPonderes: number): PcolQuizSplit {
  return {
    ptsMembresGagnes: ptsPonderes,
    ptsMembresNets: ptsPonderes * PCOL_MEMBER_SHARE,
    ptsCollabImmediate: ptsPonderes * PCOL_COLLAB_IMMEDIATE_SHARE,
    ptsPending: ptsPonderes * PCOL_COLLAB_PENDING_SHARE,
    ptsCollabTotal: ptsPonderes * PCOL_COLLAB_TOTAL_SHARE,
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

/** Part du pending (8 %) récupérable selon le nombre d'erreurs au quiz de récupération. */
export function pctRecupereFromErrors(errors: number): number {
  if (errors <= 1) return PCOL_COLLAB_PENDING_SHARE;
  if (errors === 2) return 0.06;
  if (errors === 4) return 0.03;
  if (errors >= 5) return 0;
  return 0.06;
}

/** Pourcentage PCOL fixé : 12 % + part pending récupérée (× 100). */
export function pourcentageFixeFromPctRecupere(pctRecupere: number): number {
  return 12 + pctRecupere * 100;
}

/** @deprecated Utiliser pourcentageFixeFromPctRecupere(pctRecupereFromErrors(errors)). */
export function pourcentageFixeFromErrors(errors: number): number {
  return pourcentageFixeFromPctRecupere(pctRecupereFromErrors(errors));
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
