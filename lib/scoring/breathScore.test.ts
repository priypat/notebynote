import { describe, expect, it } from "vitest";
import { FrameBuilder } from "@/lib/audio/frames";
import { getFixture, FIXTURE_FRAME_RATE } from "@/lib/audio/fixtures";
import type { BreathFrame } from "@/lib/audio/types";
import type { Profile, Take } from "@/lib/types";
import { describeTake, scorePhrase, scoreTake } from "./breathScore";

/** Pushes an entire fixture through a fresh FrameBuilder — the same code
 *  path breathEngine.ts uses for fixture playback. */
function framesFrom(fixtureName: Parameters<typeof getFixture>[0]): BreathFrame[] {
  const fixture = getFixture(fixtureName);
  const builder = new FrameBuilder();
  return fixture.samples.map((s, i) => builder.push(i / FIXTURE_FRAME_RATE, s.rms, s.pitchHz));
}

const PROFILE: Profile = {
  id: "p1",
  name: "Test",
  baselineMptSec: 11.4,
  createdAt: "2026-01-01T00:00:00.000Z",
  theme: "auto",
  baselineMptMeasuredAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeTake(overrides: Partial<Take>): Take {
  return {
    id: "take-x",
    songId: "song-x",
    startedAt: "2026-07-20T08:00:00.000Z",
    endedAt: "2026-07-20T08:02:00.000Z",
    completion: "finished",
    breathScore: 50,
    longestHoldSec: 5,
    isPersonalRecord: false,
    sigilSeed: 1,
    phrases: [{ phraseId: "p1", heldSec: 5, steadiness: 0.6, decaySlope: -0.1, recoverySec: 4 }],
    ...overrides,
  };
}

describe("scorePhrase", () => {
  it("reports zero for frames with no voicing at all", () => {
    const frames = framesFrom("silence");
    const result = scorePhrase(frames, "p1");
    expect(result.heldSec).toBe(0);
    expect(result.steadiness).toBe(0);
  });

  it("measures the steady-12s hold at close to its authored 12 seconds", () => {
    const frames = framesFrom("steady-12s");
    const result = scorePhrase(frames, "p1");
    expect(result.heldSec).toBeGreaterThan(11.5);
    expect(result.heldSec).toBeLessThan(12.5);
  });

  it("measures the ragged-7s hold at close to its authored 7 seconds", () => {
    const frames = framesFrom("ragged-7s");
    const result = scorePhrase(frames, "p1");
    expect(result.heldSec).toBeGreaterThan(6.5);
    expect(result.heldSec).toBeLessThan(7.5);
  });

  it("scores steady-12s as clearly steadier than ragged-7s", () => {
    const steady = scorePhrase(framesFrom("steady-12s"), "p1");
    const ragged = scorePhrase(framesFrom("ragged-7s"), "p1");
    expect(steady.steadiness).toBeGreaterThan(ragged.steadiness + 0.2);
  });

  it("gives ragged-7s a more negative decay slope than steady-12s", () => {
    const steady = scorePhrase(framesFrom("steady-12s"), "p1");
    const ragged = scorePhrase(framesFrom("ragged-7s"), "p1");
    expect(ragged.decaySlope).toBeLessThan(steady.decaySlope);
  });

  it("produces a 0..1 envelope roughly matching heldSec at 10Hz", () => {
    const result = scorePhrase(framesFrom("short-3s"), "p1");
    expect(result.envelope).toBeDefined();
    expect(result.envelope!.length).toBeGreaterThan(0);
    for (const v of result.envelope!) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(result.envelope!.length - result.heldSec * 10)).toBeLessThan(3);
  });

  it("records recoverySec from trailing silence", () => {
    const frames = framesFrom("short-3s");
    const result = scorePhrase(frames, "p1");
    expect(result.recoverySec).toBeGreaterThan(0);
  });
});

