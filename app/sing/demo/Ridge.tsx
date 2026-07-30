"use client";

/**
 * The breath ridge. Terrain, not a signal trace — see design-tokens.md.
 *
 * Four layered depth planes, farthest in violet and palest, nearest in peach.
 * Depth comes from opacity, hue temperature, smoothing, and vertical offset —
 * never from outlines. Each plane is a smoothed, differently-windowed view of
 * the same amplitude signal, so the whole ridge stays a single record of one
 * breath rather than four unrelated shapes.
 */

import { useMemo } from "react";
import { smoothAreaPath, smoothLinePath, type Point } from "./catmullRom";
import type { FixtureSample } from "@/lib/audio/fixtures";

const VIEW_W = 480;
const VIEW_H = 320;
const BASELINE_Y = VIEW_H - 6;

/** RMS this loud or louder fills a layer's full amplitude range. */
const REF_PEAK_RMS = 0.1;

type Layer = {
  key: string;
  color: string;
  opacity: number;
  /** Fraction of VIEW_H this layer's own baseline sits above BASELINE_Y. */
  baseOffsetFrac: number;
  /** Fraction of VIEW_H the full amplitude swing covers. */
  ampFrac: number;
  /** Moving-average window, in control points — farther layers are smoother. */
  smoothWindow: number;
  /** Seconds between hairline copies of this layer's crest. */
  hairlineGapPx: number;
  hairlineOpacity: number;
  driftAmpPx: number;
  driftHz: number;
  driftPhase: number;
};

const LAYERS: Layer[] = [
  {
    key: "far",
    color: "var(--dawn-violet)",
    opacity: 0.32,
    baseOffsetFrac: 0.4,
    ampFrac: 0.22,
    smoothWindow: 9,
    hairlineGapPx: 15,
    hairlineOpacity: 0.35,
    driftAmpPx: 5,
    driftHz: 0.05,
    driftPhase: 0.4,
  },
  {
    key: "mid-far",
    color: "var(--dawn-violet)",
    opacity: 0.45,
    baseOffsetFrac: 0.28,
    ampFrac: 0.32,
    smoothWindow: 6,
    hairlineGapPx: 14,
    hairlineOpacity: 0.45,
    driftAmpPx: 4,
    driftHz: 0.07,
    driftPhase: 1.7,
  },
  {
    key: "mid-near",
    color: "var(--dawn-sky)",
    opacity: 0.55,
    baseOffsetFrac: 0.15,
    ampFrac: 0.46,
    smoothWindow: 3,
    hairlineGapPx: 13,
    hairlineOpacity: 0.55,
    driftAmpPx: 3,
    driftHz: 0.09,
    driftPhase: 3.1,
  },
  {
    key: "near",
    color: "var(--dawn-peach)",
    opacity: 0.85,
    baseOffsetFrac: 0,
    ampFrac: 0.62,
    smoothWindow: 1,
    hairlineGapPx: 12,
    hairlineOpacity: 0.7,
    driftAmpPx: 0,
    driftHz: 0,
    driftPhase: 0,
  },
];

/** Points sampled roughly this often — dense enough for shape, sparse enough
 *  that Catmull-Rom smoothing reads as terrain, not as the raw 60Hz signal. */
const CONTROL_STEP_SEC = 0.12;

function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values;
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j];
    out.push(sum / (i - start + 1));
  }
  return out;
}

/** 0..1 roughness estimate from how much the envelope jitters, frame to frame. */
function roughnessOf(norm: number[]): number {
  if (norm.length < 4) return 0;
  let sum = 0;
  for (let i = 1; i < norm.length; i++) sum += Math.abs(norm[i] - norm[i - 1]);
  const meanAbsDelta = sum / (norm.length - 1);
  return Math.max(0, Math.min(1, meanAbsDelta * 18));
}

