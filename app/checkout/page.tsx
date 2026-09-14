import { redirect } from "next/navigation";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { report } = await searchParams;
  redirect(report ? `/report/${encodeURIComponent(report)}` : "/generate");
}
