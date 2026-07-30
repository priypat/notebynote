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

export async function getLyrics(trackName, artistName) {
  const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });

  // Never throws. LRCLIB is a free, unauthenticated, best-effort service and
  // it fails in ways a plain `!res.ok` check misses: when it 504s or rate
  // limits, the response carries no CORS headers, so the browser rejects the
  // fetch outright rather than handing back a non-ok Response. The original
  // code let that rejection escape into an unhandled promise rejection —
  // which is the "Failed to load resource / not allowed by
  // Access-Control-Allow-Origin, 504" you see in the console. Lyrics are a
  // nice-to-have, so a failure here resolves to null and the UI says so.
  let res;
  try {
    res = await fetch(`https://lrclib.net/api/get?${params}`);
  } catch {
    return null; // network/CORS/rate-limit — treat exactly like "no match"
  }

  if (!res.ok) return null; // 404 = genuinely no match for this track

  try {
    const data = await res.json();
    return {
      plain: data.plainLyrics || null,
      synced: data.syncedLyrics || null, // LRC format: [mm:ss.xx]line text
    };
  } catch {
    return null; // malformed body
  }
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
