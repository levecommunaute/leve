export const PRESET_AVATARS = [
  "🎵",
  "🎨",
  "🌟",
  "🏆",
  "🎯",
  "🔥",
  "💎",
  "🌍",
  "🎭",
  "🚀",
  "🎪",
  "🎲",
] as const;

export type PresetAvatar = (typeof PRESET_AVATARS)[number];
export type AvatarMode = "initiales" | "avatar" | "photo";

export function avatarInitials(displayName: string): string {
  const cleaned = displayName.trim().replace(/\s+/g, "");
  return (cleaned.slice(0, 2) || "ME").toUpperCase();
}

/** Couleur de fond stable dérivée du nom affiché. */
export function colorFromName(name: string): string {
  const s = name.trim() || "Membre";
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 42% 28%)`;
}

export function isPresetAvatar(value: string | null | undefined): value is PresetAvatar {
  return (
    typeof value === "string" &&
    (PRESET_AVATARS as readonly string[]).includes(value)
  );
}

export function isPhotoAvatar(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function resolveAvatarMode(
  avatarUrl: string | null | undefined,
): AvatarMode {
  if (!avatarUrl || !avatarUrl.trim()) return "initiales";
  if (isPresetAvatar(avatarUrl.trim())) return "avatar";
  if (isPhotoAvatar(avatarUrl)) return "photo";
  // Emoji hors liste encore traité comme avatar
  if (!avatarUrl.includes("/") && [...avatarUrl].length <= 4) return "avatar";
  return "photo";
}
