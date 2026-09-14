import { Header, Footer, UploadLink, Faq } from "@/components/product/shared";
export const metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about bank statement uploads, transaction categories, report limits, payment, downloads, and privacy.",
  alternates: { canonical: "/faq" },
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
