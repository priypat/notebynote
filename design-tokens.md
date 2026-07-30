# Lung Tunes — Organic Dawn

**Visual direction and design tokens.** Paste the "Prompt block" section into every design generation. Drop `tokens.css` into the repo. `CLAUDE.md` should reference this file as the single source of truth for color and type.

---

## The direction

The mountain identity, fully expressed — airy, natural, poetic. Dawn-sky gradients grounded by deep pine. Elegant high-contrast serif display against a clean, highly legible sans body. Topographic line textures, layered mountain silhouettes, soft mist. Breath renders as rolling gradient hills that draw themselves in real time. Feels like a calm sunrise.

---

## Two palettes, not one

This is the thing to internalize before generating anything: **your four colors are an atmosphere palette, not a UI palette.** Peach and sky are gorgeous and completely unusable as text or as anything carrying meaning — measured against a warm-white background they come in at 1.48:1 and 1.55:1. WCAG AA body text needs 4.5:1.

So the palette splits in two, and the split is a feature — it's what keeps the interface from dissolving into a wash.

### Atmosphere — gradients, ridges, mist, silhouettes. Never text. Never state.

| Token | Hex | Role |
|---|---|---|
| `--dawn-peach` | `#F7C59F` | lowest gradient stop, warmest ridge band |
| `--dawn-sky` | `#A8D0E6` | mid gradient stop, mid-distance ridges |
| `--dawn-violet` | `#7C6A9C` | upper gradient stop, farthest ridges, mist |
| `--dawn-mist` | `#F1EDF4` | palest haze, layer separation |

### Functional — text, actions, structure. All AA+ verified.

| Token | Hex | On warm white | Role |
|---|---|---|---|
| `--bg` | `#FDF8F3` | — | warm cream, primary background |
| `--surface` | `#FFFFFF` | — | cards, raised surfaces |
| `--ink` | `#1F3A34` | **11.62:1** | deep pine. All body and display text. |
| `--ink-muted` | `#5E4F80` | **6.85:1** | secondary text. A darkened violet — keeps the dawn family without the contrast failure. |
| `--action` | `#2E5449` | **8.02:1** (white on it: 8.47:1) | primary buttons, the one interactive color |
| `--rule` | `#D8D0C8` | — | contour hairlines, dividers, borders |
| `--mark` | `#C08A3E` | — | **graphic only, never text.** The personal-record pip. |

Two deliberate calls in there worth knowing the reasoning for:

**`--ink-muted` is a darkened violet, not a grey.** Raw `#7C6A9C` measures 4.52:1 on warm cream — technically AA, but that's a hair over the line, and it drops to 4.26:1 the moment it lands on a mist surface. For an audience that includes older adults, "technically passes on a good day" isn't the standard. `#5E4F80` is the same hue at 6.85:1.

**`--action` is pine, deliberately outside the dawn family.** The gradient owns peach/sky/violet. If the primary button also lived in that family, your one meaningful color would be visually indistinguishable from decoration. Pine is the grounding color in your own description — so it's the natural "this one does something."

### Dusk — the evening theme

Not an afterthought. Plenty of breath practice happens at night, and someone with COPD sitting up at 2am is exactly who a dim screen is for. Same palette, inverted — and in dark mode peach and sky finally become usable for meaning, since both clear 10:1.

| Token | Hex | Contrast |
|---|---|---|
| `--bg` | `#1A1428` | deep dusk violet |
| `--surface` | `#231B33` | |
| `--ink` | `#FDF8F3` | 16.94:1 |
| `--ink-muted` | `#D9D2E0` | 12.13:1 |
| `--action` | `#A8D0E6` | 10.92:1 — sky, with dark pine text on it |
| `--rule` | `#3A3050` | |
| `--mark` | `#F7C59F` | 11.44:1 — peach earns a semantic role here |

---

## Type

**Display — Canela** if you have the license. It's Commercial Type, paid, and there's no webfont without one, so worth confirming before the prototype depends on it.

Free stand-ins, closest first:


- **Gambarino** (Fontshare) — flared stems, more character and more risk. Better if you want it to feel less like a default.
- **Fraunces** (Google, variable) — most control via the `SOFT` and `WONK` axes, but easy to overtune into something quirkier than this direction wants. IDEALLY THIS.

**Body — needs to be boring-good, not characterful.** The display carries the personality; the body carries an 18px floor for people with reduced vision.

- **Instrument Sans** — pairs cleanly with Instrument Serif.
- **Figtree** — taller x-height and more open apertures. The legibility-first pick, and what I'd choose if any of your users are over 65.

**Numerals.** For the hero seconds counter and the Breath Score, set the *display serif* with tabular figures rather than reaching for a mono. A large elegant serif numeral is more beautiful than a monospace one and reinforces the editorial calm. Keep mono, if you use one at all, to small utility labels.

**Scale.** Body 18px / 1.6. Secondary 17px minimum — never below. Display: 32 / 44 / 64, tight leading, and used sparingly enough that it stays an event.

---

## tokens.css

