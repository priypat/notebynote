# Lung Tunes — API contract

**Audience: a backend developer who has never seen the app.** This describes
every endpoint the client needs, what it sends, what it expects back, and which
screen breaks if it's wrong.

The client already works. It runs against fixtures in `lib/mock/` with writes
going to `localStorage`, behind `NEXT_PUBLIC_USE_MOCKS=true`. Every function in
`lib/api/*` already branches to real HTTP when that flag is `false` — so when
these six routes exist and behave as described, the migration is one env var.
`lib/types.ts` is the authoritative type definitions; this document is the wire
format and the reasoning.

---

## 1. What the app does

Someone with a lung condition — asthma, COPD, long-COVID recovery — opens the
app and sings along to a traditional song. Each line of the song ends on a
sustained note. The app listens through the microphone (**audio only; there is
no camera and never will be**) and measures two things about each sustain: how
long they held it, and how even the breath was. Those become a **Breath Score**,
and they draw a topographic ridge — a landscape generated from their actual
breath, where a steady note makes smooth rolling crests and a ragged one makes
broken ones.

Two consequences for you:

- **The same take must always draw the same landscape.** A ridge is a record of
  a specific morning. If a stored take renders differently next week, the
  product's central promise breaks. This is why `sigilSeed` is persisted rather
  than generated at render time.
- **This is health-adjacent data about a vulnerable population.** See §7.

### Screens

| Screen | Reads | Writes |
|---|---|---|
| **S1 Onboarding** — measures the person's baseline breath hold | `getProfile` | `updateProfile` |
| **S2 Home** — song list, ordered easiest first | `getSongs`, `getTakes` | — |
| **S3 Sing** — lyrics, live ridge, one song end to end | `getSong` | `createTake` |
| **S4 Summary** — the take just finished, its ridge and score | `getTake` | — |
| **S5 Progress** — history, trend, personal records | `getTakes` | — |
| **S6 Settings** — name, theme, re-measure baseline | `getProfile` | `updateProfile` |

---

## 2. Conventions

**Transport.** JSON over HTTPS. `Content-Type: application/json` on requests
with a body. Same-origin by default; `NEXT_PUBLIC_API_BASE` can point elsewhere,
in which case you need CORS with `Access-Control-Allow-Credentials: true`.

**Timestamps.** ISO 8601, always UTC, always with milliseconds:
`2026-07-29T08:14:03.000Z`. The client sorts takes by comparing these as
strings, so the format must not vary.

**Units.** Every duration is **seconds as a float** — never milliseconds, never
a formatted string. Field names ending `Sec` are seconds. Anything documented as
`0..1` is a normalized fraction, not a percentage.

**Auth.** Not yet specified — see §8. Every route below is scoped to the signed-in
person. `GET /api/profile` returns *the caller*; there is deliberately no
`GET /api/profile/:id`, because nobody in this product looks at anybody else's
breath data. Unauthenticated requests return `401 unauthenticated`.

**Errors.** Every non-2xx response returns this body:

```json
{
  "code": "song_not_found",
  "message": "No song with id \"song-xyz\".",
  "fields": { "baselineMptSec": "must be between 0 and 45" }
}
```

`code` is a stable machine-readable string — **the client branches on `code`,
never on `message`.** Don't rename codes without telling the frontend. `message`
is developer-facing; the UI writes its own copy, because server strings aren't
written in this product's voice. `fields` is optional, only for validation
failures, keyed by field path.

These apply to every route and are not repeated below:

| Status | `code` | When |
|---|---|---|
| 401 | `unauthenticated` | Missing or expired session |
| 429 | `rate_limited` | Include a `Retry-After` header |
| 500 | `internal` | Anything unexpected |

The client treats status `0` (network unreachable), `429`, and `5xx` as
retryable and offers a "try again" affordance. Everything else it treats as
final. Return the right status accordingly.

---

## 3. Songs

Songs are editorial content on a release cadence, not user data. All three
current songs are traditional or public domain, and `attribution` carries that
provenance — it is displayed, so it must be accurate.

A **phrase** is one singable line ending in a sustained note. `startSec` /
`endSec` / `holdStartSec` are offsets from the start of the backing track, and
they are what the sing screen scrolls the lyrics against, so they must be
frame-accurate against whatever audio you serve.

### `GET /api/songs`

The whole catalogue, ordered `gentle` → `steady` → `reaching`. Currently three
songs; assume tens, not thousands — no pagination.

**Response `200`** — `Song[]`:

