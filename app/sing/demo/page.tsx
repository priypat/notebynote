import { SingDemoScreen } from "./SingDemoScreen";
import { resolveDemoFixture } from "./demoContent";

export default async function SingDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const { fixture } = await searchParams;
  return <SingDemoScreen fixtureName={resolveDemoFixture(fixture)} />;
}
