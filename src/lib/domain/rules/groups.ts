import { PLAN_LIMITS, type Plan } from "../plan";
import type { HouseholdRisk, SensitiveGroupId } from "../risk";

/* Advice for each sensitive group in the home. */

/** Group-specific advice; a mask line is added when the air calls for one. */
const GROUP_ADVICE: Record<SensitiveGroupId, string> = {
  children: "Swap outdoor play for indoor games during peak hours; children breathe more air per kg than adults.",
  seniors: "Move morning walks to the cleanest window or indoors, and keep blood pressure and heart medicines handy.",
  asthma: "Keep the reliever inhaler close and follow the asthma action plan; avoid hard exercise outside today.",
  copd: "Stay in the cleanest room as much as possible and use prescribed inhalers as your doctor advised.",
  heart_disease: "Avoid exertion outdoors; chest pain or unusual breathlessness needs a doctor straight away.",
  pregnancy: "Limit time near traffic and smoke; rest in the cleanest room and keep antenatal check-ups.",
  allergies: "Keep windows shut at peak hours, rinse your nose and eyes after being outside, and wash bedding often.",
};

function adviceFor(id: SensitiveGroupId, maskAdvised: boolean): string {
  const mask = id === "children" ? " Outside, use a child-size N95." : " Outside, wear a snug N95.";
  return GROUP_ADVICE[id] + (maskAdvised ? mask : "");
}

/** One entry per sensitive group in the home. */
export function buildGroupAdvice(risk: HouseholdRisk): Plan["groupAdvice"] {
  return risk.sensitiveGroups
    .map((group) => ({ group: group.label, advice: adviceFor(group.id, risk.maskAdvised) }))
    .slice(0, PLAN_LIMITS.groupAdviceMax);
}
