# Lung Tunes

A mobile sing-along app that helps people working on breath control — asthma,
COPD, long-COVID recovery — build breath support by singing to real songs. Your
breath draws a topographic ridge as you sustain a note. Audio only; no camera.

```bash
npm install
npm run dev              # localhost:3000
npm run dev -- -H 0.0.0.0   # reachable from a phone on the same wifi
```

`/` currently renders the **token specimen** — the type scale, both palettes,
and the contrast floors, with dawn/dusk and grayscale toggles. It's a
sanity-check surface, not product UI.

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

Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, Motion.
