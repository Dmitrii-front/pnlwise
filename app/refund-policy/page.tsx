import { config } from "@/lib/config";
import { Header, Footer, disclaimer } from "@/components/product/shared";
import { setting } from "@/lib/server";

export const metadata = {
  title: "Refund Policy",
  description: `Refund eligibility and support for ${config.name} digital Profit & Loss report purchases.`,
  alternates: { canonical: "/refund-policy" },
};

export default function Page() {
  const contact = setting("SUPPORT_EMAIL") || config.supportEmail;
  const operator = setting("LEGAL_OPERATOR_NAME") || config.operator;
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(config.priceCents / 100);

  return (
    <>
      <Header />
      <main id="main" className="wrap legal-page">
        <span className="eyebrow">REFUNDS</span>
        <h1>Refund Policy</h1>
        <p className="legal-date">Last updated September 16, 2026</p>
        <section>
          <h2>One-time digital purchase</h2>
          <p>
            {config.name} sells a one-time digital Profit &amp; Loss report for{" "}
            {price}. There is no subscription or recurring billing. The report
            is generated from the bank statements you upload, and the purchase
            unlocks its PDF, Excel, and CSV exports.
          </p>
        </section>
        <section>
          <h2>When to contact support</h2>
          <p>
            Contact <a href={`mailto:${contact}`}>{contact}</a> if you were
            charged more than once, experienced a payment error, cannot access
            your purchased exports, or a material technical failure prevented us
            from delivering the purchased report. Include your payment reference
            and a brief description of the issue. Do not email bank statements
            or card details.
          </p>
        </section>
        <section>
          <h2>How refund requests are handled</h2>
          <p>
            Paddle is our Merchant of Record and payment provider. {operator}{" "}
            and Paddle review eligible requests under this policy, Paddle&apos;s
            obligations, and applicable law. Approved refunds are returned
            through the original payment method where possible.
          </p>
          <p>
            Because each report is a digital product generated from your
            uploaded data, successful generation and access to the purchased
            exports normally complete delivery. Disagreement with a transaction
            category or accounting interpretation after delivery does not, by
            itself, guarantee a refund. You can review and edit categories
            before generating the report. This policy does not limit any rights
            you have under applicable law.
          </p>
        </section>
        <section>
          <h2>Professional limitations</h2>
          <p>{disclaimer}</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
