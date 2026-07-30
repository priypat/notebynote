# Handoff

For a team picking this up cold. Read `README.md` first to get it running,
then this for what's actually real, what's a shortcut, and what to build
next. `API_CONTRACT.md` is the authoritative wire spec for the backend —
this document is the map of *this codebase's* state, not the contract itself.

---

## 1. What's real vs. mocked

**Real, and stays real once a backend exists — nothing here changes:**

- The entire UI: home, sing, results, progress, welcome/onboarding, the
  sigil generator, the ridge visualization, demo mode.
- `lib/scoring/breathScore.ts` — a pure function, zero imports, already the
  actual algorithm. Port it to the backend verbatim; don't reimplement it.
- `lib/audio/breathEngine.ts` and the five fixtures — real audio analysis,
  real voicing/hysteresis logic. A fixture and a live mic produce
  byte-identical-shaped `BreathFrame`s through the same `FrameBuilder`.
- The client-side branch in every `lib/api/*` function
  (`if (!USE_MOCKS) return http(...)`) — already correctly wired to real
  HTTP. Flipping `NEXT_PUBLIC_USE_MOCKS=false` is the entire migration on
  this side.

**Mocked — this is what a backend replaces:**

- `lib/mock/songs.ts`, `lib/mock/takes.ts`, `lib/mock/profile.ts` — hand-authored
  fixture data, read directly by `lib/api/*` while `USE_MOCKS` is true.
- All writes persist to `localStorage` (`lib/api/client.ts`'s `readStore`/
  `writeStore`), not a real database. No encryption, no multi-device sync,
  no real user accounts — it's one browser's local state.
- `createTake()`'s id scheme (`take-local-${count}-${epoch}`) is not a real
  id generator — see §5.
- There is no auth. `lib/api/client.ts`'s `http()` sends
  `credentials: "include"` as a placeholder for a scheme that hasn't been
  decided (API_CONTRACT.md §8).

---

## 2. What to build next, in order

### First: the real endpoints (API_CONTRACT.md)

Implement the 7 routes in `API_CONTRACT.md` — exact request/response shapes,
error codes, and the trust split on `POST /api/takes` (client sends
measurements, server computes `breathScore`/`longestHoldSec`/
`isPersonalRecord`/`sigilSeed`).

- **Touch:** the backend service (routes + `lib/scoring/breathScore.ts`
  ported server-side, verbatim), then `NEXT_PUBLIC_API_BASE` and
  `NEXT_PUBLIC_USE_MOCKS=false` in env config.
