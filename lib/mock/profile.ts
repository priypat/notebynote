import type { Profile } from "@/lib/types";

/**
 * The demo profile.
 *
 * baselineMptSec of 11.4 is the anchor for everything else in the fixture:
 * healthy adults typically sustain 20–30 seconds, so this is someone with a
 * real but workable limitation. It is why the seeded history tops out around
 * five seconds per hold and why "Down in the Valley" is the starting song.
 *
 * Measured 2026-07-07, the day before the first take.
 */
export const MOCK_PROFILE: Profile = {
  id: "profile-me",
  name: "Ada",
  baselineMptSec: 11.4,
  createdAt: "2026-07-07T18:22:00.000Z",
  theme: "auto",
  baselineMptMeasuredAt: "2026-07-07T18:26:00.000Z",
  updatedAt: "2026-07-07T18:26:00.000Z",
};