```css
:root {
  /* atmosphere — gradients, ridges, mist. never text, never state */
  --dawn-peach:  #F7C59F;
  --dawn-sky:    #A8D0E6;
  --dawn-violet: #7C6A9C;
  --dawn-mist:   #F1EDF4;

  /* functional */
  --bg:         #FDF8F3;
  --surface:    #FFFFFF;
  --ink:        #1F3A34;
  --ink-muted:  #5E4F80;
  --action:     #2E5449;
  --on-action:  #FFFFFF;
  --rule:       #D8D0C8;
  --mark:       #C08A3E;

  /* the signature gradient */
  --dawn: linear-gradient(
    to top,
    var(--dawn-peach) 0%,
    var(--dawn-sky) 52%,
    var(--dawn-violet) 100%
  );

  /* type */
  --font-display: "Canela", "Instrument Serif", Georgia, serif;
  --font-body:    "Instrument Sans", "Figtree", system-ui, sans-serif;

  --text-body:      18px;
  --text-secondary: 17px;
  --leading-body:   1.6;

  --radius:  14px;
  --radius-lg: 22px;
  --shadow: 0 1px 2px rgba(31, 58, 52, 0.05),
            0 8px 24px rgba(31, 58, 52, 0.06);
}

[data-theme="dusk"] {
  --bg:        #1A1428;
  --surface:   #231B33;
  --ink:       #FDF8F3;
  --ink-muted: #D9D2E0;
  --action:    #A8D0E6;
  --on-action: #16261F;
  --rule:      #3A3050;
  --mark:      #F7C59F;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3),
            0 8px 24px rgba(0, 0, 0, 0.25);
}
```

---

## How the ridge renders in this theme

- **Layered silhouettes, four to five depth planes.** Farthest planes in violet at low opacity, nearest in peach. Depth comes from opacity and hue temperature, not from outlines.
- **Contour hairlines in `--rule`, and keep them crisp.** This is the load-bearing detail — see the risk note below.
- **Steadiness is encoded in silhouette and line, never in hue.** Steady breath: smooth rolling crests, evenly spaced parallel contour hairlines, clean edges. Ragged breath: broken crests, crowded and interrupted hairlines, softer and more diffuse edges. The whole visualization must survive being printed in grayscale.
- **Peach never means "bad."** It's the warmest and lowest gradient stop, so it's structurally near where a level meter would put a warning zone. It's sky and atmosphere only — it must never appear as a state or a threshold.
- **Mist as the settle.** When a phrase ends, mist drifts in and the ridge joins the landscape behind it. That's the "rest here" beat, rendered as weather rather than as a message.
- **Text never sits on the live gradient.** Structurally solved by the sing screen layout: lyrics on flat cream in the upper half, gradient and ridge in the lower half. Anywhere else the gradient appears behind text, it needs a scrim.

---

## Prompt block — paste this into every design generation

> **Visual direction: Organic Dawn.** Airy, natural, poetic — a calm sunrise. Background warm cream `#FDF8F3`. The signature is a dawn-sky gradient rising from peach `#F7C59F` through soft sky blue `#A8D0E6` to dusk violet `#7C6A9C`, grounded by deep pine `#1F3A34`. Peach, sky, and violet are **atmosphere only** — gradients, layered mountain silhouettes, mist. They must never be used for text or to convey state. All text is deep pine `#1F3A34`; secondary text is darkened violet `#5E4F80`; the single interactive color is pine `#2E5449` with white text. Hairlines and contour lines in `#D8D0C8`. Personal-record marks in warm gold `#C08A3E`, as a graphic only, never as text.
>
> Display type: an elegant high-contrast serif (Canela, or Instrument Serif) used sparingly, with tabular figures for large numbers. Body: a clean highly legible sans (Instrument Sans or Figtree) at 18px, secondary never below 17px, leading 1.6. Radius 14px, soft low shadows.
>
> Breath renders as rolling gradient hills that draw themselves in real time — four to five layered depth planes, violet farthest and palest, peach nearest, with crisp topographic contour hairlines over the top. Depth from opacity and hue temperature, not outlines. Steadiness is encoded in silhouette and contour-line quality, never in color: smooth crests with evenly spaced parallel hairlines for steady breath, broken crests with crowded interrupted hairlines for ragged. It must read as **terrain, not as a signal trace** — no sharp vertical spikes, no scrolling waveform, no peak-meter look, no target line, no red or amber zone. The visualization must survive grayscale.
>
> Motion is calm and organic: slow, eased, ambient. Never jittery, never alarm-like. Respect reduced motion.

---

## One honest risk

Dawn gradient plus soft mist plus elegant serif is precisely where Calm, Headspace, and Balance already live. It's a beautiful place and it's also the most crowded corner of wellness design — a judge who uses any of those apps will get a flicker of recognition.

Two things pull you out of it, and both are already in the direction:

**The contour hairlines.** Meditation apps go soft everywhere. Your topographic line work is *technical* — precise, thin, evenly measured, sitting right on top of the softness. That tension between measured line and atmospheric wash is the entire reason this reads as cartography instead of as a mood gradient. If a generation pass starts blurring or dropping the hairlines to make things prettier, push back. It's the differentiator, not the texture.

**The landscape is earned.** Calm's gradient is decoration. Yours is a record of a specific person's breath on a specific morning, and the same take always draws the same terrain. Make sure that's legible in the UI — a date, a duration, the fact that this ridge is *this session* — because the moment a viewer understands the picture is data, the resemblance stops mattering.
