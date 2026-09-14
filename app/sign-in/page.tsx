import { Header, Footer } from "@/components/product/shared";
import { AccountPrompt } from "@/components/product/account";
export const metadata = {
  title: "Sign In",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; error?: string }>;
}) {
  const { report, error } = await searchParams;
  return (
    <>
      <Header />
      <main id="main" className="wrap legal-page">
        <h1>Keep access to your reports.</h1>
        {error && (
          <p className="error-box">
            Your sign-in link expired or was opened in a different browser.
            Request a new link below.
          </p>
        )}
        <AccountPrompt reportId={report} initialOpen />
      </main>
      <Footer />
    </>
  );
}
