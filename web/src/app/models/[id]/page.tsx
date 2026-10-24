import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelDetail } from "@/features/models/ModelDetail";

export const metadata: Metadata = { title: "Model" };

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  return <ModelDetail id={n} />;
}
