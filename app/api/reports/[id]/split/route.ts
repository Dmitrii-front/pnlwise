import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  saveReport,
  AppError,
  sessionRate,
} from "@/lib/server";
import { setCategory } from "@/lib/domain";
import { cents } from "@/lib/parsing";
import { MAX_REPORT_TRANSACTIONS } from "@/lib/abuse-protection";
export const POST = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "edit", 500);
    const { id } = await params;
    const report = await getReport(id),
      input = await body(req);
    if (report.revision !== input.revision)
      throw new AppError("Refresh the report before saving this split.", 409);
    const t = report.transactions.find((t) => t.id === input.transactionId);
    if (!t || t.categoryId !== "loan-principal" || t.direction !== "debit")
      throw new AppError("Select a loan repayment.");
    let interest: number;
    try {
      interest = cents(input.interest);
    } catch {
      throw new AppError(
        "Enter the exact interest amount from your loan statement.",
      );
    }
    if (interest <= 0 || interest >= t.amount)
      throw new AppError(
        "Interest must be greater than zero and smaller than the total payment.",
      );
    const principal = setCategory(
      {
        ...t,
        amount: t.amount - interest,
        aiReason: "Principal confirmed from your loan statement.",
      },
      "loan-principal",
    );
    const interestTx = setCategory(
      {
        ...t,
        id: crypto.randomUUID(),
        amount: interest,
        rawDescription: t.rawDescription + " — interest",
        aiReason: "Exact interest amount entered by you.",
      },
      "interest",
    );
    report.transactions = report.transactions.flatMap((r) =>
      r.id === t.id ? [principal, interestTx] : [r],
    );
    if (report.transactions.length > MAX_REPORT_TRANSACTIONS)
      throw new AppError(
        "Use up to 5,000 transactions per report. Split your reporting period.",
      );
    report.status = "review";
    return json({ report: await saveReport(report) });
  });
