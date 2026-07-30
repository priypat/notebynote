/**
 * Fixture integrity check. Run with `npm run check:fixtures`.
 *
 * The seeded data is hand-authored, which means it can drift out of agreement
 * with itself in ways TypeScript cannot see: a phrase result pointing at a
 * phrase id that doesn't exist, a longestHoldSec that isn't the longest hold, an
 * isPersonalRecord flag that contradicts the take before it. Those produce a
 * demo that looks fine and charts wrong. This asserts the invariants instead.
 */

import { MOCK_SONGS } from "../lib/mock/songs";
import { MOCK_TAKES } from "../lib/mock/takes";
import { MOCK_PROFILE } from "../lib/mock/profile";

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// --- songs -----------------------------------------------------------------
for (const song of MOCK_SONGS) {
  const where = `song "${song.title}"`;

  const longest = Math.max(...song.phrases.map((p) => p.targetHoldSec));
  if (song.longestHoldSec !== longest) {
    fail(`${where}: longestHoldSec is ${song.longestHoldSec}, phrases say ${longest}`);
  }

  const ids = new Set(song.phrases.map((p) => p.id));
  if (ids.size !== song.phrases.length) fail(`${where}: duplicate phrase ids`);

  let prevEnd = 0;
  for (const p of song.phrases) {
    const at = `${where} phrase ${p.id}`;
    if (p.startSec >= p.endSec) fail(`${at}: startSec >= endSec`);
    if (p.startSec < prevEnd) fail(`${at}: overlaps the previous phrase`);
    if (p.endSec > song.durationSec) fail(`${at}: endSec past durationSec`);
    if (p.targetHoldSec <= 0) fail(`${at}: targetHoldSec must be positive`);
    if (p.holdStartSec < p.startSec || p.holdStartSec >= p.endSec) {
      fail(`${at}: holdStartSec ${p.holdStartSec} outside the phrase`);
    }
    if (p.holdStartSec + p.targetHoldSec > p.endSec + 1e-9) {
      fail(`${at}: the hold runs past endSec`);
    }
    // The rest between phrases has to be long enough to breathe in.
    if (prevEnd > 0 && p.startSec - prevEnd < 1.5) {
      fail(`${at}: only ${(p.startSec - prevEnd).toFixed(1)}s of rest before it`);
    }
    if (p.lyric !== p.lyric.trim() || p.lyric.length === 0) {
      fail(`${at}: lyric is empty or has stray whitespace`);
    }
    prevEnd = p.endSec;
  }
}

// Difficulty bands must actually be ordered by hold length.
const byDifficulty = ["gentle", "steady", "reaching"] as const;
const holds = byDifficulty.map((d) => {
  const s = MOCK_SONGS.find((x) => x.difficulty === d);
  if (!s) fail(`no song with difficulty "${d}"`);
  return s?.longestHoldSec ?? 0;
});
if (!(holds[0] < holds[1] && holds[1] < holds[2])) {
  fail(`difficulty bands not ordered by hold length: ${holds.join(" < ")}`);
}

// --- takes -----------------------------------------------------------------
let runningBest = 0;
let prevStart = "";

