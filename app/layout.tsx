import { config } from "@/lib/config";
import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@/components/product/analytics";
import { WebMcp } from "@/components/product/webmcp";
const origin = config.siteUrl;
export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: `${config.name} — Turn Bank Statements Into a P&L`,
    template: `%s | ${config.name}`,
  },
  description: `Upload PDF, CSV or Excel bank statements. Review your transactions and generate a clear Profit & Loss statement. Free preview. $${(config.priceCents / 100).toFixed(2)} to download.`,
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: `${config.name} — Bank statements to P&L`,
    description: `Your bank statements. A clear P&L. Preview free, download for $${(config.priceCents / 100).toFixed(2)}.`,
    type: "website",
  },
  twitter: { card: "summary" },
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
