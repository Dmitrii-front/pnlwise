import { config } from "@/lib/config";
import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@/components/product/analytics";
import { WebMcp } from "@/components/product/webmcp";
import { siteOrigin, socialMetadata } from "@/components/product/seo";
const homeTitle = `${config.name} — Turn Bank Statements Into a P&L`;
const homeDescription =
  "Upload PDF, CSV or Excel bank statements. Review transactions and generate a clear Profit & Loss statement. Free preview; $12.99 plus tax to download.";
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: homeTitle,
    template: `%s | ${config.name}`,
  },
  description: homeDescription,
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      {
        url: "/favicon.ico",
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48",
      },
    ],
    shortcut: "/favicon.ico",
  },
  ...socialMetadata(homeTitle, homeDescription, "/"),
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Analytics />
        <WebMcp />
      </body>
    </html>
  );
}
