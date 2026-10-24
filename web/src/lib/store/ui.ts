import { create } from "zustand";
import type { Hex } from "viem";

export type ToastKind = "success" | "error" | "info" | "pending";
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  hash?: Hex;
  chainId?: number;
}

export interface ExploreFilters {
  query: string;
  category: number | null;
  maxPrice: number; // USD, commercial tier
  sort: "popular" | "price-asc" | "price-desc" | "newest";
  licensedOnly: boolean;
}

interface UiState {
  walletModalOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;

  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id"> & { id?: string }) => string;
  dismissToast: (id: string) => void;

  filters: ExploreFilters;
  setFilters: (patch: Partial<ExploreFilters>) => void;
  resetFilters: () => void;
}

export const DEFAULT_FILTERS: ExploreFilters = { query: "", category: null, maxPrice: 5_000, sort: "popular", licensedOnly: false };

let toastSeq = 0;

/**
 * UI-only state lives here (zustand). Anything that comes from the chain or the server is TanStack Query's job —
 * keeping the two apart is what keeps state management maintainable as the surface grows.
 */
export const useUi = create<UiState>((set) => ({
  walletModalOpen: false,
  openWalletModal: () => set({ walletModalOpen: true }),
  closeWalletModal: () => set({ walletModalOpen: false }),

  toasts: [],
  pushToast: (t) => {
    const id = t.id ?? `t${++toastSeq}`;
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), { ...t, id }].slice(-4) }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  filters: DEFAULT_FILTERS,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