```json
[
  {
    "id": "song-down-in-the-valley",
    "title": "Down in the Valley",
    "artist": "Traditional",
    "durationSec": 48,
    "longestHoldSec": 4.5,
    "key": "G major",
    "motifSeed": 6201831,
    "difficulty": "gentle",
    "attribution": "Traditional American folk song. Public domain.",
    "audioUrl": null,
    "phrases": [
      {
        "id": "p1",
        "lyric": "Down in the valley, valley so low",
        "startSec": 2.0,
        "endSec": 11.0,
        "targetHoldSec": 4.0,
        "holdStartSec": 7.0
      }
    ]
  }
]
```

| Field | Notes |
|---|---|
| `difficulty` | `"gentle" \| "steady" \| "reaching"`. Editorial, effort-based wording. Never surface "hard" or "advanced" — this audience reads that as a verdict on them. |
| `longestHoldSec` | Denormalized max of `phrases[].targetHoldSec`. The client asserts these agree. |
| `motifSeed` | Unsigned 32-bit. Seeds the song's baseline terrain so its ridges share a family resemblance. Stable forever per song — **changing it silently rewrites the look of every past take of that song.** |
| `audioUrl` | Currently `null`; the demo sings unaccompanied. See §8. |
| `phrases[].holdStartSec` | Where the sustain begins. Usually `endSec - targetHoldSec`, but authored separately because some lines have a tail after the sustain. Must satisfy `startSec ≤ holdStartSec < endSec`. |

**Caching.** Freely cacheable — `Cache-Control: public, max-age=3600` plus an
`ETag` is right. This is the one route with no per-user content.

**Errors.** Nothing route-specific.

**Screens.** S2 Home. An empty array renders an empty state rather than an
error, but there is no reason for it to ever be empty.

### `GET /api/songs/:id`

One song, same object as above.

**Errors.** `404 song_not_found` — a real case, not just a typo: someone opens a
bookmarked or deep-linked song that has since been withdrawn. S3 handles it by
returning to the song list, so don't return `200` with a null body.

**Screens.** S3 Sing.

---

## 4. Takes

A **take** is one attempt at one song. It holds a `PhraseResult` per line
actually sung — so a take stopped partway has fewer results than the song has
phrases, and `completion` says which happened.

`phrases` is **a leading run of the song's phrases**, in order. Someone can stop
after line three; they cannot skip line two and sing line three. Reject anything
else with `422 phrase_sequence_invalid`.

### The trust split — please read this one

`TakeDraft` (what the client sends) deliberately excludes `breathScore`,
`longestHoldSec`, `isPersonalRecord`, and `sigilSeed`. **You compute all four
server-side and return them.** Two reasons, both load-bearing:

1. A client-sent score can be forged. This product has no leaderboards and
   nothing to win, so the stakes are low — but the score is the hero metric and
   it should mean what it says.
2. The scoring algorithm will change. When it does, you need to re-score the
   whole history so old takes stay comparable with new ones. That's only
   possible if the raw measurements are what's stored and the score is derived.

**Store `phrases` as sent, permanently.** Everything else is derivable.

