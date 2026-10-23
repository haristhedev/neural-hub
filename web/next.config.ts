import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // wallet-signing UIs must never be framed (clickjacking)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    // Script/style/connect directives are intentionally omitted here: wallet SDKs and RPC endpoints are
    // configurable per deployment, so a nonce-based policy belongs in middleware for production.
    value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config) {
    // optional peer deps of wallet SDKs that are not used in the browser
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // `wagmi/connectors` is a single barrel that statically references every vendor SDK. We only instantiate
    // `injected` (EIP-6963) and `walletConnect`, so stub the others out instead of bundling ~MBs of dead code.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/wallet-sdk": false,
      "cbw-sdk": false,
      "@gemini-wallet/core": false,
      "@metamask/sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@safe-global/safe-apps-sdk": false,
      porto: false,
      "porto/internal": false,
    };
    return config;
  },
};

export default nextConfig;
