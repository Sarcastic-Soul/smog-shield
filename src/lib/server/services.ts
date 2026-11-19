import "server-only";
import { assistantFromEnv } from "../ai/gemini";
import { geocodeCity } from "../air/geocode";
import { fetchAirReport } from "../air/open-meteo";
import { createAirService } from "./air-service";
import { createPlanService } from "./plan-service";
import { createRateLimiter } from "./rate-limit";

/**
 * The one place where the app is wired together. Everything below is built
 * from factories, so tests can build the same pieces with fakes.
 */

/** Gemini, or null when no API key is set (the app then runs on rules alone). */
export const assistant = assistantFromEnv();

const airService = createAirService({ geocode: geocodeCity, fetchReport: fetchAirReport });

export const planService = createPlanService({
  getAirReport: airService.getAirReport,
  generatePlan: async (prompt) => (assistant ? assistant.generatePlan(prompt) : null),
});

/** Per-IP limits: 10 plans and 20 questions a minute. */
export const planLimiter = createRateLimiter(10, 60_000);
export const askLimiter = createRateLimiter(20, 60_000);
