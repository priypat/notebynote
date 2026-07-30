import { notFound } from "next/navigation";
import { HomeOptions } from "./HomeOptions";

/**
 * 404s in a production build, same as every other /dev/* page — a dev
 * surface should never be reachable on a deployed demo.
 */

export const metadata = {
  title: "Home options — dev",
  robots: { index: false, follow: false },
};

export default function HomeOptionsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HomeOptions />;
}
