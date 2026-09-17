import { config } from "@/lib/config";
import { Header, Footer, disclaimer } from "@/components/product/shared";
import { setting } from "@/lib/server";
export const metadata = {
  title: "Terms of Service",
  description: `Terms for creating estimated financial reports with ${config.name}, including your review responsibilities, payments, and report limitations.`,
  alternates: { canonical: "/terms" },
};
export default function Page() {
  const contact = setting("SUPPORT_EMAIL") || config.supportEmail;
  return (
    <>
      <Header />
      <main id="main" className="wrap legal-page">
        <span className="eyebrow">TERMS</span>
        <h1>Terms of Service</h1>
        <p className="legal-date">Last updated September 16, 2026</p>
        {!contact && (
          <p className="info-box">
            These terms describe the preview service. Operator, support, and
            commercial launch details must be completed before accepting
            payments.
          </p>
        )}
        <section>
          <h2>The service</h2>
          <p>
            {config.name} organizes uploaded bank transactions into an estimated
            cash-basis Profit & Loss statement. The service is intended for
            people who are authorized to use the records they upload. It does
            not connect to bank accounts or provide bookkeeping, tax filing,
            audit, lending, or advisory services.
          </p>
        </section>
        <section>
          <h2>Your responsibility to review</h2>
          <p>
            You are responsible for providing complete, accurate records and for
            reviewing all categories and exclusions before relying on a report.
            Automated classification may be wrong. Statements may omit relevant
            accounts, cash activity, non-cash adjustments, and other accounting
            information. A report is limited to the data and period you provide.
          </p>
        </section>
        <section>
          <h2>Professional limitations</h2>
          <p>{disclaimer}</p>
          <p>
            We do not claim that reports are CPA-certified, IRS-approved,
            audited, or accepted by any lender or other recipient.
          </p>
        </section>
        <section>
          <h2>Preview, purchase, and access</h2>
          <p>
            Report previews are free. The base price shown is a one-time payment
            for the downloadable versions of that report. Paddle may add
            applicable tax at checkout. There is no recurring subscription.
            Downloads unlock after payment verification. Keep your downloaded
            files; clearing your session cookie or deleting report data may
            remove your access.
          </p>
        </section>
        <section>
          <h2>Corrections, refunds, and support</h2>
          <p>
            You can edit categories and regenerate the same report while it
            remains available. Refund eligibility, payment errors, duplicate
            charges, and delivery problems are covered by our{" "}
            <a href="/refund-policy">Refund Policy</a>. Rights that apply under
            law are not waived by these terms.
          </p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <p>
            Only upload records you have authority to process. Do not use the
            service to create deceptive financial statements, bypass access
            controls, upload malicious files, or interfere with other users.
            Service limits protect processing availability and data integrity.
          </p>
        </section>
        <section>
          <h2>Operator and contact</h2>
          {contact ? (
            <p>
              {setting("LEGAL_OPERATOR_NAME") || config.operator} ·{" "}
              <a href={`mailto:${contact}`}>{contact}</a>
            </p>
          ) : (
            <p>
              The operator and public support address are pending launch
              configuration. Contact the person who provided access to this
              private preview.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
