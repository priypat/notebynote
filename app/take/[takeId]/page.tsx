import { notFound } from "next/navigation";
import { MOCK_TAKES, mockTakeWithEnvelopes } from "@/lib/mock/takes";
import { MOCK_SONGS } from "@/lib/mock/songs";
import { describeTake } from "@/lib/scoring/breathScore";
import { ResultsScreen } from "./ResultsScreen";

export default async function TakePage({
  params,
}: {
  params: Promise<{ takeId: string }>;
}) {
  const { takeId } = await params;
  const take = mockTakeWithEnvelopes(takeId);
  if (!take) notFound();

  const previous = MOCK_TAKES.filter(
    (t) => t.id !== take.id && t.startedAt < take.startedAt,
  );
  const sentence = describeTake(take, previous);
  const song = MOCK_SONGS.find((s) => s.id === take.songId);

  return (
    <ResultsScreen
      take={take}
      sentence={sentence}
      songTitle={song?.title ?? ""}
      hueSeed={song?.motifSeed ?? 0}
    />
  );
}
