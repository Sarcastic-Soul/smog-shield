import type { CommuteSwap } from "../emissions";
import { PLAN_LIMITS, type Plan } from "../plan";
import { COMMUTE_LABELS, type Profile } from "../profile-options";
import { commuteSwapItem } from "./swaps";
import { swapKeyword } from "./text";

/** Adds `extra` items not already covered until `primary` has `min` items. */
function topUp<T>(primary: T[], extra: T[], min: number, max: number, isCovered: (item: T) => boolean): T[] {
  const added = extra.filter((item) => !isCovered(item)).slice(0, Math.max(0, min - primary.length));
  return [...primary, ...added].slice(0, max);
}

export interface ReconcileContext {
  profile: Profile;
  /** The household's commute swaps, best first. */
  swaps: readonly CommuteSwap[];
}

/**
 * Fills gaps in a Gemini plan with rule-based items so every plan meets the
 * same minimum: three indoor fixes, each of the top three commute swaps, and
 * two community actions. Gemini's own wording always comes first. Only used for
 * English plans, so languages are never mixed.
 */
export function reconcilePlan(ai: Plan, fallback: Plan, { profile, swaps }: ReconcileContext): Plan {
  const aiSwapText = ai.alternatives.map((a) => `${a.swap} ${a.action}`.toLowerCase()).join(" | ");
  // A commute swap is covered when Gemini already mentions its target mode.
  const missingSwaps = swaps
    .slice(0, PLAN_LIMITS.commuteSwapsShown)
    .filter((swap) => !aiSwapText.includes(swapKeyword(COMMUTE_LABELS[swap.to])))
    .map((swap) => commuteSwapItem(profile, swap));

  const titles = new Set(ai.indoorHacks.map((h) => h.title.toLowerCase()));
  const groups = new Set(ai.communityActions.map((c) => c.who.toLowerCase()));
  return {
    ...ai,
    indoorHacks: topUp(
      ai.indoorHacks,
      fallback.indoorHacks,
      PLAN_LIMITS.indoorHacksTarget,
      PLAN_LIMITS.indoorHacksMax,
      (h) => titles.has(h.title.toLowerCase()),
    ),
    alternatives: [...ai.alternatives, ...missingSwaps].slice(0, PLAN_LIMITS.alternativesMax),
    communityActions: topUp(
      ai.communityActions,
      fallback.communityActions,
      PLAN_LIMITS.communityActionsTarget,
      PLAN_LIMITS.communityActionsMax,
      (c) => groups.has(c.who.toLowerCase()),
    ),
  };
}
