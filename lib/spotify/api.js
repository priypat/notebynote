// lib/spotifyApi.js
// Thin wrappers around the Spotify Web API + LRCLIB (lyrics) endpoints
// that are still available after the Feb 2026 Dev Mode changes.

const API_BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return null; // no content, e.g. successful play/pause
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API error (${res.status}): ${body}`);
  }
  return res.json();
}

/** Search for tracks. Note: max `limit` is 10 as of Feb 2026 (was 50). */
export async function searchTracks(query, token, limit = 10) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(Math.min(limit, 10)) });
  const data = await spotifyFetch(`/search?${params}`, token);
  return data.tracks.items;
}

/** Get full metadata for a single track. */
export async function getTrack(trackId, token) {
  return spotifyFetch(`/tracks/${trackId}`, token);
}

/** Get full metadata for a single artist (bio-adjacent info: genres, images). */
export async function getArtist(artistId, token) {
  return spotifyFetch(`/artists/${artistId}`, token);
}

/**
 * The current user. `product` is the field that matters here: the Web
 * Playback SDK refuses to stream on anything but `"premium"`, and it fails
 * by silently pausing rather than by erroring, so checking this up front is
 * the difference between a clear message and a mystery.
 */
export async function getMe(token) {
  return spotifyFetch("/me", token);
}

/**
 * Hand playback to a specific device. The SDK registers a device but does
 * not make it active; without this, a play call can be accepted and then
 * immediately dropped because the user's "current" device is still their
 * phone or desktop app.
 */
export async function transferPlayback(deviceId, token, play = false) {
  return spotifyFetch("/me/player", token, {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}

/** Start/resume playback of a track on a given device. */
export async function playTrack(trackUri, deviceId, token) {
  return spotifyFetch(`/me/player/play?device_id=${deviceId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export async function pausePlayback(deviceId, token) {
  return spotifyFetch(`/me/player/pause?device_id=${deviceId}`, token, { method: 'PUT' });
}

export async function getCurrentlyPlaying(token) {
  return spotifyFetch('/me/player/currently-playing', token);
}

// --- Lyrics via LRCLIB (free, no auth, includes synced/timestamped lyrics) ---

/**
 * LRCLIB is free, unauthenticated, and genuinely flaky — this project's own
 * testing has hit both 504s and 429s from it. A previous version of this
 * function collapsed "this song has no lyrics" and "the service hiccuped"
 * into the same `null`, which is the bug behind "lyrics don't load on the
 * first try but do on a retry": a transient failure looked identical to a
 * real no-match, and only got fixed by chance on a second attempt. Fixed by
 * telling the two apart and retrying automatically on the failure kind that
 * a retry can actually help.
 *
 * @returns {{ status: 'ok', plain: string|null, synced: string|null }
 *         | { status: 'not_found' }   -- a genuine no-match; retrying won't help
 *         | { status: 'error' }}      -- network/CORS/5xx/429; transient
 */
async function getLyricsOnce(trackName, artistName) {
  const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });

  let res;
  try {
    res = await fetch(`https://lrclib.net/api/get?${params}`);
  } catch {
    // A 5xx/429 from LRCLIB carries no CORS header, so the browser rejects
    // the fetch outright instead of handing back a non-ok Response — this
    // catch is where that lands, not just genuine offline/DNS failures.
    return { status: 'error' };
  }

  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) return { status: 'error' }; // 429, 5xx, etc — worth a retry

  try {
    const data = await res.json();
    return {
      status: 'ok',
      plain: data.plainLyrics || null,
      synced: data.syncedLyrics || null, // LRC format: [mm:ss.xx]line text
    };
  } catch {
    return { status: 'error' }; // malformed body — also transient in practice
  }
}

/** Never throws. Retries transient failures twice with a short backoff
 *  before giving up; a genuine 404 returns immediately since retrying a real
 *  no-match just wastes time. */
export async function getLyrics(trackName, artistName, attempts = 3) {
  let result = { status: 'error' };
  for (let i = 0; i < attempts; i++) {
    result = await getLyricsOnce(trackName, artistName);
    if (result.status !== 'error') return result;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return result; // still 'error' after every attempt — caller shows "try again"
}

/** Parses LRC-format synced lyrics into [{ time: seconds, text: string }]. */
export function parseSyncedLyrics(lrc) {
  if (!lrc) return [];
  return lrc
    .split('\n')
    .map((line) => {
      const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
      if (!match) return null;
      const [, min, sec, text] = match;
      return { time: parseInt(min, 10) * 60 + parseFloat(sec), text: text.trim() };
    })
    .filter(Boolean);
}
