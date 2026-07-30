import { parseSource } from "../sing/lyricHelpers";
import { WelcomeScreen } from "./WelcomeScreen";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; step?: string }>;
}) {
  const { source, step } = await searchParams;
  // ?step=calibrate — a returning person re-measuring from Settings doesn't
  // need the "what is this app" intros again.
  const initialStep = step === "calibrate" ? "calibrate" : "intro1";
  return <WelcomeScreen source={parseSource(source)} initialStep={initialStep} />;
}
