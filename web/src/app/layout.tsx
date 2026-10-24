import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { wagmiConfig } from "@/lib/web3/config";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: { default: "NeuralHub — own, deploy and monetize AI models", template: "%s · NeuralHub" },
  description: "Decentralized AI model marketplace: ERC-721 model identity, ERC-1155 licenses, ERC-20 payments and verifiable pay-per-use metering.",
};
export const viewport: Viewport = { themeColor: "#06070d", colorScheme: "dark" };

// Adds `js-motion` (enables the no-flash pre-hide for GSAP reveals) and a 5s failsafe if motion never boots.
const bootScript = `document.documentElement.classList.add('js-motion');setTimeout(function(){if(!document.documentElement.dataset.gsap)document.documentElement.classList.add('motion-failsafe')},5000)`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = cookieToInitialState(wagmiConfig, (await headers()).get("cookie"));
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: bootScript }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2">Skip to content</a>
        <Providers initialState={initialState}>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
