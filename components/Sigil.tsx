"use client";

/**
 * Renders a SigilSpec (lib/sigil/generate.ts) as SVG — trig-computed points
 * and stroke properties only, no image assets. Static by default; pass
 * `animate` to have the rings assemble one at a time and then hold, for the
 * results screen's entrance.
 */

import { forwardRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import type { SigilSpec, Point } from "@/lib/sigil/generate";

const VIEW = 200; // internal coordinate space, centered at 0,0

function pathFromPoints(points: Point[], scale: number): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x * scale} ${points[0].y * scale}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x * scale} ${points[i].y * scale}`;
  }
  return `${d} Z`;
}

export const Sigil = forwardRef<SVGSVGElement, { spec: SigilSpec; animate?: boolean }>(
  function Sigil({ spec, animate = false }, ref) {
    const scale = (VIEW / 2) * spec.size;

    // Client-only: ringPoints() and the mark's placement use Math.cos/sin,
    // which the spec doesn't guarantee bit-identical across JS engines (only
    // +,-,*,/ and sqrt are). Rendering nothing server-side sidesteps the
    // resulting false-positive hydration mismatch — see the same fix and
    // fuller explanation on Ridge.tsx.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
      <svg
        ref={ref}
        viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
        className="h-full w-full"
        role="img"
        aria-label="A seal drawn from this session's breath"
      >
        {mounted && spec.rings.map((ring, i) => {
          const d = pathFromPoints(ring.points, scale);
          const strokeWidth = ring.strokeWidth * scale;
          const strokeDasharray = ring.dash
            ? `${ring.dash.on * scale} ${ring.dash.off * scale}`
            : undefined;

          return animate ? (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: [0.33, 0, 0.2, 1] }}
            />
          ) : (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
            />
          );
        })}

        {mounted && spec.mark &&
          (() => {
            const angle = (spec.mark.angleDeg * Math.PI) / 180;
            const r = spec.mark.radius * scale;
            const cx = Math.cos(angle) * r;
            const cy = Math.sin(angle) * r;
            return animate ? (
              <motion.circle
                cx={cx}
                cy={cy}
                r={scale * 0.03}
                fill={spec.mark.color}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: 0.5,
                  delay: spec.rings.length * 0.15 + 0.2,
                  ease: [0.33, 0, 0.2, 1],
                }}
              />
            ) : (
              <circle cx={cx} cy={cy} r={scale * 0.03} fill={spec.mark.color} />
            );
          })()}
      </svg>
    );
  },
);
