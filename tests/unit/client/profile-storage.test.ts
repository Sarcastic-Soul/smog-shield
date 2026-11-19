import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSavedProfile, saveProfile, validateProfile } from "@/lib/client/profile-storage";
import { makeProfile } from "../../fixtures/profiles";

const KEY = "smog-shield:profile";
let store: Map<string, string>;

function stubStorage(overrides: Partial<Storage> = {}) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      ...overrides,
    },
  });
}

beforeEach(() => {
  store = new Map();
  stubStorage();
});
afterEach(() => vi.unstubAllGlobals());

describe("saveProfile and loadSavedProfile", () => {
  it("round-trips a profile", async () => {
    const profile = makeProfile({ city: "Pune" });
    saveProfile(profile);
    await expect(loadSavedProfile()).resolves.toEqual(profile);
  });

  it("stores the profile as JSON under the app key", () => {
    saveProfile(makeProfile());
    expect(JSON.parse(store.get(KEY)!)).toEqual(makeProfile());
  });

  it("returns null when nothing is saved", async () => {
    await expect(loadSavedProfile()).resolves.toBeNull();
  });

  it("returns null for text that is not JSON", async () => {
    store.set(KEY, "{nope");
    await expect(loadSavedProfile()).resolves.toBeNull();
  });

  it("returns null for a saved shape that no longer validates", async () => {
    store.set(KEY, JSON.stringify({ city: 42 }));
    await expect(loadSavedProfile()).resolves.toBeNull();
  });

  it("returns null when reading storage throws", async () => {
    stubStorage({
      getItem: () => {
        throw new Error("blocked");
      },
    });
    await expect(loadSavedProfile()).resolves.toBeNull();
  });

  it("does not throw when writing storage is blocked", () => {
    stubStorage({
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => saveProfile(makeProfile())).not.toThrow();
  });
});

describe("validateProfile", () => {
  it("returns the checked profile when it is valid", async () => {
    await expect(validateProfile(makeProfile())).resolves.toEqual({ ok: true, profile: makeProfile() });
  });

  it("returns the first problem in plain words when it is not", async () => {
    const result = await validateProfile(makeProfile({ city: "<b>" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});
