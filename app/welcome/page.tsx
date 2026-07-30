import { parseSource } from "../sing/lyricHelpers";
import { WelcomeScreen } from "./WelcomeScreen";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  return <WelcomeScreen source={parseSource(source)} />;
}
