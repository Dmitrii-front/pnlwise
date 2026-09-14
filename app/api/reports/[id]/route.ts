import { api, json, getReport, price, setting } from "@/lib/server";
import { calculatePnl, needsReview } from "@/lib/domain";
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
      checkoutEnabled: !!(
        setting("STRIPE_SECRET_KEY") &&
        setting("STRIPE_WEBHOOK_SECRET") &&
        setting("APP_ORIGIN")
      ),
    });
  });
