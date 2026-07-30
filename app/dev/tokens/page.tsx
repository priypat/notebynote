import { notFound } from "next/navigation";
import { SpecimenControls } from "@/components/SpecimenControls";

/**
 * Token specimen. A sanity-check surface, not product UI — it exists so the
 * type scale, the two palettes, and the contrast floors can be eyeballed on a
 * real phone before any screen gets built.
 *
 * The hex strings below are label *content*, not styling. Every rendered color
 * comes from a token utility (bg-ink, text-ink-muted, …). No component in this
 * app styles anything with a literal hex value.
 *
 * 404s in a production build, same as /dev/audio — a dev surface should never
 * be reachable by someone poking at URLs on a deployed demo.
 */

export const metadata = {
  title: "Token specimen — dev",
  robots: { index: false, follow: false },
};

const ATMOSPHERE = [
  { token: "--dawn-peach", hex: "#F7C59F", swatch: "bg-dawn-peach", role: "lowest gradient stop, warmest ridge band" },
  { token: "--dawn-sky", hex: "#A8D0E6", swatch: "bg-dawn-sky", role: "mid gradient stop, mid-distance ridges" },
  { token: "--dawn-violet", hex: "#7C6A9C", swatch: "bg-dawn-violet", role: "upper gradient stop, farthest ridges" },
  { token: "--dawn-mist", hex: "#F1EDF4", swatch: "bg-dawn-mist", role: "palest haze, layer separation" },
];

const FUNCTIONAL = [
  { token: "--bg", hex: "#FDF8F3", swatch: "bg-bg", role: "warm cream, primary background", contrast: null },
  { token: "--surface", hex: "#FFFFFF", swatch: "bg-surface", role: "cards, raised surfaces", contrast: null },
  { token: "--ink", hex: "#1F3A34", swatch: "bg-ink", role: "deep pine — all body and display text", contrast: "11.62:1" },
  { token: "--ink-muted", hex: "#5E4F80", swatch: "bg-ink-muted", role: "secondary text", contrast: "6.85:1" },
  { token: "--action", hex: "#2E5449", swatch: "bg-action", role: "the one interactive color", contrast: "8.02:1" },
  { token: "--rule", hex: "#D8D0C8", swatch: "bg-rule", role: "contour hairlines, dividers", contrast: null },
  { token: "--mark", hex: "#C08A3E", swatch: "bg-mark", role: "personal-record pip — graphic only", contrast: null },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-7">
      <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Swatch({
  token,
  hex,
  role,
  swatch,
  contrast,
}: {
  token: string;
  hex: string;
  role: string;
  swatch: string;
  contrast?: string | null;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={`${swatch} size-tap shrink-0 rounded-token border border-rule`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-body">
          {token} <span className="text-ink-muted">{hex}</span>
        </p>
        <p className="text-secondary text-ink-muted">
          {role}
          {contrast ? ` · ${contrast} on cream` : ""}
        </p>
      </div>
    </div>
  );
}

export default function TokenSpecimen() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="space-y-9 pb-16">
      <header className="space-y-4">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Organic Dawn
        </p>
        <h1 className="display text-display-md">Token specimen</h1>
        <p className="text-body text-ink-muted">
          Check the scale, the palettes, and the contrast floors here before any
          screen gets built.
        </p>
        <SpecimenControls />
      </header>

      <Section title="Display — Fraunces">
        <div className="space-y-4">
          <p className="display text-display-lg">Breathe in</p>
          <p className="text-secondary text-ink-muted">64px · leading 1.05</p>
          <p className="display text-display-md">Breathe in</p>
          <p className="text-secondary text-ink-muted">44px</p>
          <p className="display text-display-sm">Breathe in</p>
          <p className="text-secondary text-ink-muted">32px</p>
        </div>
      </Section>

      <Section title="Numerals — display serif, tabular">
        <p className="numeral text-display-lg">14.8</p>
        <p className="text-secondary text-ink-muted">
          Seconds held. Tabular figures so the number stops jittering as it
          counts — 11.11 and 00.00 occupy the same width.
        </p>
        <p className="numeral text-display-md">82</p>
        <p className="text-secondary text-ink-muted">Breath Score.</p>
      </Section>

      <Section title="Body — Figtree">
        <p className="text-body">
          You held that note for fourteen seconds. Take a rest whenever you need
          one — the song will wait for you.
        </p>
        <p className="text-secondary text-ink-muted">
          Body 18px / 1.6. Secondary 17px, the floor. Nothing in this app is
          smaller than this line.
        </p>
      </Section>

      <Section title="Atmosphere — never text, never state">
        {ATMOSPHERE.map((c) => (
          <Swatch key={c.token} {...c} />
        ))}
        <div
          className="h-40 rounded-token-lg"
          style={{ background: "var(--dawn)" }}
          aria-label="The dawn gradient: peach through sky to violet"
          role="img"
        />
        <p className="text-secondary text-ink-muted">
          The signature gradient. Text never sits on it without a scrim.
        </p>
      </Section>

      <Section title="Functional — all AA+ verified">
        {FUNCTIONAL.map((c) => (
          <Swatch key={c.token} {...c} />
        ))}
      </Section>

      <Section title="Contour hairlines">
        <div
          className="h-28 rounded-token-lg border border-rule"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, var(--rule) 0 1px, transparent 1px 11px)",
          }}
          aria-hidden="true"
        />
        <p className="text-secondary text-ink-muted">
          Evenly spaced and crisp. This is the load-bearing detail — the
          measured line against the atmospheric wash is why the ridge reads as
          cartography rather than as a mood gradient.
        </p>
      </Section>

      <Section title="Tap targets">
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            className="min-h-tap rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Start singing
          </button>
          <button
            type="button"
            className="min-h-tap min-w-tap rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
          >
            Not now
          </button>
        </div>
        <p className="text-secondary text-ink-muted">
          48px minimum on both axes, generous spacing between them.
        </p>
      </Section>
    </main>
  );
}
