import type { Profile, ProfilePatch } from "@/lib/types";
import { MOCK_PROFILE } from "@/lib/mock";
import {
  ApiError,
  STORAGE_KEYS,
  USE_MOCKS,
  delay,
  http,
  readStore,
  writeStore,
} from "./client";

/**
 * GET /api/profile
 *
 * Always the signed-in person — there is no `getProfile(id)`, and there should
 * not be. Nobody in this product looks at anybody else's breath data.
 */
export async function getProfile(): Promise<Profile> {
  if (!USE_MOCKS) return http<Profile>("GET", "/api/profile");
  await delay();
  return readStore<Profile>(STORAGE_KEYS.profile) ?? MOCK_PROFILE;
}

/**
 * PATCH /api/profile
 *
 * Partial update. Only name, theme, and baselineMptSec are writable; everything
 * else on Profile is server-owned.
 */
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  if (!USE_MOCKS) return http<Profile>("PATCH", "/api/profile", patch);

  await delay(300, 700);

  if (patch.name !== undefined && patch.name.trim().length === 0) {
    throw new ApiError(422, "invalid_name", "A name can't be empty.");
  }
  // 45s is well past the healthy adult ceiling — a value above it is a bug or a
  // stuck timer, not a person, and letting it through would wreck every scale
  // on the progress screen.
  if (
    patch.baselineMptSec !== undefined &&
    (patch.baselineMptSec <= 0 || patch.baselineMptSec > 45)
  ) {
    throw new ApiError(
      422,
      "invalid_baseline",
      "baselineMptSec must be between 0 and 45 seconds.",
    );
  }

  const current = readStore<Profile>(STORAGE_KEYS.profile) ?? MOCK_PROFILE;
  const now = new Date().toISOString();

  const next: Profile = {
    ...current,
    ...patch,
    // Re-measuring the baseline restamps when it was measured. The progress
    // screen uses this to know whether it is comparing against a fresh number.
    baselineMptMeasuredAt:
      patch.baselineMptSec !== undefined
        ? now
        : current.baselineMptMeasuredAt,
    updatedAt: now,
  };

  writeStore(STORAGE_KEYS.profile, next);
  return next;
}
