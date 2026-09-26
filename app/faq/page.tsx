import { Header, Footer, UploadLink, Faq } from "@/components/product/shared";
import { socialMetadata } from "@/components/product/seo";
const title = "Frequently Asked Questions";
const description =
  "Answers about bank statement uploads, transaction categories, report limits, payment, downloads, and privacy.";
export const metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  ...socialMetadata(title, description, "/faq"),
};
export default function Page() {
  return (
    <>
      <Header />
      <main id="main" className="wrap faq-page">
        <div className="content-hero">
          <span className="eyebrow">A LITTLE MORE CLARITY</span>
          <h1>Good questions. Clear answers.</h1>
          <p>Everything to know before creating your first P&L.</p>
        </div>
        <Faq />
        <div className="faq-end">
          <h2>Ready to see your numbers?</h2>
          <UploadLink />
        </div>
      </main>
      <Footer />
    </>
  );
}
