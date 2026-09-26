import { config } from "@/lib/config";
import { Header, Footer } from "@/components/product/shared";
import { DeleteData } from "@/components/product/session";
import { operationalIdentity } from "@/lib/server";
export const metadata = {
  title: "Privacy Policy",
  description: `How ${config.name} collects, uses, retains, and deletes uploaded statement data and payment records.`,
  alternates: { canonical: "/privacy" },
};
export default function Page() {
  const identity = operationalIdentity();
  return (
    <>
      <Header />
      <main id="main" className="wrap legal-page">
        <span className="eyebrow">PRIVACY</span>
        <h1>Privacy Policy</h1>
        <p className="legal-date">Last updated September 26, 2026</p>
        {!identity.configured && (
          <p className="info-box">
            Preview service: commercial operator and support details are still
            being configured. Payment is not available until launch
            configuration is complete.
          </p>
        )}
        <section>
          <h2>Information we process</h2>
          <p>
            We process the statement files you upload, the business name and
            type you provide, reporting dates, extracted transaction
            descriptions and amounts, categories, and your review decisions. A
            session cookie identifies your browser. We do not request your bank
            password or login credentials.
          </p>
          <p>
            Browser local storage may retain upload-form details such as your
            business type and name, reporting dates, account choice or label,
            and amount convention. It may also retain a short history of
            business-name values for form convenience. This browser storage is
            separate from cookies.
          </p>
        </section>
        <section>
          <h2>How we use the information</h2>
          <p>
            We use it to parse statements, organize transactions, calculate and
            display reports, verify purchases, and provide downloads. Where AI
            categorization is enabled, OpenAI receives selected transaction
            context to suggest categories. Raw source documents are not sent to
            OpenAI. Requests use <code>store: false</code>, which avoids storing
            response application state but does not by itself enable Zero Data
            Retention. OpenAI may process submitted context and related metadata
            under its current{" "}
            <a href="https://developers.openai.com/api/docs/guides/your-data">
              API data controls
            </a>
            , including abuse monitoring. If you opt into account creation,
            Supabase Auth handles email magic links or Google sign-in. The
            verified account ID links your reports across browser sessions.
            Paddle handles checkout and card details for Paddle transactions.
          </p>
        </section>
        <section>
          <h2>Storage and retention</h2>
          <p>
            Raw uploaded source-file contents are handled in server memory and
            are not retained after parsing. Extracted transactions and report
            data are stored in a private database for the report lifetime.
            Limited file-derived metadata may remain with the report, including
            a sanitized filename, file format, file hash, account metadata, and
            row count where available. Anonymous report access expires after{" "}
            {config.retentionDays} days by default. Expired records are removed
            in bounded batches when a new report is started or when the daily
            maintenance cleanup runs; access expiry and physical deletion are
            separate events. Active or incomplete payment processing can
            temporarily prevent deletion or cleanup where needed to preserve
            transaction integrity. Ordinary analytics are retained for 90 days.
            Payment and accounting records may be retained separately for
            accounting, disputes, and applicable obligations.
          </p>
        </section>
        <section>
          <h2>Analytics and errors</h2>
          <p>
            We record product events such as upload completion, report
            generation, and downloads. Metadata may include file format,
            transaction count, business type, and the page used to start. We do
            not send transaction descriptions, bank statement contents, business
            names, or card details to analytics. Operational and server errors
            may be sent to Sentry as intentionally restricted, sanitized
            application diagnostics. Pnlwise does not enable Sentry Session
            Replay. Sentry and the network path may still process ordinary
            network metadata; diagnostics do not promise the absence of such
            metadata. Within the application, request addresses are converted
            into short-lived hashed identifiers for rate limits.
          </p>
        </section>
        <section>
          <h2>Your choices</h2>
          <p>
            You can stop before payment, change categories, and delete your
            session’s report data. Deletion removes statements, transactions,
            and reports associated with the session, including paid reports. It
            does not erase the separate payment provider record. An active or
            incomplete Paddle payment may need to be resolved before server
            deletion can finish. After successful server deletion, Pnlwise also
            clears its saved upload-form details and business-name history from
            this browser. Download any files you want to retain before deleting.
          </p>
          <DeleteData />
        </section>
        <section>
          <h2>Service providers</h2>
          <p>
            Cloudflare Workers runs the application and Cloudflare D1 stores
            application data. Cloudflare processes infrastructure and network
            request metadata needed to provide those services; Pnlwise&apos;s own
            rate-limit records use the short-lived hashed identifiers described
            above. For transactions processed through Paddle, Pnlwise supplies
            the product service and Paddle acts as the authorized reseller and
            Merchant of Record, handling payment processing and applicable
            transaction taxes under its{" "}
            <a href="https://www.paddle.com/legal/buyer-terms">Buyer Terms</a>{" "}
            and{" "}
            <a href="https://www.paddle.com/legal/privacy">Privacy Notice</a>.
            OpenAI is used only when AI categorization is configured. Sentry is
            used for restricted operational error monitoring. Providers process
            information under their own terms and applicable data-processing
            arrangements. This service does not sell uploaded statements or use
            them for advertising.
          </p>
        </section>
        <section>
          <h2>Contact</h2>
          {identity.configured ? (
            <p>
              For privacy requests, contact{" "}
              <a href={`mailto:${identity.supportEmail}`}>
                {identity.supportEmail}
              </a>
              . Operator: {identity.operator}.
            </p>
          ) : (
            <p>
              For this private preview, contact the person who shared access
              with you. Public support and operator information must be added
              before commercial launch.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
