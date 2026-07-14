import type { NextConfig } from "next";

// Security headers per SECURITY.md §7. CSP allows 'unsafe-inline' scripts for
// Next.js hydration (nonce-based CSP is flagged as debt in STATE.md).
// connect-src is limited to self, Supabase, PostHog and the Render backend.
// The local dev backend is only allowed in dev builds — it must never ship.
const isProd = process.env.NODE_ENV === "production";

const connectSrc = [
  "'self'",
  ...(isProd ? [] : ["http://localhost:8000"]),
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.posthog.com",
  "https://*.onrender.com",
].join(" ");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
