// lib/spotifyAuth.js
// Handles the Authorization Code with PKCE flow — no client secret needed,
// safe to run entirely in the browser.

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/callback';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

// --- PKCE helpers ---

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// --- Public API ---

/** Kick off login — redirects the browser to Spotify's consent screen. */
export async function redirectToSpotifyAuth() {
  const verifier = await generateCodeVerifier();
  sessionStorage.setItem('spotify_verifier', verifier);

  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Call this from your /callback page with the `code` query param. */
export async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('spotify_verifier');
  if (!verifier) throw new Error('Missing PKCE verifier — did the user land on /callback directly?');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }

  const data = await res.json();
  storeTokens(data);
  return data;
}

/** Use the refresh token to get a new access token without a full re-login. */
export async function refreshAccessToken() {
  const refreshToken = sessionStorage.getItem('spotify_refresh_token');
  if (!refreshToken) throw new Error('No refresh token available');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const data = await res.json();
  storeTokens(data);
  return data;
}

function storeTokens({ access_token, refresh_token, expires_in }) {
  sessionStorage.setItem('spotify_access_token', access_token);
  sessionStorage.setItem('spotify_token_expires_at', String(Date.now() + expires_in * 1000));
  if (refresh_token) sessionStorage.setItem('spotify_refresh_token', refresh_token);
}

export function getStoredAccessToken() {
  return sessionStorage.getItem('spotify_access_token');
}

export function isTokenExpired() {
  const expiresAt = sessionStorage.getItem('spotify_token_expires_at');
  if (!expiresAt) return true;
  return Date.now() > Number(expiresAt) - 60_000; // refresh 1 min early
}

export function logout() {
  sessionStorage.removeItem('spotify_access_token');
  sessionStorage.removeItem('spotify_refresh_token');
  sessionStorage.removeItem('spotify_token_expires_at');
  sessionStorage.removeItem('spotify_verifier');
}
