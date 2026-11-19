import type { Profile } from "../domain/profile-options";

/*
 * Remembers the household in localStorage between visits. Storage can be
 * blocked (private mode) or hold an old shape, so every read is validated and
 * every failure falls back to "nothing saved".
 */

const STORAGE_KEY = "smog-shield:profile";

/** The zod schema is loaded on demand so the validation library stays out of the first page load. */
export const loadSchema = () => import("../domain/profile").then((m) => m.profileSchema);

export async function loadSavedProfile(): Promise<Profile | null> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = (await loadSchema()).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be blocked (private mode); the app works without it.
  }
}

export type Validated = { ok: true; profile: Profile } | { ok: false; message: string };

/** Checks the form against the shared schema and returns the first problem in plain words. */
export async function validateProfile(profile: Profile): Promise<Validated> {
  const parsed = (await loadSchema()).safeParse(profile);
  if (parsed.success) return { ok: true, profile: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
}
