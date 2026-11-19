import type { Profile } from "@/lib/domain/profile-options";

/* Small text helpers shared by the rule-based plan sections. */

/**
 * Finds a clock time such as "5pm", "5:30 pm" or "17:00" in the family's note,
 * so their own plan can be moved to cleaner air even without the AI.
 */
export function timeInNotes(notes: string): string | null {
  const twelveHour = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(notes);
  if (twelveHour) {
    const [, hourText = "", minutes = "00", meridiem = ""] = twelveHour;
    const hour = (Number(hourText) % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${minutes}`;
  }
  const twentyFour = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(notes);
  return twentyFour ? twentyFour[0] : null;
}

/** Lower-cases a label for mid-sentence use, keeping acronyms such as "CNG". */
export function inSentence(label: string): string {
  return label.replace(/^([A-Z])(?![A-Z])/, (first) => first.toLowerCase());
}

/** "the purifier" or the DIY alternative, so homes without one are not told to run it. */
export function filterName(profile: Profile): string {
  return profile.home.hasPurifier ? "the purifier" : "a box-fan filter";
}

/** The swap's target mode name as used in matching text, e.g. "metro" for "Metro / train". */
export function swapKeyword(label: string): string {
  const [first = label] = label.split(" / ");
  return first.toLowerCase();
}
