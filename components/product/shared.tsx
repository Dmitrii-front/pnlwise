import { config, legalDisclaimer } from "@/lib/config";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export const disclaimer = legalDisclaimer;
export function Logo() {
  return (
    <a href="/" className="logo" aria-label={`${config.name} home`}>
      <span className="logo-icon">
        <ChartNoAxesColumnIncreasing size={22} />
      </span>
      {config.name.toLowerCase()}
      <span className="logo-period">.</span>
    </a>
  );
}
export function Header() {
  return (
    <header className="site-header">
      <div className="wrap nav">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="/#how-it-works">How it works</a>
          <a href="/pricing">Pricing</a>
          <a href="/faq">FAQ</a>
        </nav>
        <Button asChild>
          <a href="/generate">
            Generate P&L <ArrowUpRight size={16} />
          </a>
        </Button>
      </div>
    </header>
  );
}
export function UploadLink({
  label = "Upload bank statements",
}: {
  label?: string;
}) {
  return (
    <Button asChild className="cta">
      <a href="/generate" data-event="primary_cta_clicked">
        {label}
        <ArrowRight size={18} />
      </a>
    </Button>
  );
}
export const faqs = [
  [
    "Can I really create a P&L from bank statements?",
    "Yes. Statements can form the basis of a cash-basis P&L by organizing business deposits and expenses. It only reflects the accounts and dates you provide. Non-cash items and activity outside those accounts may require adjustments.",
  ],
  [
    "Which file formats can I upload?",
    "Upload PDF, CSV, or XLSX statements, including multiple files. Text-based PDFs work best. If a PDF cannot be read reliably, we’ll ask for a CSV or Excel export from your bank.",
  ],
  [
    "Do I need to connect my bank account?",
    "No. We never ask for your online banking password or connect to your bank. You upload the files you choose.",
  ],
  [
    "Can I change how a transaction is categorized?",
    "Absolutely. Review and change any category before generating your report. You can also apply a change to matching merchants or update several transactions at once.",
  ],
  [
    "When do I have to pay?",
    `Your report preview is free. Pay ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(config.priceCents / 100)} once, plus applicable tax, to unlock the PDF, Excel workbook, and transaction report. There is no subscription.`,
  ],
  [
    "Is this a certified financial statement?",
    "No. This is an estimated, cash-basis report based on your data and review. It is not audited, certified, or guaranteed to be accepted by a lender or tax authority.",
  ],
];
export function Faq() {
  return (
    <div className="faq-list">
      {faqs.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <span>+</span>
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <Logo />
            <p>A clearer picture of your business.</p>
          </div>
          <nav aria-label="Resources">
            <a href="/bank-statement-to-pnl">Bank statement to P&L</a>
            <a href="/profit-and-loss-for-self-employed">For self-employed</a>
            <a href="/profit-and-loss-for-contractors">For contractors</a>
            <a href="/profit-and-loss-for-small-business">
              For small businesses
            </a>
            <a href="/profit-and-loss-for-1099">For 1099 workers</a>
          </nav>
          <nav aria-label="Company">
            <a href="/guides/what-is-a-profit-and-loss-statement">P&L guide</a>
            <a href="/security">Security</a>
            <a href="/privacy">Privacy</a>
            <a href="/refund-policy">Refund Policy</a>
            <a href="/terms">Terms</a>
            <a href="/sign-in">Sign in</a>
          </nav>
        </div>
        <p className="disclaimer">{disclaimer}</p>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {config.name}
          </span>
          <span>Made for independent businesses.</span>
        </div>
      </div>
    </footer>
  );
}
