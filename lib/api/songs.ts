import type { Song } from "@/lib/types";
import { MOCK_SONGS } from "@/lib/mock";
import { ApiError, USE_MOCKS, delay, http } from "./client";

/**
 * GET /api/songs
 *
 * The whole catalogue, ordered gentle → reaching. Small and fully cacheable —
 * songs change on a release cadence, not a user cadence.
 */
export async function getSongs(): Promise<Song[]> {
  if (!USE_MOCKS) return http<Song[]>("GET", "/api/songs");
  await delay();
  return MOCK_SONGS;
}

/**
 * GET /api/songs/:id
 *
 * Throws ApiError 404 `song_not_found` for an unknown id — which happens for
 * real when someone opens a bookmarked song that has since been withdrawn.
 */
export async function getSong(id: string): Promise<Song> {
  if (!USE_MOCKS) return http<Song>("GET", `/api/songs/${encodeURIComponent(id)}`);
  await delay();
  const song = MOCK_SONGS.find((s) => s.id === id);
  if (!song) {
    throw new ApiError(404, "song_not_found", `No song with id "${id}".`);
  }
  return song;
}
