"use client";

/**
 * The collection wall — one sigil per session, most recent first, grouped by
 * month. The tracking argument in a single glance: nine seals, and the
 * numbers underneath them went up. Tapping one opens that take's results.
 */

import Link from "next/link";
import { useMemo } from "react";
import type { Take } from "@/lib/types";
import { generateSigil } from "@/lib/sigil/generate";
import { Sigil } from "@/components/Sigil";

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** UTC month, matching the grouping convention already in use elsewhere in
 *  this client — see API_CONTRACT.md §8 on local time being an open gap. */
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SigilCollection({
  takes,
  motifSeeds,
}: {
  /** Newest first. */
  takes: Take[];
  motifSeeds: Record<string, number>;
}) {
  // Bucket into consecutive month groups without re-sorting — takes already
  // arrives newest-first, so each bucket (and the bucket order) stays that
  // way for free.
  const groups = useMemo(() => {
    const out: { label: string; takes: Take[] }[] = [];
    for (const take of takes) {
      const label = monthLabel(take.startedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.takes.push(take);
      else out.push({ label, takes: [take] });
    }
    return out;
  }, [takes]);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label} className="space-y-3">
          <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {group.label}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {group.takes.map((take) => {
              const attempted = take.phrases.filter((p) => p.heldSec > 0);
              const spec = generateSigil({
                seed: take.sigilSeed,
                longestHoldSec: take.longestHoldSec,
                meanDecaySlope: mean(attempted.map((p) => p.decaySlope)),
                meanSteadiness: mean(attempted.map((p) => p.steadiness)),
                phraseCount: take.phrases.length,
                hueSeed: motifSeeds[take.songId] ?? 0,
                isPersonalRecord: take.isPersonalRecord,
              });
              return (
                <Link
                  key={take.id}
                  href={`/take/${take.id}`}
                  className="flex flex-col items-center gap-1 rounded-token-lg border border-rule bg-surface p-2"
                >
                  <div className="aspect-square w-full">
                    <Sigil spec={spec} />
                  </div>
                  <p className="numeral text-secondary text-ink-muted">{take.breathScore}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
