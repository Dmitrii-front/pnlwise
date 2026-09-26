import type { NextConfig } from "next";
const antiFramingHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];
const noIndexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/",
        headers: [
          ...antiFramingHeaders,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          ...antiFramingHeaders,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        source: "/report/:path*",
        headers: [
          ...noIndexHeaders,
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/generate",
        headers: noIndexHeaders,
      },
      {
        source: "/generate/:path*",
        headers: noIndexHeaders,
      },
      {
        source: "/checkout",
        headers: noIndexHeaders,
      },
      {
        source: "/checkout/:path*",
        headers: noIndexHeaders,
      },
      {
        source: "/sign-in",
        headers: noIndexHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/pnl",
        destination: "/bank-statement-to-pnl",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
