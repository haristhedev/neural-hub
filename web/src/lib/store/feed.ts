import { create } from "zustand";
import type { Hex } from "viem";

export interface FeedItem {
  id: string;
  kind: "usage" | "license" | "revenue" | "claim" | "credits" | "model" | "transfer";
  text: string;
  hash: Hex;
  at: number;
}

interface FeedState {
  items: FeedItem[];
  push: (i: Omit<FeedItem, "id" | "at">) => void;
  clear: () => void;
}

/** Rolling buffer of live on-chain events — drives the ticker and the console's live meter. */
export const useFeed = create<FeedState>((set) => ({
  items: [],
  push: (i) =>
    set((s) => {
      const id = `${i.hash}:${i.kind}:${i.text}`;
      if (s.items.some((x) => x.id === id)) return s;
      return { items: [{ ...i, id, at: Date.now() }, ...s.items].slice(0, 30) };
    }),
  clear: () => set({ items: [] }),
}));
