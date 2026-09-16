import { config } from "@/lib/config";
import { Header, Footer, UploadLink } from "@/components/product/shared";
export const metadata = {
  title: "Security & Data Handling",
  description: `Learn how ${config.name} handles statements, anonymous sessions, transaction data, payment verification, and deletion.`,
  alternates: { canonical: "/security" },
};
export default function Page() {
  return (
    <>
      <Header />
      <main id="main" className="wrap legal-page">
        <span className="eyebrow">YOUR DATA, HANDLED WITH CARE</span>
        <h1>Your banking password stays yours.</h1>
        <p className="intro">
          We process the files you choose. We never ask for bank credentials,
          connect to an account, or move your money.
        </p>
        <section>
          <h2>Source files are not retained</h2>
          <p>
            Uploads are read on the server and discarded after the request
            completes. Raw bank statements are not stored in a public bucket or
            made available through file URLs. If a statement cannot be parsed,
            no partial transaction data from that file is saved.
          </p>
        </section>
        <section>
          <h2>Reports belong to your session</h2>
          <p>
            A randomly generated, HttpOnly session cookie controls access to
            your normalized transactions and reports. Server-side checks apply
            to reading, editing, and exporting. Knowing a report URL is not
            enough to access another browser’s report.
          </p>
        </section>
        <section>
          <h2>Private transport and storage</h2>
          <p>
            The hosted service uses HTTPS. Normalized report data is stored in
            the service’s database and is returned only after an ownership
            check. Uploads are limited by size, type, row count, and request
            rate. Spreadsheet archives are checked for excessive expansion and
            unsupported active content.
          </p>
        </section>
        <section>
          <h2>Categorization with limited context</h2>
          <p>
            Deterministic merchant rules are applied first. When AI
            categorization is enabled, selected descriptions, amounts,
            directions, and business type are sent to OpenAI to suggest
            categories. Long number sequences are redacted. AI does not receive
            source files or calculate your totals.
          </p>
        </section>
        <section>
          <h2>Paddle handles payment details</h2>
          <p>
            Card details are entered in Paddle Checkout. A verified,
            signed payment webhook is required before exports unlock. A browser
            redirect or a payment-success URL cannot grant access.
          </p>
        </section>
        <section>
          <h2>Delete your report data</h2>
          <p>
            Use “Delete my data” from a report or review page to remove the
            reports and transactions in your session. Payment records are kept
            separately. See the <a href="/privacy">Privacy Policy</a> for
            retention details.
          </p>
        </section>
        <UploadLink />
      </main>
      <Footer />
    </>
  );
}
