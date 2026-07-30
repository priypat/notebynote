"use client";

/**
 * Persistent bottom navigation for the three hub screens — home, progress,
 * settings. Sing/results/welcome are focused, single-task flows and
 * deliberately don't get this chrome, same as the reference deck.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/progress", label: "Hills" },
  { href: "/settings", label: "You" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] border-t border-rule bg-surface"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-tap flex-1 items-center justify-center py-3 text-secondary ${
                active ? "font-medium text-ink" : "text-ink-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
