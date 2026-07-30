import { NextResponse } from "next/server";

/**
 * GET /api/spotify/token — hands the browser a fresh Spotify access token
 * without any login step.
 *
 * Why this exists: the Web Playback SDK will only stream with a *user*
 * access token carrying the `streaming` scope. There is no app-level or
 * client-credentials token that can play audio — that flow has no user
 * attached, so it can only reach public metadata (search, track info).
 * A demo therefore can't skip authorization entirely; it can only skip
 * doing it *at demo time*.
 *
 * So: authorize once by hand (see /spotify/connect), keep the resulting
 * refresh token, and exchange it for a short-lived access token on every
 * page load. Spotify refresh tokens don't expire on a timer — they last
 * until revoked or the password changes — so one setup lasts indefinitely.
 *
 * The refresh token is read from SPOTIFY_REFRESH_TOKEN, deliberately WITHOUT
 * a NEXT_PUBLIC_ prefix, so Next keeps it server-side and it never reaches
 * the browser bundle. Only the short-lived access token crosses the wire.
 *
 * SECURITY, and this matters: anyone who can reach this route gets a token
 * that can control the linked Spotify account — read the profile, and start
 * and stop playback. On localhost that's fine. Deployed publicly it is not,
 * which is why production requires SPOTIFY_DEMO_MODE=true to be set
 * deliberately rather than defaulting on.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.SPOTIFY_DEMO_MODE !== "true") {
    return NextResponse.json(
      {
        error: "disabled_in_production",
        message:
          "Set SPOTIFY_DEMO_MODE=true to enable the no-login demo token in a production build. Understand that it exposes account control to anyone who can reach this URL.",
      },
      { status: 403 },
    );
  }

  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !refreshToken) {
    // Deliberately 200, not an error status. "Setup hasn't been run yet" is a
    // normal state the UI handles by showing the login button — returning 4xx
    // /5xx here would print a red line in the console on every single load of
    // an unconfigured app, which is just noise to debug past later.
    return NextResponse.json(
      {
        configured: false,
        message:
          "No SPOTIFY_REFRESH_TOKEN in the environment. Visit /spotify/connect once to generate one.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let res: Response;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "unreachable", message: "Couldn't reach Spotify's token endpoint." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      {
        error: "refresh_failed",
        // Most likely cause by far: the stored refresh token was revoked, or
        // belongs to a different client_id than the one configured.
        message:
          "Spotify rejected the stored refresh token. Re-run /spotify/connect to mint a new one.",
        detail,
      },
      { status: 502 },
    );
  }

  const data = await res.json();

  return NextResponse.json(
    { access_token: data.access_token, expires_in: data.expires_in },
    { headers: { "Cache-Control": "no-store" } },
  );
}
