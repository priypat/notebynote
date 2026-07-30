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
  const res = await fetch(`https://lrclib.net/api/get?${params}`);
  if (!res.ok) return null; // no match found — handle gracefully in UI
  const data = await res.json();
  return {
    plain: data.plainLyrics || null,
    synced: data.syncedLyrics || null, // LRC format: [mm:ss.xx]line text
  };
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
