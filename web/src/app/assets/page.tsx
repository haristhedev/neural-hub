import type { Metadata } from "next";
import { Assets } from "@/features/assets/Assets";

export const metadata: Metadata = { title: "My assets" };
export default function AssetsPage() { return <Assets />; }
