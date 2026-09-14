import { Header, Footer } from "@/components/product/shared";
import Review from "@/components/product/review";
import { redirect } from "next/navigation";
export const metadata = {
  title: "Review Transactions",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { report } = await searchParams;
  if (!report) redirect("/generate");
  return (
    <>
      <Header />
      <main id="main" className="workspace wrap">
        <Review id={report} />
      </main>
      <Footer />
    </>
  );
}
