import type { Metadata } from "next";
import { Suspense } from "react";
import { Console } from "@/features/console/Console";

export const metadata: Metadata = { title: "API console" };
export default function ConsolePage() {
  return <Suspense fallback={null}><Console /></Suspense>;
}
