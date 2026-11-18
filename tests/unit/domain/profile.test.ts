import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  LANGUAGE_LABELS,
  LANGUAGES,
  profileSchema,
  RTL_LANGUAGES,
  type Profile,
} from "@/lib/domain/profile";
import { makeProfile } from "../../fixtures/profiles";

const parse = (patch: Record<string, unknown>) => profileSchema.safeParse({ ...makeProfile(), ...patch });

describe("profileSchema", () => {
  it("accepts the default profile", () => {
    expect(profileSchema.safeParse(DEFAULT_PROFILE).success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    expect(parse({ admin: true }).success).toBe(false);
  });

  it.each(["<script>alert(1)</script>", "Delhi; DROP TABLE", "City123", "a/b"])("rejects city %j", (city) => {
    expect(parse({ city }).success).toBe(false);
  });

  it.each(["New Delhi", "São Paulo", "St. John's", "Stratford-upon-Avon"])("accepts city %j", (city) => {
    expect(parse({ city }).success).toBe(true);
  });

  it("rejects non-Latin city names with an English-letters message", () => {
    const result = parse({ city: "दिल्ली" });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe("Use English letters for the city name");
  });

  it("trims the city and enforces length 2 to 80", () => {
    const ok = parse({ city: "  Pune  " });
    expect(ok.success && ok.data.city).toBe("Pune");
    expect(parse({ city: "A" }).success).toBe(false);
    expect(parse({ city: "a".repeat(81) }).success).toBe(false);
    expect(parse({ city: "a".repeat(80) }).success).toBe(true);
  });

  it("requires at least one adult and at most 12 people per group", () => {
    const household = (patch: object) => ({ ...makeProfile().household, ...patch });
    expect(parse({ household: household({ adults: 0 }) }).success).toBe(false);
    expect(parse({ household: household({ adults: 13 }) }).success).toBe(false);
    expect(parse({ household: household({ children: -1 }) }).success).toBe(false);
    expect(parse({ household: household({ seniors: 1.5 }) }).success).toBe(false);
  });

  it("rejects unknown conditions", () => {
    const household = { ...makeProfile().household, conditions: ["flu"] };
    expect(parse({ household }).success).toBe(false);
  });

  it("bounds the commute", () => {
    const commute = (patch: object) => ({ ...makeProfile().commute, ...patch });
    expect(parse({ commute: commute({ distanceKm: 150 }) }).success).toBe(true);
    expect(parse({ commute: commute({ distanceKm: 151 }) }).success).toBe(false);
    expect(parse({ commute: commute({ distanceKm: -1 }) }).success).toBe(false);
    expect(parse({ commute: commute({ daysPerWeek: 8 }) }).success).toBe(false);
    expect(parse({ commute: commute({ mode: "teleport" }) }).success).toBe(false);
  });

  it("bounds outdoor exercise minutes to 0-240", () => {
    const home = (m: number) => ({ ...makeProfile().home, outdoorExerciseMinutes: m });
    expect(parse({ home: home(240) }).success).toBe(true);
    expect(parse({ home: home(241) }).success).toBe(false);
    expect(parse({ home: home(-5) }).success).toBe(false);
  });

  it("limits notes to 280 characters", () => {
    expect(parse({ notes: "x".repeat(280) }).success).toBe(true);
    expect(parse({ notes: "x".repeat(281) }).success).toBe(false);
  });

  it("defaults notes to an empty string", () => {
    const { notes: _notes, ...rest } = makeProfile();
    void _notes;
    const result = profileSchema.safeParse(rest);
    expect(result.success && result.data.notes).toBe("");
  });

  it("rejects an unknown budget", () => {
    expect(parse({ budget: "unlimited" }).success).toBe(false);
  });
});

describe("language and new home fields", () => {
  it("accepts each supported language and rejects others", () => {
    for (const language of LANGUAGES) expect(parse({ language }).success).toBe(true);
    expect(parse({ language: "fr" }).success).toBe(false);
  });

  it("requires a language", () => {
    const rest: Partial<Profile> = makeProfile();
    delete rest.language;
    expect(profileSchema.safeParse(rest).success).toBe(false);
  });

  it("has a native and an English label for every language", () => {
    expect(Object.keys(LANGUAGE_LABELS)).toEqual([...LANGUAGES]);
    expect(LANGUAGE_LABELS.hi).toEqual({ native: "हिन्दी", english: "Hindi" });
  });

  it("marks only Urdu as right to left", () => {
    expect([...RTL_LANGUAGES]).toEqual(["ur"]);
  });

  it("requires boolean smoker and waste-burning flags", () => {
    const home = makeProfile().home;
    expect(parse({ home: { ...home, smokerAtHome: true, wasteBurningNearby: true } }).success).toBe(true);
    expect(parse({ home: { ...home, smokerAtHome: "yes" } }).success).toBe(false);
    const noSmoker: Partial<Profile["home"]> = { ...home };
    delete noSmoker.smokerAtHome;
    expect(parse({ home: noSmoker }).success).toBe(false);
  });

  it("defaults to English with no smoker and no burning", () => {
    expect(DEFAULT_PROFILE.language).toBe("en");
    expect(DEFAULT_PROFILE.home.smokerAtHome).toBe(false);
    expect(DEFAULT_PROFILE.home.wasteBurningNearby).toBe(false);
  });
});
