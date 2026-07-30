export default function SingLoading() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-[560px] flex-col items-center justify-center gap-4 text-center">
      <div className="size-16 animate-pulse rounded-full bg-dawn-mist" />
      <p className="text-secondary text-ink-muted">Finding your song&hellip;</p>
    </div>
  );
}
