import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
