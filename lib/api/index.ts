/**
 * The only place in this app that may call `fetch`.
 *
 * Components import typed functions from here and never a URL. Each function
 * documents the HTTP method and route a real backend must implement; the full
 * handoff spec is API_CONTRACT.md at the repo root.
 *
 * Set NEXT_PUBLIC_USE_MOCKS=false to switch every function from the fixtures in
 * lib/mock/ to live HTTP. Nothing above this layer changes.
 */

export { getSongs, getSong } from "./songs";
export { getTakes, getTake, createTake } from "./takes";
export { getProfile, updateProfile } from "./profile";
export { ApiError, USE_MOCKS } from "./client";
