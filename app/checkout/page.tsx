import { Footer, Header } from "@/components/product/shared";
import { PaddleCheckout } from "@/components/product/paddle-checkout";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Secure Checkout",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ _ptxn?: string; report?: string }>;
}) {
  const { _ptxn: transactionId, report } = await searchParams;
  if (!transactionId)
    redirect(report ? `/report/${encodeURIComponent(report)}` : "/generate");
  return (
    <>
      <Header />
      <main id="main" className="workspace wrap">
        <PaddleCheckout transactionId={transactionId} reportId={report} />
      </main>
      <Footer />
    </>
  );
}
