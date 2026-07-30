import { ResultsScreen } from "./ResultsScreen";

export default async function TakePage({
  params,
}: {
  params: Promise<{ takeId: string }>;
}) {
  const { takeId } = await params;
  // Defensive: a takeId can arrive percent-encoded depending on how the
  // navigation happened. decodeURIComponent is a no-op on an already-plain
  // string, so this is safe either way.
  return <ResultsScreen takeId={decodeURIComponent(takeId)} />;
}
