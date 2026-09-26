import { config } from "@/lib/config";
import { Header, Footer, UploadLink, Faq } from "@/components/product/shared";
import { Check } from "lucide-react";
import { price } from "@/lib/server";
import { money } from "@/lib/domain";
export const metadata = {
  title: "Pricing — One Report, One Payment",
  description:
    "Preview your P&L for free. One payment unlocks a PDF, Excel workbook, and transaction export. No subscription.",
  alternates: { canonical: "/pricing" },
};
export default function Page() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="content-hero wrap center">
          <span className="eyebrow">NO SUBSCRIPTION. NO SURPRISES.</span>
          <h1>One report. One payment.</h1>
          <p>Get a meaningful preview before spending a cent.</p>
        </section>
        <section className="pricing-alone wrap">
          <article className="price-card">
            <div className="price-top">
              <span>YOUR COMPLETE P&L</span>
              <span className="tag">One-time payment</span>
            </div>
            <div className="price">
              {money(price())}
              <span> one-time + applicable tax</span>
            </div>
            <p>Start free. Pay when you’re ready to download.</p>
            <ul>
              {[
                "Multiple bank statements",
                "Automatic categorization and editable review",
                "Summary and detailed P&L preview",
                "Professional PDF statement",
                "Excel workbook with transactions",
                "CSV transaction export",
              ].map((t) => (
                <li key={t}>
                  <Check size={18} />
                  {t}
                </li>
              ))}
            </ul>
            <UploadLink label="Create my P&L" />
            <small>No account or credit card required to start</small>
            <small>
              For transactions processed through Paddle, Paddle acts as the
              authorized reseller and Merchant of Record and handles payment
              processing and applicable transaction taxes under its{" "}
              <a href="https://www.paddle.com/legal/buyer-terms">
                Buyer Terms
              </a>
              .
            </small>
          </article>
          <div className="pricing-explainer">
            <h2>What counts as one report?</h2>
            <p>
              One report combines up to 24 statement files and 5,000
              transactions for one business and a selected period, in USD.
            </p>
            <h2>Can I correct my report?</h2>
            <p>
              Yes. Return to the transaction review, correct your categories,
              and regenerate the same report. Your payment remains attached to
              that report.
            </p>
            <h2>How long can I access it?</h2>
            <p>
              Anonymous reports are accessible in the same browser for up to{" "}
              {config.retentionDays} days. Download your files for longer-term
              storage. Deleting your data removes access to paid reports too.
            </p>
          </div>
        </section>
        <section className="section wrap content-faq">
          <h2>Before you get started</h2>
          <Faq />
        </section>
      </main>
      <Footer />
    </>
  );
}
