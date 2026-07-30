import { notFound } from "next/navigation";
import { MOCK_SONGS } from "@/lib/mock/songs";
import { parseSource } from "../lyricHelpers";
import { SingScreen } from "./SingScreen";

export default async function SingPage({
  params,
  searchParams,
}: {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { songId } = await params;
  const { source } = await searchParams;

  const song = MOCK_SONGS.find((s) => s.id === songId);
  if (!song) notFound();

  return <SingScreen song={song} source={parseSource(source)} />;
}
