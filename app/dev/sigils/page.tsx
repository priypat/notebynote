import { notFound } from "next/navigation";
import { generateSigil, type SigilInput } from "@/lib/sigil/generate";
import { Sigil } from "@/components/Sigil";

/**
 * 24 sigils from deliberately varied inputs, spread by index rather than
 * Math.random() so this page renders identically every load. Enough spread
 * across all six parameters to eyeball whether the visual variety is
 * actually there.
 *
 * 404s in a production build, same as /dev/audio — a dev surface should
 * never be reachable by someone poking at URLs on a deployed demo.
 */

export const metadata = {
  title: "Sigils — dev",
  robots: { index: false, follow: false },
};
const DEV_SIGILS: SigilInput[] = Array.from({ length: 24 }, (_, i) => ({
  seed: 0x1000 + i * 0x2f13,
  longestHoldSec: 2 + (i % 6) * 2, // 2..12s
  meanDecaySlope: -0.002 - (i % 4) * 0.04, // ~0 .. -0.122
  meanSteadiness: 0.3 + (((i * 7) % 10) / 10) * 0.65, // 0.3..0.95
  phraseCount: 1 + (i % 6), // 1..6 rings
  hueSeed: i * 0x9e3779 + 0x2a,
  isPersonalRecord: i % 5 === 0,
}));

export default function DevSigilsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="space-y-6 pb-16">
      <header className="space-y-2">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Dev
        </p>
        <h1 className="display text-display-sm">Sigils</h1>
        <p className="text-body text-ink-muted">
          24 seals from varied inputs — lib/sigil/generate.ts. Not product UI.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {DEV_SIGILS.map((input, i) => {
          const spec = generateSigil(input);
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-2 rounded-token-lg border border-rule bg-surface p-3"
            >
              <div className="size-24">
                <Sigil spec={spec} />
              </div>
              <p className="text-center text-secondary text-ink-muted">
                {input.phraseCount}r · {input.longestHoldSec}s
                {input.isPersonalRecord ? " · PR" : ""}
              </p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
