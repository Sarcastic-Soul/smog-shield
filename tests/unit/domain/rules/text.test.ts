import { describe, expect, it } from "vitest";
import { filterName, inSentence, swapKeyword, timeInNotes } from "@/lib/domain/rules/text";
import { makeProfile } from "../../../fixtures/profiles";

describe("timeInNotes", () => {
  it.each([
    ["football at 5pm", "17:00"],
    ["football at 5:30 pm", "17:30"],
    ["run at 6 AM", "06:00"],
    ["lunch 12pm", "12:00"],
    ["midnight 12 am", "00:00"],
    ["match at 17:00", "17:00"],
    ["meet 07:45 sharp", "07:45"],
  ])("finds the time in %j", (notes, expected) => {
    expect(timeInNotes(notes)).toBe(expected);
  });

  it.each(["no time here", "", "25:00", "13pm and 99:99", "room 5"])("returns null for %j", (notes) => {
    expect(timeInNotes(notes)).toBeNull();
  });
});

describe("inSentence", () => {
  it("lower-cases the first letter", () => {
    expect(inSentence("Bus")).toBe("bus");
    expect(inSentence("Metro / train")).toBe("metro / train");
    expect(inSentence("Petrol car")).toBe("petrol car");
  });

  it("keeps acronyms and already-lower text", () => {
    expect(inSentence("CNG car")).toBe("CNG car");
    expect(inSentence("bus")).toBe("bus");
    expect(inSentence("")).toBe("");
  });
});

describe("swapKeyword", () => {
  it("lower-cases the part before ' / '", () => {
    expect(swapKeyword("Metro / train")).toBe("metro");
    expect(swapKeyword("Bus")).toBe("bus");
    expect(swapKeyword("Work from home")).toBe("work from home");
  });
});

describe("filterName", () => {
  it("names the purifier when the home has one", () => {
    const profile = makeProfile();
    expect(filterName({ ...profile, home: { ...profile.home, hasPurifier: true } })).toBe("the purifier");
  });

  it("suggests a box-fan filter when it does not", () => {
    const profile = makeProfile();
    expect(filterName({ ...profile, home: { ...profile.home, hasPurifier: false } })).toBe("a box-fan filter");
  });
});
