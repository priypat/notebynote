import { notFound } from "next/navigation";
import { AudioProbe } from "./AudioProbe";

/**
 * Dev-only engine probe at /dev/audio.
 *
 * 404s in a production build rather than being hidden behind a link, so it can
 * never be reached by someone poking at URLs on a deployed demo.
 */
export const metadata = {
  title: "Breath engine — dev",
  robots: { index: false, follow: false },
};

export default function DevAudioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AudioProbe />;
}