describe("scoreTake", () => {
  it("scores steady-12s clearly higher than ragged-7s, all else equal", () => {
    const steadyPhrase = scorePhrase(framesFrom("steady-12s"), "p1");
    const raggedPhrase = scorePhrase(framesFrom("ragged-7s"), "p1");
    const steadyScore = scoreTake([steadyPhrase], PROFILE);
    const raggedScore = scoreTake([raggedPhrase], PROFILE);
    expect(steadyScore.breathScore).toBeGreaterThan(raggedScore.breathScore);
  });

  it("returns an integer 0..100", () => {
    const phrase = scorePhrase(framesFrom("steady-12s"), "p1");
    const { breathScore } = scoreTake([phrase], PROFILE);
    expect(Number.isInteger(breathScore)).toBe(true);
    expect(breathScore).toBeGreaterThanOrEqual(0);
    expect(breathScore).toBeLessThanOrEqual(100);
  });

  it("flags a personal record only when it beats the previous best", () => {
    const phrase = scorePhrase(framesFrom("steady-12s"), "p1");
    const beatsIt = scoreTake([phrase], PROFILE, phrase.heldSec - 1);
    const doesNotBeatIt = scoreTake([phrase], PROFILE, phrase.heldSec + 1);
    expect(beatsIt.isPersonalRecord).toBe(true);
    expect(doesNotBeatIt.isPersonalRecord).toBe(false);
  });

  it("treats a first-ever take (previousBestHoldSec 0) as a record", () => {
    const phrase = scorePhrase(framesFrom("short-3s"), "p1");
    expect(scoreTake([phrase], PROFILE).isPersonalRecord).toBe(true);
  });

  it("is deterministic — same phrases, same profile, same score every time", () => {
    const phrase = scorePhrase(framesFrom("steady-12s"), "p1");
    const a = scoreTake([phrase], PROFILE);
    const b = scoreTake([phrase], PROFILE);
    expect(a).toEqual(b);
  });
});

describe("describeTake", () => {
  it("has a first-session sentence when there's no previous take", () => {
    const take = makeTake({ isPersonalRecord: false });
    expect(describeTake(take, [])).toMatch(/first/i);
  });

  it("calls out a personal record", () => {
    const take = makeTake({ isPersonalRecord: true, longestHoldSec: 9 });
    const prior = makeTake({ id: "take-prior", longestHoldSec: 6, breathScore: 40 });
    expect(describeTake(take, [prior])).toMatch(/best|new ground/i);
  });

  it("credits a specific phrase when a session improves", () => {
    const prior = makeTake({
      id: "take-prior",
      breathScore: 40,
      longestHoldSec: 5,
      phrases: [
        { phraseId: "p1", heldSec: 5, steadiness: 0.6, decaySlope: -0.1, recoverySec: 4 },
        { phraseId: "p2", heldSec: 4, steadiness: 0.5, decaySlope: -0.1, recoverySec: 4 },
      ],
    });
    const take = makeTake({
      breathScore: 50,
      longestHoldSec: 5,
      isPersonalRecord: false,
      phrases: [
        { phraseId: "p1", heldSec: 5, steadiness: 0.6, decaySlope: -0.1, recoverySec: 4 },
        { phraseId: "p2", heldSec: 8, steadiness: 0.6, decaySlope: -0.1, recoverySec: 4 },
      ],
    });
    expect(describeTake(take, [prior])).toMatch(/longer|stretched/i);
  });

  it("never uses disappointed language for a shorter session", () => {
    const prior = makeTake({ id: "take-prior", breathScore: 60, longestHoldSec: 8 });
    const take = makeTake({ breathScore: 45, longestHoldSec: 4, isPersonalRecord: false });
    const sentence = describeTake(take, [prior]);
    expect(sentence).not.toMatch(/fail|worse|bad|disappoint|missed/i);
  });

  it("is deterministic for the same take", () => {
    const take = makeTake({});
    expect(describeTake(take, [])).toBe(describeTake(take, []));
  });
});
