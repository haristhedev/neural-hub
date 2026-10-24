import type { Metadata } from "next";
import { Suspense } from "react";
import { Explore } from "@/features/explore/Explore";

export const metadata: Metadata = { title: "Explore models" };

export default function ExplorePage() {
  return <Suspense><Explore /></Suspense>;
}