export function Ridge({
  samples,
  frameRate,
  elapsedSec,
  settleAmount,
  reducedMotion,
}: {
  samples: FixtureSample[];
  frameRate: number;
  /** Playback position, in seconds, since this phrase's sustain began. */
  elapsedSec: number;
  /** 0 = fully present, 1 = fully settled into mist. */
  settleAmount: number;
  reducedMotion: boolean;
}) {
  const visibleCount = Math.max(
    2,
    Math.min(samples.length, Math.round(elapsedSec * frameRate)),
  );

  const { layerPaths, roughness } = useMemo(() => {
    const norm = samples.map((s) => Math.max(0, Math.min(1, s.rms / REF_PEAK_RMS)));
    const rough = roughnessOf(norm.slice(0, visibleCount));

    const controlStepSamples = Math.max(1, Math.round(CONTROL_STEP_SEC * frameRate));

    const paths = LAYERS.map((layer) => {
      const smoothed = movingAverage(norm, layer.smoothWindow * 3);
      const baseline = BASELINE_Y - layer.baseOffsetFrac * VIEW_H;

      const points: Point[] = [];
      for (let i = 0; i < visibleCount; i += controlStepSamples) {
        const x = (i / Math.max(1, samples.length - 1)) * VIEW_W;
        const t = i / frameRate;
        const drift =
          reducedMotion || layer.driftAmpPx === 0
            ? 0
            : Math.sin(t * layer.driftHz * Math.PI * 2 + layer.driftPhase) *
              layer.driftAmpPx;
        const y =
          baseline - smoothed[i] * layer.ampFrac * VIEW_H + drift;
        points.push({ x, y });
      }
      // Always include the current leading edge so the fill reaches "now".
      const lastIdx = visibleCount - 1;
      const lastX = (lastIdx / Math.max(1, samples.length - 1)) * VIEW_W;
      const lastY =
        baseline - smoothed[lastIdx] * layer.ampFrac * VIEW_H;
      if (points.length === 0 || points[points.length - 1].x < lastX) {
        points.push({ x: lastX, y: lastY });
      }

      const area = smoothAreaPath(points, baseline);

      // Contour hairlines: parallel copies of the crest, offset downward.
      // Steady breath spaces these evenly and keeps them solid; ragged breath
      // crowds them and breaks them with a dash pattern.
      const gap = layer.hairlineGapPx * (1 - rough * 0.25);
      const hairlineCount = 3;
      const hairlines = Array.from({ length: hairlineCount }, (_, n) => {
        const offset = (n + 1) * gap;
        const shifted = points.map((p) => ({ x: p.x, y: p.y + offset }));
        return smoothLinePath(shifted);
      });

      return { key: layer.key, area, hairlines, baseline };
    });

    return { layerPaths: paths, roughness: rough };
  }, [samples, frameRate, visibleCount, reducedMotion]);

  const mistOpacity = 0.15 + settleAmount * 0.55;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Your breath, drawn as rolling terrain"
      >
        {LAYERS.map((layer, i) => {
          const p = layerPaths[i];
          const dash = roughness > 0.45 ? "5 4" : undefined;
          return (
            <g key={layer.key} style={{ opacity: layer.opacity * (1 - settleAmount * 0.4) }}>
              <path d={p.area} fill={layer.color} stroke="none" />
              {p.hairlines.map((d, hi) => (
                <path
                  key={hi}
                  d={d}
                  fill="none"
                  stroke="var(--rule)"
                  strokeWidth={1}
                  strokeDasharray={dash}
                  opacity={layer.hairlineOpacity * (1 - hi * 0.22)}
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}
      </svg>
      {/* Mist — the settle. Drifts in as a phrase ends and the ridge joins
          the landscape behind it, rather than announcing "done". */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent to-[var(--dawn-mist)]"
        style={{
          opacity: mistOpacity,
          transition: reducedMotion ? "none" : "opacity 900ms var(--ease-calm)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export { VIEW_W, VIEW_H, LAYERS };
export type { Layer };
