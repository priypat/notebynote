"use client";

/**
 * The breath ridge. Terrain, not a signal trace — see design-tokens.md.
 *
 * Four layered depth planes, farthest in violet and palest, nearest in peach.
 * Depth comes from opacity, hue temperature, smoothing, and vertical offset —
 * never from outlines. Each plane is a smoothed, differently-windowed view of
 * the same amplitude signal, so the whole ridge stays a single record of one
 * breath rather than four unrelated shapes.
 *
 * Takes a plain `envelope` of RMS values rather than a fixture — this is the
 * same render path whether those values came from a replayed fixture or a
 * live microphone via breathEngine.subscribe(). Nothing here knows which.
 */

import { useMemo } from "react";
import { smoothAreaPath, smoothLinePath, type Point } from "./catmullRom";

const VIEW_W = 480;
const VIEW_H = 320;
const BASELINE_Y = VIEW_H - 6;

/** RMS this loud or louder fills a layer's full amplitude range. Exported so
 *  a caller holding an already-normalized 0..1 envelope (e.g. a stored
 *  PhraseResult.envelope) can rescale it back before passing it in. */
export const REF_PEAK_RMS = 0.1;

type Layer = {
  key: string;
  color: string;
  opacity: number;
  baseOffsetFrac: number;
  ampFrac: number;
  smoothWindow: number;
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
/** Frames arrive at roughly this rate, mic or fixture — cosmetic only, used
 *  to phase the ambient drift. */
const ASSUMED_FRAME_RATE = 60;

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
  envelope,
  assumedTotalFrames,
  settleAmount,
  reducedMotion,
}: {
  /** RMS values collected so far, oldest first. Grows in place as a phrase
   *  is sung — from a fixture replay or a live mic, indistinguishably. */
  envelope: number[];
  /** X-axis scale: how many frames the view width represents. Should only
   *  grow (never shrink) so already-drawn terrain doesn't jump. */
  assumedTotalFrames: number;
  /** 0 = fully present, 1 = fully settled into mist. */
  settleAmount: number;
  reducedMotion: boolean;
}) {
  const total = Math.max(2, assumedTotalFrames);

  const { layerPaths, roughness } = useMemo(() => {
    const norm = envelope.map((rms) => Math.max(0, Math.min(1, rms / REF_PEAK_RMS)));
    const rough = roughnessOf(norm);

    const controlStepSamples = Math.max(
      1,
      Math.round(CONTROL_STEP_SEC * ASSUMED_FRAME_RATE),
    );

    const paths = LAYERS.map((layer) => {
      const smoothed = movingAverage(norm, layer.smoothWindow * 3);
      const baseline = BASELINE_Y - layer.baseOffsetFrac * VIEW_H;

      const points: Point[] = [];
      for (let i = 0; i < norm.length; i += controlStepSamples) {
        const x = (i / (total - 1)) * VIEW_W;
        const t = i / ASSUMED_FRAME_RATE;
        const drift =
          reducedMotion || layer.driftAmpPx === 0
            ? 0
            : Math.sin(t * layer.driftHz * Math.PI * 2 + layer.driftPhase) *
              layer.driftAmpPx;
        const y = baseline - smoothed[i] * layer.ampFrac * VIEW_H + drift;
        points.push({ x, y });
      }
      const lastIdx = norm.length - 1;
      if (lastIdx >= 0) {
        const lastX = (lastIdx / (total - 1)) * VIEW_W;
        const lastY = baseline - smoothed[lastIdx] * layer.ampFrac * VIEW_H;
        if (points.length === 0 || points[points.length - 1].x < lastX) {
          points.push({ x: lastX, y: lastY });
        }
      }

      const area = smoothAreaPath(points, baseline);

      const gap = layer.hairlineGapPx * (1 - rough * 0.25);
      const hairlineCount = 3;
      const hairlines = Array.from({ length: hairlineCount }, (_, n) => {
        const offset = (n + 1) * gap;
        const shifted = points.map((p) => ({ x: p.x, y: p.y + offset }));
        return smoothLinePath(shifted);
      });

      return { key: layer.key, area, hairlines };
    });

    return { layerPaths: paths, roughness: rough };
  }, [envelope, total, reducedMotion]);

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
            <g
              key={layer.key}
              style={{
                opacity: layer.opacity * (1 - settleAmount * 0.4),
                transition: reducedMotion ? "none" : "opacity 900ms var(--ease-calm)",
              }}
            >
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
          the landscape behind it, rather than announcing "done". Also the
          resting state while waiting for the next phrase to begin. */}
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
