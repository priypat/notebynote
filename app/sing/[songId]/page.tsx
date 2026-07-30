import { notFound } from "next/navigation";
import { ApiError, getSong } from "@/lib/api";
import { parseSource } from "../lyricHelpers";
import { SingScreen } from "./SingScreen";

export default async function SingPage({
  params,
  searchParams,
}: {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ source?: string; demo?: string }>;
}) {
  const { songId } = await params;
  const { source, demo } = await searchParams;

  let song;
  try {
    song = await getSong(songId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <SingScreen song={song} source={parseSource(source)} demo={demo === "1"} />;
}
