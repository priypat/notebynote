# Lung Tunes

A mobile sing-along app that helps people working on breath control — asthma,
COPD, long-COVID recovery — build breath support by singing to real songs. Your
breath draws a topographic ridge as you sustain a note. Audio only; no camera.

```bash
npm install
npm run dev              # localhost:3000
npm run dev -- -H 0.0.0.0   # reachable from a phone on the same wifi
```

`/` is the home screen — greeting, last session, and the song list. The token
specimen moved to `/dev/tokens`.

## Where things live

| Path | What |
|---|---|
| `CLAUDE.md` | The constitution. Read it before changing anything. |
| `design-tokens.md` | Visual direction and the reasoning behind each token. |
| `API_CONTRACT.md` | The backend handoff — every route, shape, and error case. |
| `app/globals.css` | Single source of truth for color, type, spacing. |
| `lib/types.ts` | The data model. |
| `lib/api/` | The only place that may call `fetch`. |
| `lib/mock/` | Hand-authored songs, a nine-take history, one profile. |
| `lib/audio/breathEngine.ts` | The only place that may touch `AudioContext` / `getUserMedia`. |
| `lib/scoring/breathScore.ts` | Pure, zero imports, portable server-side. |

```bash
npm run check            # both checks below
npm run check:fixtures   # asserts the mock data agrees with itself
npm run check:audio      # asserts each breath fixture still behaves as described
npm run lint
npm run build
```

## The microphone needs HTTPS

`getUserMedia` only exists in a **secure context**. That means `https://` or
`localhost` — on a plain `http://192.168.x.x` address, `navigator.mediaDevices`
is `undefined`, which reads like a browser support problem and isn't one.

- **Desktop:** `npm run dev` and use `http://localhost:3000`. `localhost` counts
  as secure, so the mic works with no extra setup.
- **On a phone:** `npm run dev:https` (`next dev --experimental-https`) generates
  a local certificate with mkcert. Your phone won't trust it by default, so
  you'll get a warning to click through — or install the mkcert root CA on the
  device. A tunnel (`cloudflared tunnel --url http://localhost:3000`) is often
  less fuss and gives you a real certificate.

**None of this blocks development.** Every breath fixture runs with no
microphone, no permission prompt, and no secure context — `/dev/audio` is fully
usable over plain http on a phone. Build the sing screen against
`{ fixture: "steady-12s" }` and only reach for the mic to check the real thing.

## Dev probe

`/dev/audio` shows raw `BreathFrame` values as numbers, with a source switcher
for the mic and all five fixtures. It 404s in a production build.

Data comes from `lib/mock/` while `NEXT_PUBLIC_USE_MOCKS` is anything but
`false`; writes persist to `localStorage`. Set it to `false` and every function
in `lib/api/` switches to live HTTP against the routes in `API_CONTRACT.md`.

## Demo mode — read this before presenting live

Add `?demo=1` to any `/sing/:songId` URL — the one to actually bookmark is:

```
/sing/song-down-in-the-valley?demo=1
```

This is **insurance for a live presentation, not a separate feature.** It
pushes through the exact same rendering path as a real take — the sing
screen, the phrase cycle, `createTake()`, the results screen, the sigil
assembling ring by ring — nothing about it is a special demo UI. What it
does differently:

- **Auto-starts.** No tap needed — fixtures don't require a mic gesture, so
  the screen begins the moment it loads.
- **Scripts which fixture plays each phrase**, instead of you needing to sing:
  every phrase but the last replays `short-3s` (quick, clean), and the last
  phrase replays `steady-12s` (~11-12 seconds) — long enough to beat any
  prior take, seeded or real, so the demo always lands on a **personal
  record** on its final phrase, however many times you've already run it.
- **Seeds a few months of history behind `/progress` the first time it runs**,
  through `createTake()` itself (not a shortcut), so the collection wall and
  trend chart have more than one month to show off. Idempotent — re-running
  the demo doesn't pile up a second copy of that backdrop.

`?demo=1` works on any song's route, in case you want a longer or shorter
run than Down in the Valley's four phrases.

### If the mic dies on stage

Press **`f`** at any point during a real (mic) session to switch the rest of
that take over to a fixture (`steady-12s`) without losing anything already
sung — the current phrase and every phrase already scored stay exactly as
they were, only the input source for what's left changes. It's a no-op if
you're already on a fixture (including during demo mode). There's no on-screen
hint for this on purpose — it's for whoever's driving, not something a real
user should ever notice or need.

Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, Motion.