- **Do not touch:** `lib/api/*.ts` (the branching and the real-HTTP path
  already exist and are already correct), any component under `app/**`
  (they only ever call `lib/api/*`, never a URL — see §4's audit), or
  `lib/mock/*` (leave it — it's what local dev and demo mode run against
  even after a real backend exists).

### Second: real persistence

A real, encrypted-at-rest database behind those endpoints (API_CONTRACT.md
§7 — takes and `baselineMptSec` especially).

- **Touch:** the backend's schema/migrations.
- **Do not touch:** `lib/api/client.ts`'s `readStore`/`writeStore`/
  `STORAGE_KEYS`. Once `USE_MOCKS=false` this code simply goes unused —
  it isn't something to delete or migrate, and deleting it would break
  local dev and demo mode, which stay useful indefinitely.

### Third: auth

Nothing is decided yet (API_CONTRACT.md §8). Once it is:

- **Touch:** `lib/api/client.ts`'s `http()` function — the one place that
  builds the request and currently hardcodes `credentials: "include"`.
- **Do not touch:** the individual functions in `lib/api/songs.ts`,
  `takes.ts`, `profile.ts` — they all delegate to `http()` and never touch
  headers themselves.

### Fourth: everything else, roughly by how much it costs users today

Two items that used to be here are done — noted for the record rather than
silently dropped:

- ~~`/welcome` isn't a first-launch gate~~ — fixed. `app/page.tsx` now
  redirects to `/welcome` when `profile.baselineMptMeasuredAt === null`.
- ~~"stopped-early" takes are never actually recorded~~ — fixed.
  `app/sing/[songId]/SingScreen.tsx`'s exit handler now saves whatever
  phrases were completed as a `"stopped-early"` take before leaving,
  unless nothing was sung yet (in which case it just leaves — nothing to
  save).

Still open:

1. **The mock layer can't produce a genuinely empty history.**
   `lib/api/takes.ts`'s `allTakesNewestFirst()` unconditionally merges
   `MOCK_TAKES` with whatever's in `localStorage` — so `getTakes()` can
   never return `[]`, and the pre-baseline empty states on `app/page.tsx`
   and `app/progress/ProgressScreen.tsx` are implemented and correct but
   unreachable in this build. Touch: `allTakesNewestFirst()` — gate the
   seeded merge somehow (a flag, or move seeding to a one-time
   `localStorage` write instead of an unconditional code merge). Do not
   touch: the empty-state JSX in either screen.
2. **`app/dev/audio/AudioProbe.tsx` has a real hydration mismatch**, line
   126 (`const support = micSupport();` called directly in render — differs
   between server and client because `micSupport()` checks
   `typeof window`). Dev-only, 404s in production, but it's the one
   console error anyone poking around will actually see. Fix the same way
   `Ridge.tsx`/`Sigil.tsx` fixed their own hydration issues (§5) — gate
   behind a mounted flag or move into `useEffect`.
3. The rest, all flagged in `API_CONTRACT.md` §8 and not re-litigated here:
   real audio hosting for backing tracks, pagination past a year of daily
   use, a re-scoring plan if the formula changes, local-time (not UTC)
   day/month grouping, and account/data deletion routes.

---

## 3. `// TODO(api):` inventory

Grepped fresh for this handoff (`grep -rn "TODO(api)"`):

| File:Line | Note |
|---|---|
| `lib/types.ts:118` | `Song.audioUrl` — needs a signed, range-request-capable URL once backing tracks exist. |
| `lib/mock/songs.ts:48,76,107` | All three songs' `audioUrl: null` — same gap, one per song. |
| `lib/api/client.ts:20` | `API_BASE` needs to point at the real service. |
| `lib/api/client.ts:67` | `http()`'s auth header/cookie handling — placeholder until a scheme is chosen (see §2, Third). |
| `lib/api/client.ts:128` | `writeStore`'s swallowed quota-error case should surface once takes persist server-side instead of silently failing local writes. |

One more that **was** here and is now resolved, noted for the record:
`lib/mock/takes.ts` used to carry `TODO(api): breathScore is hand-set here...`
predating `lib/scoring/breathScore.ts`. That function now exists and is
wired into `lib/api/takes.ts`'s `createTake()` for real sessions, but the
nine seeded takes' `breathScore` values were never recomputed against it —
they'd drifted by 1-3 points each (verified: `scoreTake()` against
`MOCK_PROFILE` was re-run for all nine and the fixture updated to the exact
computed values; `scripts/check-fixtures.ts` still passes with the same
score sequence, off-day, and personal-record invariants). If you touch the
scoring formula, **this fixture will drift again and nothing will warn
you** — there's no test tying `lib/mock/takes.ts`'s hand-typed numbers to
`scoreTake()`'s actual output.

---

## 4. Architecture boundary audit

Verified fresh for this handoff:

- **No component imports `AudioContext`.** `grep -rln "AudioContext"` outside
  `lib/audio/` returns nothing — `lib/audio/breathEngine.ts` is the only hit,
  which is correct.
- **No component calls `fetch(` directly.** Same check against `lib/api/` —
  `lib/api/client.ts` is the only hit.

No violations found on either front — nothing to fix there.

**A related violation *was* found and fixed in this pass, same spirit as the
audit above:** `app/dev/audio/AudioProbe.tsx`'s page 404s in production
(`if (process.env.NODE_ENV === "production") notFound();`), but
`/dev/tokens` and `/dev/sigils` — both added after that pattern was
established — didn't have the same guard and were reachable (`200`) in a
real production build. Confirmed via `npm run build && npm run start`, then
fixed by adding the identical guard to both. Verify this again if you add
another `/dev/*` page — it's an opt-in pattern per page, not something the
`/dev/` path enforces structurally.

---

## 5. Known fragile spots, hardcoded values, and shortcuts

