import { Header, Footer } from "@/components/product/shared";
import ReportView from "@/components/product/report";
export const metadata = {
  title: "Profit & Loss Statement",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Header />
      <main id="main" className="workspace wrap">
        <ReportView id={id} />
      </main>
      <Footer />
    </>
  );
}
