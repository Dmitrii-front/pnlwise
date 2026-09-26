import { api, json, getReport, price } from "@/lib/server";
import { calculateDraftPnl, needsReview } from "@/lib/domain";
import { paddleConfigured } from "@/lib/paddle";
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
          ? calculateDraftPnl(
              report.transactions,
              report.periodStart,
              report.periodEnd,
            )
          : null,
      reviewCount: report.transactions.filter(needsReview).length,
      priceCents: price(),
      checkoutEnabled: paddleConfigured(),
    });
  });
