# Spotify integration — the plan

Written before building anything, so the shape can be argued with first.

---

## The one insight this hangs on

The app coaches breathing because it knows **where the long notes are**. That's
`Phrase.targetHoldSec` and `holdStartSec` in `lib/types.ts` — hand-authored for
three songs. Spotify hands us a hundred million songs with none of that.

**Synced lyrics are the missing map.** An LRC file is a list of timestamped
lines. The gap between one line ending and the next starting is where a person
breathes; a long gap is a sustained note. So the phrase structure the app
already runs on can be *derived* from synced lyrics, automatically, for any song
that has them.

That's the whole integration. Everything else is UI around it.

---

## The blocker you need to decide on

Three constraints stack badly:

1. **Spotify Premium is required** to play a single second of audio.
2. **Development Mode caps you at 5 named users** until Spotify approves an
   extension — which they grant slowly, and not to everything.
3. **Not every song has synced lyrics.** No synced lyrics, no phrase map, no
   breath coaching. It becomes a music player.

Net: a Spotify-only app can't reach the people it's for. Most won't have
Premium, and you can't onboard more than five of them anyway.

**So Spotify cannot be the only way in.** It's an upgrade for people who have
it, layered over a path that works for everyone. That also keeps the demo safe
— if the network dies or the account hiccups, the curated songs still sing.

---

## The journey

**1. Home** — unchanged. One clear "Start singing."

**2. Pick a song** — the screen that does the real work.
Not a blank search box. A blank box is choice paralysis, and it lets someone
pick a rapid-fire song with no sustained notes and conclude the app is broken.
Instead: **shelves first, search second.**

- *Made for breath* — the curated songs. Always there, no account needed.
- *From your Spotify* — their saved and most-played tracks, filtered to ones
  that actually have synced lyrics.
- *Long, slow phrases* / *Short and gentle* — sorted by what the lyric map says
  about phrase length, so the difficulty signal is real rather than editorial.

Search sits above, secondary. Results are filtered the same way.

**3. Song detail** — a small sheet, not a page. Title, artist, and one honest
line about the breath fit: *"Long phrases — about 6 seconds each. Reaching."*
If there are no synced lyrics, say so plainly here and offer the nearest
curated song instead. One button: **Sing this.**

**4. Ready** — the existing pre-sing beat. Keep it. It's where someone catches
their breath before starting, and it's the only moment to say "there's no wrong
way to do this."

**5. Sing** — the existing screen, with the backing track playing and lyrics
advancing on the LRC timestamps. The ridge and the breath scoring do not change
at all; they already run on microphone input independent of what's playing.

**6. Results** — unchanged. Score, sentence, ridge, sigil.

Only step 2 and 3 are new. Everything downstream already exists.

---

## Feel

Citrus Sunrise, the direction you picked. Warm, energetic, deliberately not a
meditation app. Song shelves are a good excuse for the colour blocks — album art
does a lot of the work, and the vivid accents keep it feeling like a music app
rather than a medical one.

Two tone rules carry over unchanged: **no song is labelled "hard"** (phrase
length is information, not a verdict), and **nothing implies a missed day**.

---

## Path forward

**Phase 1 — the bridge.** A pure function: synced lyrics → `Phrase[]`. No UI.
It's testable in isolation against real LRC files, and it's the piece everything
else depends on, so it should exist before any screen is built.

**Phase 2 — song picking.** The shelves + search + detail sheet, backed by
Spotify search and the user's own library, filtered by lyric availability.

**Phase 3 — join it up.** Backing track plays on the sing screen, lyrics advance
on timestamps, take saves as normal. The sing screen barely changes.

**Phase 4 — the fallback path.** Make the curated songs and the Spotify songs
genuinely interchangeable everywhere, so no-Premium and no-lyrics both degrade
to something that still works rather than a dead end.

Phase 1 is small and de-risks the rest. Worth doing first even if the design
shifts.

---

## Open questions

1. **Is Premium acceptable as a requirement for the Spotify path?** If the
   answer is "this has to work for people without it", the curated library needs
   to grow and Spotify becomes a nice-to-have rather than the centrepiece.
2. **Whose music, in the shelves?** Their Spotify library is more motivating but
   needs extra scopes and is emptier for new users. Curated shelves are more
   reliable. Probably both, library first when it's not empty.
3. **What happens when a song has no synced lyrics?** Refuse it, or let them
   sing it with no phrase coaching and no breath score? I'd refuse it and say
   why — a session that silently doesn't measure anything is worse than a clear
   "not this one."
