import { config } from "@/lib/config";
import {
  ArrowUpRight,
  Check,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Upload,
  ScanLine,
  Download,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header, Footer, Faq, UploadLink } from "@/components/product/shared";
import { JsonLd, siteOrigin } from "@/components/product/seo";
import { price } from "@/lib/server";
import { money } from "@/lib/domain";
export default function Home() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="mini-line" /> LESS PAPERWORK. MORE CLARITY.
            </span>
            <h1>
              Your bank statements.
              <br />A clear <span>P&L.</span>
            </h1>
            <p>
              Turn your bank statements into a Profit & Loss statement in
              minutes. Upload, review, and get back to business.
            </p>
            <div className="hero-actions">
              <UploadLink />
              <Button variant="outline" asChild>
                <a href="/report/sample">
                  View sample report <ArrowUpRight />
                </a>
              </Button>
            </div>
            <div className="file-types">
              <span>
                <FileText /> PDF
              </span>
              <span>
                <FileSpreadsheet /> CSV
              </span>
              <span>
                <FileSpreadsheet /> XLSX
              </span>
              <i /> No account needed
            </div>
            <p className="hero-trust">
              <LockKeyhole size={15} /> No bank login. No subscription. Preview
              for free.
            </p>
          </div>
          <div className="hero-report-area">
            <div className="report-decoration" aria-hidden="true" />
            <article className="sample-paper">
              <div className="paper-top">
                <span className="paper-logo">p/</span>
                <span>
                  SAMPLE REPORT <span className="small-dot" />
                </span>
              </div>
              <p className="paper-business">STUDIO NORTH, LLC</p>
              <h2>Profit & Loss Statement</h2>
              <p className="paper-period">
                January 1 – March 31, 2026 <span>USD</span>
              </p>
              <div className="paper-row">
                <span>Total revenue</span>
                <strong>$48,250.00</strong>
              </div>
              <div className="paper-row sub">
                <span>Cost of goods sold</span>
                <span>$6,400.00</span>
              </div>
              <div className="paper-row gross">
                <span>Gross profit</span>
                <strong>$41,850.00</strong>
              </div>
              <div className="paper-row">
                <span>Operating expenses</span>
                <strong>$12,680.00</strong>
              </div>
              <div className="paper-row sub">
                <span>Software & subscriptions</span>
                <span>$1,240.00</span>
              </div>
              <div className="paper-row sub">
                <span>Advertising & marketing</span>
                <span>$3,600.00</span>
              </div>
              <div className="paper-row sub">
                <span>Other operating expenses</span>
                <span>$7,840.00</span>
              </div>
              <div className="paper-net">
                <div>
                  <span>NET PROFIT</span>
                  <strong>$29,170.00</strong>
                </div>
                <span className="margin-pill">60.5% margin</span>
              </div>
              <div className="paper-bottom">
                <Check size={14} /> Your numbers, organized.{" "}
                <span>01 / 01</span>
              </div>
            </article>
            <div className="ready-stamp">
              <span>
                <Check size={19} />
              </span>
              <div>
                <strong>From statements to clarity</strong>
                <small>One simple, organized report</small>
              </div>
            </div>
          </div>
        </section>
        <section className="trust-strip">
          <div className="wrap">
            <span>Built for independent businesses</span>
            <strong>Self-employed</strong>
            <strong>Freelancers</strong>
            <strong>Contractors</strong>
            <strong>Small businesses</strong>
          </div>
        </section>
        <section className="section wrap" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THREE STEPS. THAT’S IT.</span>
              <h2>
                Less work between you
                <br />
                and your numbers.
              </h2>
            </div>
            <p>
              No accounting setup. No complicated software.
              <br />
              Just the statements you already have.
            </p>
          </div>
          <div className="steps-grid">
            {[
              {
                n: "01",
                icon: Upload,
                title: "Upload your statements",
                text: "Drop in one statement or a whole year. PDF, CSV, and Excel files are welcome.",
              },
              {
                n: "02",
                icon: ScanLine,
                title: "Give it a quick review",
                text: "We organize your transactions and highlight anything that needs a second look.",
              },
              {
                n: "03",
                icon: Download,
                title: "Download your P&L",
                text: "Preview your report for free. Pay once to download your PDF and Excel workbook.",
              },
            ].map((s) => (
              <article key={s.n}>
                <div className="step-top">
                  <s.icon />
                  <span>{s.n}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="detail-section">
          <div className="wrap detail-grid">
            <div>
              <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
              <h2>
                Understand what came in.
                <br />
                And what stayed.
              </h2>
              <p>
                See your revenue, business expenses, and net profit together.
                Transfers, owner contributions, and personal spending stay out
                of your P&L.
              </p>
              <a
                className="text-link"
                href="/guides/how-to-create-pnl-from-bank-statements"
              >
                See how it works <ArrowRight size={17} />
              </a>
            </div>
            <ul className="benefit-list">
              {[
                "Multiple statements, one report",
                "Review categories before you pay",
                "Clear summary and detailed breakdown",
                "PDF, Excel, and transaction exports",
              ].map((x) => (
                <li key={x}>
                  <Check />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="section wrap price-grid" id="pricing">
          <div>
            <span className="eyebrow">SIMPLE, JUST LIKE THE PRODUCT</span>
            <h2>
              One report.
              <br />
              One payment.
            </h2>
            <p>
              Start free. See your numbers first.
              <br />
              Only pay when you’re ready to download.
            </p>
            <div className="privacy-note">
              <LockKeyhole />
              <div>
                <strong>Your banking password stays yours.</strong>
                <p>
                  We never ask for bank credentials.
                  <br />
                  <a href="/security">Learn how we handle your data</a>
                </p>
              </div>
            </div>
          </div>
          <article className="price-card">
            <div className="price-top">
              <span>YOUR COMPLETE P&L</span>
              <span className="tag">One-time payment</span>
            </div>
            <div className="price">
              {money(price())} <span>one-time + applicable tax</span>
            </div>
            <p>No subscription. No hidden monthly fees.</p>
            <ul>
              {[
                "Free report preview",
                "Professional PDF statement",
                "Excel workbook with transactions",
                "Detailed category breakdown",
              ].map((s) => (
                <li key={s}>
                  <Check size={18} />
                  {s}
                </li>
              ))}
            </ul>
            <UploadLink label="Create my P&L" />
            <small>No credit card required to get started</small>
          </article>
        </section>
        <section className="faq-section wrap" id="faq">
          <div>
            <span className="eyebrow">GOOD QUESTIONS</span>
            <h2>
              A few things
              <br />
              you might be wondering.
            </h2>
            <a className="text-link" href="/faq">
              All questions <ArrowRight size={16} />
            </a>
          </div>
          <Faq />
        </section>
        <section className="final-cta wrap">
          <div>
            <h2>
              Your statements have a story.
              <br />
              Let’s make it clear.
            </h2>
            <p>Your first step takes just a few files.</p>
          </div>
          <UploadLink />
        </section>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "WebSite", name: config.name, url: siteOrigin },
              { "@type": "Organization", name: config.name, url: siteOrigin },
            ],
          }}
        />
      </main>
      <Footer />
    </>
  );
}
