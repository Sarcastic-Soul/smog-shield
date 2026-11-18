import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, profileSchema } from "@/lib/domain/profile";
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

  it.each(["New Delhi", "São Paulo", "दिल्ली", "St. John's", "Stratford-upon-Avon"])("accepts city %j", (city) => {
    expect(parse({ city }).success).toBe(true);
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
