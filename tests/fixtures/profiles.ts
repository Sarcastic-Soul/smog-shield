import { DEFAULT_PROFILE, type Profile } from "@/lib/domain/profile";

/** Fresh copy so one test cannot change another's input. */
export function makeProfile(patch: Partial<Profile> = {}): Profile {
  return structuredClone({ ...DEFAULT_PROFILE, ...patch });
}

/** Adult-only home with no health conditions. */
export function healthyProfile(patch: Partial<Profile> = {}): Profile {
  return makeProfile({
    household: { adults: 2, children: 0, seniors: 0, conditions: [] },
    ...patch,
  });
}
