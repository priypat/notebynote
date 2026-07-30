# Lung Tunes

Mobile sing-along app helping people with lung conditions (asthma, COPD,
long-COVID recovery, and anyone working on breath control) improve their
breathing by singing to real songs. Singing is the fun, motivating wrapper
around breathwork people already need to do — not a niche feature for one
age group. Audio-only — no camera, no face, no video. A person's breath as
they sustain a note draws a living topographic ridge: steady breath = smooth
rolling peaks, ragged breath = jagged spikes. One hero metric, the Breath
Score. Tone: warm, calm, encouraging, shame-free — running out of breath is
"pause and rest," never failure.

@design-tokens.md

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind v4 · Motion (`motion/react`).
Mobile-first portrait: the shell in `app/layout.tsx` is a 480px-max centred
column with safe-area padding. Design for a phone in portrait; wider screens
just get margins. Pinch-zoom is never locked.

## Token discipline
`app/globals.css` is the single source of truth for color, type, and spacing.
- Every color, size, and radius in a component comes from a token — via a
  Tailwind utility (`bg-action`, `text-ink-muted`, `text-body`, `min-h-tap`)
  or `var(--token)`. **No raw hex in components.** The one exception is
  `lib/tokens.ts`, which mirrors two background values because the browser's
  `theme-color` meta tag cannot read a CSS custom property.
- Tokens map to Tailwind through the `@theme inline` block in `globals.css`
  (Tailwind v4 — there is no `tailwind.config.js`). Add a token to `:root`
  and to `@theme` in the same edit, or it won't be reachable.
- Display type uses the `.display` class, large numbers use `.numeral`
  (serif, tabular figures). Don't set `font-variation-settings` ad hoc.
- Both themes ship: dawn is `:root`, dusk is `[data-theme="dusk"]` and also
  the default under `prefers-color-scheme: dark`. Anything you build must be
  checked in both.

## Non-negotiable constraints
- Body text ≥17px, preferred 18px. Never smaller. (Legibility floor for
  respiratory patients broadly, not an "elderly app" signal — keep the rest
  of the design contemporary and energetic, not clinical or aged-down.)
- WCAG AA+ contrast on all text and interactive elements.
- Tap targets ≥48×48px, generous spacing.
- Peach, sky, and violet are atmosphere tokens only — gradients, ridges,
  mist. Never text, never used to convey state.
- Steadiness is encoded in silhouette/line quality, never in hue. The
  visualization must survive grayscale.
- Ridge must read as terrain, not a signal trace: no sharp spikes, no
  scrolling waveform, no peak-meter look, no red/amber zone, no target line.
- Motion is calm and organic — slow, eased, ambient. Never jittery, never
  alarm-like. Respect prefers-reduced-motion.
- No streaks, no badges implying failure, no leaderboards, no red anywhere.
- Copy: plain, active voice, sentence case, never medical-sounding, never a
  treatment/diagnosis claim.

## Architecture rules
- No component calls `fetch` directly. All data access goes through
  `lib/api/*.ts`.
- No component touches `AudioContext` or `getUserMedia` directly. All audio
  goes through `lib/audio/breathEngine.ts`.
- Scoring lives in `lib/scoring/breathScore.ts` as a pure function, zero
  imports — must be portable server-side unchanged.
- Mark every spot needing a real backend with `// TODO(api):`.

## Audio layer
`lib/audio/breathEngine.ts` is the only file that may touch Web Audio. Components
subscribe to `BreathFrame`s; they never see an `AudioContext`.
- Build against fixtures, not your voice. `start({ fixture: 'steady-12s' })`
  needs no mic, no permission, and no HTTPS, and gives byte-identical frames
  every run. The five fixtures are the deterministic test input.
- A fixture supplies a *signal*, not a finished frame — both paths run through
  the same `FrameBuilder`, so voicing and hysteresis are exercised either way.
  Never let a fixture bypass that.
- `start('mic')` must be called synchronously from a real user gesture. Not from
  an effect, not after an await. Safari silently delivers digital silence
  otherwise.
- Denial is not an error. `start` resolves with `state === 'denied'`; offer a
  fixture and move on. Never re-prompt, never guilt-trip.
- Always `stop()` on unmount. An open mic track leaves the recording indicator
  on, which in this app is unacceptable.
- Never derive phrase state from `db` yourself — use `voiced`. The 250ms release
  hold is what stops a wobble from being reported as running out of breath.
- `elapsedVoicedSec` freezes during a dip and never ticks backwards. Capture a
  finished hold from `lastVoicedRunSec`.
- Audio never leaves the device. No recording, no upload, no `video: true`.
- Run `npm run check:audio` after touching thresholds in `frames.ts`.

## Data layer
`lib/types.ts` is the model. `API_CONTRACT.md` is the backend handoff — if you
change a type, a route, or an error code, update it in the same edit or the
handoff silently rots.
- `lib/api/*` branches once on `USE_MOCKS` (`NEXT_PUBLIC_USE_MOCKS`, on unless
  explicitly `false`), then either reads `lib/mock/` or calls HTTP. Nothing
  above that layer knows which is running. Keep the branch at the top of the
  function, never in a component.
- The server owns `breathScore`, `longestHoldSec`, `isPersonalRecord`, and
  `sigilSeed`. `TakeDraft` excludes them on purpose — don't add them back so a
  component can compute one locally.
- A take's `sigilSeed` is immutable: the same take must always draw the same
  terrain. Never re-seed at render time, never fall back to `Math.random()`.
- Fixtures are hand-authored and load-bearing for every progress screen. Run
  `npm run check:fixtures` after touching `lib/mock/` — it catches the
  inconsistencies TypeScript can't see.
- Never send audio anywhere. The engine emits derived numbers only.

## Type
Display: Fraunces (variable — opsz high for large sizes, WONK 0, SOFT low).
Body: Figtree, 18px / 1.6.