Blunt, on purpose:

- **`createTake()`'s id scheme** (`lib/api/takes.ts`) is
  `` `take-local-${history.length + 1}-${Date.parse(draft.startedAt)}` ``.
  This is fine for one browser's local demo data and nothing else — it's
  not collision-safe under concurrent writes (two tabs, or a future
  multi-device sync) and a real backend must generate real ids. Also: this
  id used to be built from a raw ISO timestamp (with colons) and that
  caused a real bug — a freshly created take 404'd on its own results page
  because Next's client-side route-param extraction percent-encoded the
  colon and never decoded it back. Fixed by dropping colons from the id
  entirely (epoch milliseconds instead). Lesson worth keeping: don't put
  raw ISO timestamps in URL path segments.
- **`Ridge.tsx` and `Sigil.tsx` render nothing on the server or on the
  client's first paint** — both gate their actual SVG paths behind a
  `mounted` flag that only flips true after `useEffect`. This is
  intentional, not a bug: both use `Math.sin`/`Math.cos` for organic
  jitter, and the spec doesn't guarantee those are bit-identical across JS
  engines (only `+ - * / sqrt` are). Node/V8 on the server and a
  non-V8 browser can disagree by a fraction, which cascades through the
  path math into a real (if invisible) hydration mismatch. If you ever see
  a one-frame flash of missing terrain or an empty sigil on first load,
  that's this, working as intended — don't "fix" it by removing the gate.
- **The Breath Score formula is a deliberately simple heuristic**, not a
  validated respiratory metric: `50 * (longestHoldSec / baselineMptSec,
  capped at 1) + 50 * meanSteadiness`. It was chosen because it's
  explainable in one sentence, and it happens to land within ~1-3 points of
  every hand-authored seeded score, which is a coincidence of careful
  fixture authorship, not evidence the formula is "right." Treat it as a
  UX device.
- **The sigil generator's "pitch jitter" parameter is actually
  `meanSteadiness`** (`lib/sigil/generate.ts`), which mixes pitch- and
  amplitude-jitter — `PhraseResult` has no separately tracked pitch-only
  signal, and adding one is a real schema change (update `API_CONTRACT.md`
  in the same edit if you do it). Documented in the file; flagging here so
  it doesn't read as an oversight.
- **`lib/demo/seed.ts`'s month math is approximate** — `monthsAgoIso()`
  subtracts `n * 30` days, not real calendar months, so the seeded demo
  history's month boundaries can land a few days off from where "3 months
  ago" would land on a calendar. Fine for a demo backdrop; don't rely on it
  for anything date-precise.
- **Demo mode's guaranteed personal record is structural, not
  hardcoded-lucky**: the last phrase always replays `steady-12s`
  (~11-12s), which is comfortably longer than anything else seeded or
  real today. If someone later seeds or genuinely sings a longer hold than
  that, the demo's "record" framing stops being guaranteed. Not a live risk,
  but the invariant is worth knowing rather than rediscovering on stage.
- **The keyboard rescue (`f` during a live take) is code-reviewed, not
  battle-tested.** Its no-op case (pressing it while already on a fixture)
  was verified live. The actual "mic dies mid-song, press f, keep singing
  on a fixture" path has not been run against a real microphone failure —
  headless test environments can't reliably simulate a real permission
  prompt (in this repo's own testing across different runs, `getUserMedia()`
  has both hung indefinitely and rejected with `NotSupportedError`
  depending on the sandbox's audio device state, neither of which is the
  `NotAllowedError` a real denial throws). **Test this for real, on a real
  device, before trusting it on an actual stage.**
- **Mic denial during a real (non-demo) sing session no longer offers a
  fixture fallback, on purpose.** It used to (`handleUseFixtureInstead`),
  but that meant a denied-mic session would score and save a fabricated
  performance indistinguishable from a real one — a real integrity problem
  once a person could see it mixed into their genuine history. Removed;
  denial now just explains what happened and links home. The real fix this
  displaces — a genuinely accessible non-mic way to participate — is a
  product decision, not a quick patch; see §6.
