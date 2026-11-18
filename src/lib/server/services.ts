import "server-only";
import { generatePlan } from "../ai/gemini";
import { getAirReport } from "./air-service";
import { createPlanService } from "./plan-service";
import { createRateLimiter } from "./rate-limit";

/** Shared app wiring, so both routes use one cache and one set of limits. */
export const planService = createPlanService({ getAirReport, generatePlan });

export const planLimiter = createRateLimiter(10, 60_000);
export const askLimiter = createRateLimiter(20, 60_000);