The scoring function lives at `lib/scoring/breathScore.ts` — a pure function
with zero imports, specifically so it can be lifted into your service unchanged
rather than reimplemented. Port that file; don't rewrite it. `lib/api/takes.ts`
already calls its `scoreTake()` for `breathScore`, `longestHoldSec`,
`isPersonalRecord`, and `sigilSeed` — there is no placeholder left on the
client side to match; your service should call the same function with the
same inputs (the take's `phrases`, the caller's `Profile`, and the longest
`heldSec` across every one of the caller's prior takes) and get the same
answer.

### `POST /api/takes`

**Request** — `TakeDraft`:

```json
{
  "songId": "song-shenandoah",
  "startedAt": "2026-07-29T08:16:00.000Z",
  "endedAt": "2026-07-29T08:19:32.000Z",
  "completion": "finished",
  "phrases": [
    {
      "phraseId": "p1",
      "heldSec": 4.7,
      "steadiness": 0.77,
      "decaySlope": -0.05,
      "recoverySec": 3.6,
      "envelope": [0.0, 0.31, 0.62, 0.79, 0.81, 0.78]
    }
  ]
}
```

| Field | Notes |
|---|---|
| `heldSec` | How long the note was actually sustained. `0` means attempted and nothing came out — a real and unremarkable outcome. Must be `≥ 0`. |
| `steadiness` | `0..1`, how even the breath was. `1` is glass-smooth. **This drives the ridge silhouette**, so it is the single most visually load-bearing number in the payload. Store full precision. |
| `decaySlope` | Rate of loudness fade, normalized amplitude per second. Normally negative; `~0` means fully supported. A positive value means the take got louder throughout, which is possible but rare — don't reject it, but it's worth a metric. |
| `recoverySec` | Seconds from the end of the hold until breath was ready again. Must be `> 0`. |
| `envelope` | Optional. Breath amplitude over the hold, downsampled to **10 Hz**, each value `0..1`. This is what lets a take redraw its exact ridge later instead of an approximation. A 9-second hold is ~90 floats; a six-phrase take is ~500. Store it. |

**Response `201`** — the complete `Take`, with a `Location` header:

```json
{
  "id": "take-0009",
  "songId": "song-shenandoah",
  "startedAt": "2026-07-29T08:16:00.000Z",
  "endedAt": "2026-07-29T08:19:32.000Z",
  "completion": "finished",
  "phrases": [ "…as sent, envelopes included…" ],
  "breathScore": 58,
  "longestHoldSec": 5.1,
  "isPersonalRecord": true,
  "sigilSeed": 13099652
}
```

| Field | How to compute |
|---|---|
| `breathScore` | Integer `0..100`. From `lib/scoring/breathScore.ts`. |
| `longestHoldSec` | `max(phrases[].heldSec)`. |
| `isPersonalRecord` | `longestHoldSec` strictly greater than the max over **all** the caller's prior takes, across every song. The person's first ever take is a record. Compare against stored takes, not against a cached best, or a deleted take will resurrect a stale record. |
| `sigilSeed` | Unsigned 32-bit, derived deterministically from the take's own contents and then **immutable**. `scoreTake()` in `lib/scoring/breathScore.ts` derives it (FNV-1a over the rounded `breathScore` and each phrase's `phraseId:heldSec:steadiness`) — port that function and you get the same value for free. The server's value is authoritative regardless; what matters is that it never changes for a given take. |

**Idempotency.** `startedAt` is unique per person in practice, and a double-tap
or a retry after a timeout will resend the same draft. Treat
`(userId, startedAt)` as a natural key and return the existing take rather than
creating a duplicate — otherwise a flaky connection puts phantom sessions in
someone's history.

**Errors.**

| Status | `code` | When |
|---|---|---|
| 422 | `empty_take` | `phrases` is empty |
| 422 | `unknown_song` | `songId` doesn't exist |
| 422 | `unknown_phrase` | A `phraseId` isn't in that song |
| 422 | `phrase_sequence_invalid` | Results aren't a leading run of the song's phrases, in order |
| 422 | `invalid_timestamps` | `endedAt ≤ startedAt`, or either is unparseable |

**Failure matters here more than elsewhere.** This fires the moment someone
finishes singing — the one point where they have done work that can be lost.
The client keeps the take in memory and shows the summary regardless, so a
failed write must never blank the screen. If you can accept-and-queue rather
than reject, do.

**Screens.** S3 Sing writes it; S4 Summary renders the response directly.

### `GET /api/takes?limit=n`

History, **newest first**, sorted by `startedAt` descending.

| Param | Notes |
|---|---|
| `limit` | Optional. Default `20`, maximum `100`. Clamp rather than error on a larger value. |

**Response `200`** — `Take[]`.

**Omit `envelope` from every phrase result in this response.** The progress
screen needs scores and hold lengths, not waveforms. Including them makes a
200-take history several megabytes on a phone that may be on cellular. This is
the one place the response is deliberately a lossy subset of what's stored.

**Errors.** Nothing route-specific. An empty array is the correct response for a
new account, and S5 renders a first-run state for it.

**Screens.** S5 Progress (the trend and the record list), S2 Home (the most
recent take, for "pick up where you left off").

### `GET /api/takes/:id`

One take, **envelopes included** — full fidelity, because this is what redraws
the actual ridge.

**Errors.** `404 take_not_found`. Return `404`, not `403`, for a take belonging
to someone else — don't confirm that an id exists.

**Screens.** S4 Summary.

---

## 5. Profile

One row per person. `baselineMptSec` is their **maximum phonation time**: the
longest they can sustain a single tone, measured during onboarding. It scales
the Breath Score and picks their starting song.

It is never displayed as a clinical figure, and the app makes no diagnostic
claim about it. Treat it as a calibration constant, not a medical record — but
store it with the care described in §7 anyway.

Expect `baselineMptSec` to be roughly 8–15 for this audience; healthy adults sit
at 20–30.

### `GET /api/profile`

The caller's profile.

**Response `200`** — `Profile`:

```json
{
  "id": "profile-me",
  "name": "Ada",
  "baselineMptSec": 11.4,
  "createdAt": "2026-07-07T18:22:00.000Z",
  "theme": "auto",
  "baselineMptMeasuredAt": "2026-07-07T18:26:00.000Z",
  "updatedAt": "2026-07-07T18:26:00.000Z"
}
```

