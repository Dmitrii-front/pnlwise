import { Header, Footer } from "@/components/product/shared";
import Processing from "@/components/product/processing";
import { redirect } from "next/navigation";
export const metadata = {
  title: "Analyzing Statements",
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
        <Processing id={report} />
      </main>
      <Footer />
    </>
  );
}
