import { config } from "@/lib/config";
import { Header, Footer, disclaimer } from "@/components/product/shared";
import { socialMetadata } from "@/components/product/seo";
import { operationalIdentity } from "@/lib/server";

const title = "Refund Policy";
const description = `Refund eligibility and support for ${config.name} digital Profit & Loss report purchases.`;
export const metadata = {
  title,
  description,
  alternates: { canonical: "/refund-policy" },
  ...socialMetadata(title, description, "/refund-policy"),
};

export default function Page() {
  const identity = operationalIdentity();
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
        <p className="legal-date">Last updated September 26, 2026</p>
        {!identity.configured && (
          <p className="info-box">
            Payment and public support are unavailable until the service
            operator and support contact are configured.
          </p>
        )}
        <section>
          <h2>One-time digital purchase</h2>
          <p>
            {config.name} supplies and operates a digital Profit &amp; Loss
            report service. For transactions processed through Paddle, Paddle
            acts as the authorized reseller and Merchant of Record. The base
            price is {price}, plus applicable transaction taxes handled by
            Paddle under its terms. There is no subscription or recurring
            billing. The report is generated from the bank statements you
            upload, and the purchase unlocks its PDF, Excel, and CSV exports.
          </p>
        </section>
        <section>
          <h2>When to contact support</h2>
          {identity.configured ? (
            <p>
              Contact{" "}
              <a href={`mailto:${identity.supportEmail}`}>
                {identity.supportEmail}
              </a>{" "}
              if you cannot access purchased exports or a product or delivery
              issue needs investigation. For payment, duplicate-charge, and
              refund help, you may also use Paddle&apos;s{" "}
              <a href="https://paddle.net/">Buyer Support</a>. Include your
              payment reference and a brief description of the issue. Do not
              email bank statements or card details.
            </p>
          ) : (
            <p>
              Public support contact details are pending operational
              configuration. Payment remains unavailable until they are set.
            </p>
          )}
        </section>
        <section>
          <h2>How refund requests are handled</h2>
          <p>
            Pnlwise support may investigate report generation, access, and
            delivery issues. Paddle, as the authorized reseller and Merchant of
            Record, processes refunds for Paddle transactions under the{" "}
            <a href="https://www.paddle.com/legal/buyer-terms">Buyer Terms</a>{" "}
            and{" "}
            <a href="https://www.paddle.com/legal/refund-policy">
              Paddle Refund Policy
            </a>
            . Buyers may submit a request through{" "}
            <a href="https://paddle.net/">Paddle Buyer Support</a>. Paddle
            explains its handling of personal information in its{" "}
            <a href="https://www.paddle.com/legal/privacy">Privacy Notice</a>.
          </p>
          <p>
            Because each report is a digital product generated from your
            uploaded data, successful generation and access to the purchased
            exports normally complete delivery. Disagreement with a transaction
            category or accounting interpretation after delivery does not, by
            itself, guarantee a refund. You can review and edit categories
            before generating the report. Neither this policy nor the use of a
            digital product waives mandatory consumer rights.
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