| Field | Notes |
|---|---|
| `name` | Free text, non-empty. A display name only; assume it's a first name and don't validate structure. |
| `theme` | `"auto" \| "dawn" \| "dusk"`. `auto` follows the device. **These exact strings** — the client writes the value straight onto an HTML attribute that the stylesheet matches, so a renamed value fails silently rather than loudly. |
| `baselineMptMeasuredAt` | When `baselineMptSec` was last actually measured, or `null` if estimated. The progress screen uses it to know whether it's comparing against a fresh number; settings uses it to offer "measure again". |
| `updatedAt` | Bump on every write. |

**Errors.** Nothing route-specific. A signed-in person always has a profile —
create one at signup, don't `404`.

**Screens.** S1 Onboarding, S6 Settings, and the root layout, which reads
`theme` before first paint.

### `PATCH /api/profile`

Partial update. **Only `name`, `theme`, and `baselineMptSec` are writable.**
Everything else on `Profile` is server-owned; reject attempts to set them with
`422 field_not_writable` rather than ignoring them silently.

**Request** — any subset:

```json
{ "theme": "dusk", "baselineMptSec": 12.1 }
```

**Response `200`** — the complete updated `Profile`, not just the changed
fields. The client replaces its cached object wholesale.

**When `baselineMptSec` is present, set `baselineMptMeasuredAt` to now.** A new
baseline value means a new measurement; that's the only way it can change.

**Errors.**

| Status | `code` | When |
|---|---|---|
| 422 | `invalid_name` | Empty or whitespace-only |
| 422 | `invalid_baseline` | Not in `(0, 45]`. A value above 45 is a stuck timer, not a person, and it would wreck every scale on the progress screen |
| 422 | `invalid_theme` | Not one of the three literals |
| 422 | `field_not_writable` | A server-owned field was sent |

**Screens.** S1 Onboarding (writes the first baseline), S6 Settings.

---

## 6. Summary table

| Client function | Method | Route | Screens |
|---|---|---|---|
| `getSongs()` | GET | `/api/songs` | S2 |
| `getSong(id)` | GET | `/api/songs/:id` | S3 |
| `createTake(draft)` | POST | `/api/takes` | S3 → S4 |
| `getTakes({limit})` | GET | `/api/takes?limit=n` | S2, S5 |
| `getTake(id)` | GET | `/api/takes/:id` | S4 |
| `getProfile()` | GET | `/api/profile` | S1, S6, layout |
| `updateProfile(patch)` | PATCH | `/api/profile` | S1, S6 |

---

## 7. Handling this data

Breath measurements from people who told us they have a lung condition are
health-adjacent, even though the app makes no diagnostic claim. Please treat
them accordingly:

- **Encrypt at rest.** Takes and `baselineMptSec` especially.
- **No third-party analytics on take payloads.** Not to a warehouse, not to a
  session-replay tool, not in logs. Aggregate counts are fine; per-phrase
  measurements are not.
- **Don't log request bodies** for `POST /api/takes` or `PATCH /api/profile`.
- **Deletion has to actually delete**, including from backups on a stated
  schedule. See §8 — the endpoints don't exist yet and they need to.
- **No audio ever leaves the device.** The client sends derived numbers only —
  `heldSec`, `steadiness`, `decaySlope`, and a 10 Hz amplitude envelope. There is
  no route that accepts a recording and there should never be one. If a future
  feature seems to need raw audio, that's a conversation, not a ticket.

---

## 8. Not specified yet

Known gaps. Don't invent answers to these — they need a decision first.

1. **Auth.** No scheme chosen. The client sends `credentials: "include"`,
   assuming cookie sessions, but that's a placeholder.
2. **Account and data deletion.** `DELETE /api/takes/:id` and a full account
   deletion route. Both are needed before launch — one for "I'd rather not keep
   that session", one because it's the law in most places we'd ship.
3. **Audio hosting.** `audioUrl` is `null` throughout. Backing tracks need a
   URL that supports range requests and seeking, and phrase timings must be
   frame-accurate against whatever file you serve. If timings and audio can
   drift, they need to ship versioned together.
4. **Pagination.** `getTakes` takes a `limit` and no cursor. Fine for a year of
   daily practice; add a cursor before it isn't.
5. **Re-scoring.** When `breathScore` changes, old takes need recomputing. Needs
   a plan and probably a stored `scoreVersion` on each take.
6. **Time zones.** Everything is UTC, but "your morning practice" and any
   per-day grouping is a local-time question. The client currently groups by UTC
   day, which is wrong for anyone far from Greenwich.