- **No automated test coverage outside `lib/scoring/breathScore.test.ts`
  (17 Vitest cases).** The audio engine, the mock/demo data layers, every
  screen's state machine, and demo mode itself are all verified only by
  manual and headless-browser walkthroughs done during development — there
  is no regression safety net for any of it.
- **`app/dev/audio/AudioProbe.tsx`'s hydration mismatch predates every
  prompt in this project's history** — it was already there in the initial
  scaffold commit. Flagged in §2 (Fourth, item 2) rather than fixed, since
  it's a dev-only page unrelated to whatever's actually being worked on
  when this is read.

---

## 6. Product gaps — functionality, flow, ease of use

A gap analysis done partway through this project, then acted on. What
follows is genuinely current: items marked done were built in the same
pass as this analysis; everything else is still open, roughly in the order
it costs real users something.

### Built in this pass

- **Settings** (`app/settings/`, S6 in `API_CONTRACT.md`) — name, a real
  theme picker (auto/dawn/dusk, applied immediately via
  `lib/applyTheme.ts` and persisted through `updateProfile`), and
  "re-measure your baseline" (`/welcome?step=calibrate`, which now skips
  straight past the three intro screens for a returning person).
- **Theme is no longer stuck.** `app/ThemeSync.tsx`, mounted once in the
  root layout, applies the persisted `profile.theme` on every fresh page
  load — previously nothing outside the dev-only token specimen ever
  touched `document.documentElement.dataset.theme` for a real user.
  Verified: setting Dusk in Settings, then a fresh navigation to home,
  carries the theme across correctly.
- **A real bottom nav** (`components/BottomNav.tsx`) — Today / Hills / You,
  replacing the scatter of one-off links home and progress used to rely on.
  Sing, results, and welcome stay nav-free on purpose — they're focused,
  single-task flows, not hub screens.
- **A closed loop after finishing a song.** The results screen now offers
  "Sing this again" (same song) as the primary action, not just "back home."
- **Home shows which song produced the last score.** The last-session card
  used to show a score and a sentence with no indication of which song —
  now it's headed with the song's title.
- **`/welcome` is a real first-launch gate.** `app/page.tsx` redirects to
  it when `profile.baselineMptMeasuredAt === null`, verified by code path
  (not visible against the seeded demo profile, which already has one).
- **"stopped-early" takes are real now**, not just a type that exists —
  see §2, Fourth.
- **The denied-mic integrity issue is fixed** — see §5's note on the
  removed fixture fallback.

### Still missing

Roughly ordered by how much it costs a real user, not by build effort:

1. **No backing track.** Every song is sung completely unaccompanied —
   `Song.audioUrl` is `null` everywhere (§3). This is arguably the single
   biggest remaining gap between "sing-along app" as described and what's
   actually here: there's no melody or rhythm reference at all right now.
   Needs real audio assets and hosting, not something buildable in this
   pass.
2. **No accessible alternative to the microphone.** Removing the
   denied-mic fixture fallback (§5) fixed an integrity problem but
   reopened a real one: someone who can't or won't grant mic access has no
   way to participate at all today. A genuine fix — a distinctly-labeled
   practice mode that's never mixed into real history, or a text/rhythm-based
   alternative — is a product decision, not a quick patch.
3. **No song preview or browse/filter/search.** Tapping a song goes
   straight to "Begin singing" with no way to read all its lyrics or
   compare difficulty first. There are also only three songs and no way to
   filter what exists — both are content-authoring work (more songs, more
   metadata), not purely engineering.
4. **No pause/resume mid-session** — only forward progress, or exit
   (which now at least saves what was sung, per §2).
5. **No first-time explanation of the sing screen itself.** `/welcome`
   explains the app conceptually, but nothing in `app/sing/[songId]/`
   explains what the ridge is or what "settle" means in the moment someone
   first sees it — it's only discoverable by having gone through onboarding
   first, which nothing enforces beyond the gate in item "Built in this
   pass" above.
6. **No sharing beyond the local PNG export.** `ResultsScreen`'s "Save this
   seal" downloads a file; there's no share-sheet integration, and no way
   to share a take or a streak-free progress summary at all.
7. **No installability/PWA manifest.** The layout sets `appleWebApp`
   metadata but there's no `manifest.json` — "add to home screen" isn't a
   real flow yet.
