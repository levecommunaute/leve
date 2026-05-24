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
