import { api, json, getReport, price } from "@/lib/server";
import { calculatePnl, needsReview } from "@/lib/domain";
import { stripeTestConfigured } from "@/lib/payments";
export const GET = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  api(async () => {
    const { id } = await params;
    const report = await getReport(id);
    return json({
      report,
      pnl:
        report.periodStart && report.periodEnd
          ? calculatePnl(
              report.transactions,
              report.periodStart,
              report.periodEnd,
            )
          : null,
      reviewCount: report.transactions.filter(needsReview).length,
      priceCents: price(),
      checkoutEnabled: stripeTestConfigured(),
    });
  });
