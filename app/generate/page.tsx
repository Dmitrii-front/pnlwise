import { Header, Footer } from "@/components/product/shared";
import UploadForm from "@/components/product/upload";
export const metadata = {
  title: "Upload Bank Statements",
  robots: { index: false, follow: false },
  alternates: { canonical: "/generate" },
};
export default function Generate() {
  return (
    <>
      <Header />
      <main id="main" className="workspace wrap">
        <UploadForm />
      </main>
      <Footer />
    </>
  );
}
