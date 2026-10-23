import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; GSAP's ScrollTrigger / matchMedia need it at import time.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
