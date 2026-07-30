"use client";

/**
 * Longest hold over time — a density, not a continuity, treatment.
 *
 * Deliberately not a line or area chart: a connected line implies a streak,
 * and the gap where the line would break reads as a failure. This plots one
 * mark per session, positioned by its real calendar date, with nothing
 * joining them. A missed week is simply empty space — post-lapse
 * abandonment is the failure mode of every breath-training app, and nothing
 * here may punish a gap.
 */

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { Take } from "@/lib/types";

const VIEW_W = 600;
const VIEW_H = 240;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function monthTickLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

export function TrendChart({ takes }: { takes: Take[] }) {
  const router = useRouter();

  const oldestFirst = useMemo(
    () => [...takes].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [takes],
  );

  const { points, monthTicks, maxHold } = useMemo(() => {
    const times = oldestFirst.map((t) => Date.parse(t.startedAt));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const span = Math.max(1, maxT - minT);
    const maxHold = Math.max(...oldestFirst.map((t) => t.longestHoldSec)) * 1.15;

    const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT;
    const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;

    const points = oldestFirst.map((take) => {
      const t = Date.parse(take.startedAt);
      const x = PAD_LEFT + ((t - minT) / span) * plotW;
      const y = PAD_TOP + plotH - (take.longestHoldSec / maxHold) * plotH;
      return { take, x, y };
    });

    // Month gridlines across the actual span the sessions cover — not
    // extended to "today", so a recent gap never shows up as looming
    // empty space at the right edge.
    const monthTicks: { x: number; label: string }[] = [];
    const start = new Date(minT);
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor.getTime() <= maxT) {
      const t = cursor.getTime();
      if (t >= minT) {
        const x = PAD_LEFT + ((t - minT) / span) * plotW;
        monthTicks.push({ x, label: monthTickLabel(cursor) });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return { points, monthTicks, maxHold };
  }, [oldestFirst]);

  return (
    <section className="space-y-3">
      <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
        Longest hold, over time
      </h2>
      <div className="rounded-token-lg border border-rule bg-surface p-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Longest hold per session, plotted by date"
        >
          {monthTicks.map((m, i) => (
            <g key={i}>
              <line
                x1={m.x}
                x2={m.x}
                y1={PAD_TOP}
                y2={VIEW_H - PAD_BOTTOM}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text
                x={m.x}
                y={VIEW_H - 8}
                fontSize={11}
                textAnchor="middle"
                fill="var(--ink-muted)"
              >
                {m.label}
              </text>
            </g>
          ))}

          <text x={4} y={PAD_TOP + 8} fontSize={11} fill="var(--ink-muted)">
            {formatSec(maxHold)}s
          </text>
          <text x={4} y={VIEW_H - PAD_BOTTOM} fontSize={11} fill="var(--ink-muted)">
            0s
          </text>

          {points.map(({ take, x, y }) => (
            <g
              key={take.id}
              role="link"
              tabIndex={0}
              aria-label={`Session, longest hold ${formatSec(take.longestHoldSec)} seconds${take.isPersonalRecord ? ", a personal record" : ""}`}
              onClick={() => router.push(`/take/${take.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") router.push(`/take/${take.id}`);
              }}
              style={{ cursor: "pointer" }}
            >
              {take.isPersonalRecord && (
                <circle cx={x} cy={y} r={7} fill="none" stroke="var(--mark)" strokeWidth={1.5} />
              )}
              <circle cx={x} cy={y} r={4.5} fill="var(--ink)" />
            </g>
          ))}
        </svg>
      </div>
      <p className="text-secondary text-ink-muted">
        Each mark is one session. Gaps are just days you didn&rsquo;t sing —
        never a streak to keep.
      </p>
    </section>
  );
}
