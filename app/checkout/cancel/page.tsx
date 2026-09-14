import { Header, Footer } from "@/components/product/shared";
import ReportView from "@/components/product/report";
import { redirect } from "next/navigation";
export const metadata = {
  title: "Checkout Canceled",
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
        <ReportView id={report} cancel />
      </main>
      <Footer />
    </>
  );
}