for (const take of MOCK_TAKES) {
  const where = `take ${take.id}`;
  const song = MOCK_SONGS.find((s) => s.id === take.songId);

  if (!song) {
    fail(`${where}: unknown songId "${take.songId}"`);
    continue;
  }

  if (take.startedAt <= prevStart) fail(`${where}: not in chronological order`);
  prevStart = take.startedAt;
  if (take.endedAt <= take.startedAt) fail(`${where}: endedAt before startedAt`);

  if (take.phrases.length === 0) fail(`${where}: no phrase results`);

  const songPhraseIds = song.phrases.map((p) => p.id);
  for (const r of take.phrases) {
    const at = `${where} result ${r.phraseId}`;
    if (!songPhraseIds.includes(r.phraseId)) {
      fail(`${at}: no such phrase in "${song.title}"`);
    }
    if (r.heldSec < 0) fail(`${at}: negative heldSec`);
    if (r.steadiness < 0 || r.steadiness > 1) fail(`${at}: steadiness outside 0..1`);
    if (r.decaySlope > 0) fail(`${at}: positive decaySlope (breath got louder?)`);
    if (r.recoverySec <= 0) fail(`${at}: recoverySec must be positive`);
    if (r.envelope) {
      const expected = Math.round(r.heldSec * 10);
      if (Math.abs(r.envelope.length - expected) > 1) {
        fail(`${at}: envelope is ${r.envelope.length} samples, expected ~${expected}`);
      }
      if (r.envelope.some((v) => v < 0 || v > 1)) {
        fail(`${at}: envelope has values outside 0..1`);
      }
    }
  }

  // Results must be in song order, and a partial take is a prefix — you cannot
  // skip phrase 2 and sing phrase 3.
  const order = take.phrases.map((r) => songPhraseIds.indexOf(r.phraseId));
  if (order.some((v, i) => v !== i)) {
    fail(`${where}: results are not a leading run of the song's phrases`);
  }

  const finished = take.phrases.length === song.phrases.length;
  if (finished && take.completion !== "finished") {
    fail(`${where}: all phrases present but marked "${take.completion}"`);
  }
  if (!finished && take.completion === "finished") {
    fail(`${where}: only ${take.phrases.length}/${song.phrases.length} phrases but marked finished`);
  }

  const longest = Math.max(...take.phrases.map((p) => p.heldSec));
  if (Math.abs(take.longestHoldSec - longest) > 1e-9) {
    fail(`${where}: longestHoldSec is ${take.longestHoldSec}, phrases say ${longest}`);
  }

  const shouldBePR = longest > runningBest;
  if (take.isPersonalRecord !== shouldBePR) {
    fail(
      `${where}: isPersonalRecord is ${take.isPersonalRecord} but longest ${longest} vs prior best ${runningBest}`,
    );
  }
  runningBest = Math.max(runningBest, longest);

  if (take.breathScore < 0 || take.breathScore > 100) {
    fail(`${where}: breathScore ${take.breathScore} outside 0..100`);
  }
  if (!Number.isInteger(take.breathScore)) {
    fail(`${where}: breathScore ${take.breathScore} is not an integer`);
  }

  // Holds should shorten across a session — support fatigues.
  const held = take.phrases.map((p) => p.heldSec);
  if (held[held.length - 1] > held[0]) {
    fail(`${where}: last hold (${held[held.length - 1]}s) beats the first (${held[0]}s)`);
  }
}

// The history has to be a story, not a line: overall gains, with real setbacks.
const scores = MOCK_TAKES.map((t) => t.breathScore);
if (scores[scores.length - 1] <= scores[0]) fail("history shows no net improvement");

// Small dips are noise and expected. An off day is a pronounced one — a drop of
// five or more points against the running best. Those are the takes the
// progress screen has to be kind about, so the fixture must contain some.
const offDays = MOCK_TAKES.filter((t, i) => {
  if (i === 0) return false;
  const bestBefore = Math.max(...scores.slice(0, i));
  return bestBefore - t.breathScore >= 5;
});
if (offDays.length < 2) {
  fail(`only ${offDays.length} pronounced off day(s) — the fixture needs at least two`);
}
if (!offDays.every((t) => t.completion === "stopped-early")) {
  fail("an off day was not stopped early — a bad session usually ends early");
}

// --- profile ---------------------------------------------------------------
if (MOCK_PROFILE.baselineMptSec <= 0 || MOCK_PROFILE.baselineMptSec > 45) {
  fail(`profile: implausible baselineMptSec ${MOCK_PROFILE.baselineMptSec}`);
}
if (MOCK_PROFILE.createdAt > MOCK_TAKES[0].startedAt) {
  fail("profile: created after its own first take");
}
const bestEver = Math.max(...MOCK_TAKES.map((t) => t.longestHoldSec));
if (bestEver > MOCK_PROFILE.baselineMptSec) {
  fail(
    `profile: a sung hold (${bestEver}s) beats the baseline MPT (${MOCK_PROFILE.baselineMptSec}s) — sustaining a lyric is harder than sustaining a tone, so this is backwards`,
  );
}

// --- report ----------------------------------------------------------------
if (problems.length > 0) {
  console.error(`✗ ${problems.length} fixture problem(s):\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  `✓ fixtures consistent — ${MOCK_SONGS.length} songs, ${MOCK_TAKES.length} takes\n` +
    `  scores      ${scores.join(" → ")}\n` +
    `  off days    ${offDays.map((t) => t.id).join(", ")}\n` +
    `  records     ${MOCK_TAKES.filter((t) => t.isPersonalRecord).map((t) => t.id).join(", ")}`,
);
