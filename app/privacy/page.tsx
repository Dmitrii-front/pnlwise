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
        <p className="legal-date">Last updated September 13, 2026</p>
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
        </section>
        <section>
          <h2>How we use the information</h2>
          <p>
            We use it to parse statements, organize transactions, calculate and
            display reports, verify purchases, and provide downloads. Where AI
            categorization is enabled, OpenAI receives selected transaction
            context to suggest categories. If you opt into account creation,
            Supabase Auth handles email magic links or Google sign-in. The
            verified account ID links your reports across browser sessions.
            Source documents are not sent to the categorization service. Paddle
            processes checkout and card details.
          </p>
        </section>
        <section>
          <h2>Storage and retention</h2>
          <p>
            Source files are handled in server memory and discarded at the end
            of the upload request. Successfully parsed transactions and reports
            are stored in a private database. Anonymous report access expires
            after {config.retentionDays} days by default. Expired records are
            removed in bounded batches when a new report is started or when the
            maintenance cleanup runs; access expiry and physical deletion are
            separate events. Payment records may be retained for accounting,
            disputes, and applicable legal obligations.
          </p>
        </section>
        <section>
          <h2>Analytics and errors</h2>
          <p>
            We record product events such as upload completion, report
            generation, and downloads. Metadata may include file format,
            transaction count, business type, and the page used to start. We do
            not send transaction descriptions, bank statement contents, business
            names, or card details to analytics. Error diagnostics use error
            types rather than raw uploaded data. Request addresses are hashed
            for short-term rate limits.
          </p>
        </section>
        <section>
          <h2>Your choices</h2>
          <p>
            You can stop before payment, change categories, and delete your
            session’s report data. Deletion removes statements, transactions,
            and reports associated with the session, including paid reports. It
            does not erase the separate payment provider record. Download any
            files you want to retain before deleting.
          </p>
          <DeleteData />
        </section>
        <section>
          <h2>Service providers</h2>
          <p>
            The hosted application and database run on Cloudflare infrastructure
            through Sites. Paddle handles payments. OpenAI is used only when AI
            categorization is configured. Providers process information under
            their own terms and applicable data-processing arrangements. This
            service does not sell uploaded statements or use them for
            advertising.
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
