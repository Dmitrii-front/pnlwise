import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  saveReport,
  AppError,
  track,
  sessionRate,
} from "@/lib/server";
import { categoryById, setCategory } from "@/lib/domain";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "edit", 500);
    const input = await body(req);
    let report = await getReport(String(input.reportId || ""));
    if (report.stage < 6)
      throw new AppError("Finish processing the statements first.");
    if (report.revision !== input.revision)
      throw new AppError(
        "This report changed in another tab. Refresh and try again.",
        409,
      );
    if (
      !Array.isArray(input.ids) ||
      !input.ids.length ||
      input.ids.length > 5000
    )
      throw new AppError("Select one or more transactions.");
    const ids = new Set<string>(input.ids);
    if (input.categoryId && !categoryById[input.categoryId])
      throw new AppError("Choose a valid category.");
    if ([...ids].some((id) => !report.transactions.some((t) => t.id === id)))
      throw new AppError("A selected transaction was not found.", 404);
    if (input.always) {
      if (ids.size !== 1 || !input.categoryId)
        throw new AppError("Choose one merchant and category for a rule.");
      const merchant = report.transactions.find((t) =>
        ids.has(t.id),
      )!.normalizedMerchant;
      report.rules[merchant] = input.categoryId;
      report.transactions.forEach((t) => {
        if (
          t.normalizedMerchant === merchant &&
          !t.isDuplicate &&
          !t.duplicateOf
        )
          ids.add(t.id);
      });
    }
    report.transactions = report.transactions.map((t) => {
      if (!ids.has(t.id)) return t;
      const category = input.categoryId || t.categoryId;
      if (["unknown", "refund"].includes(category))
        throw new AppError(
          "Choose an income, expense, or exclusion category before confirming. For refunds, choose the original category.",
        );
      return setCategory(
        {
          ...t,
          aiReason: input.always
            ? "Category confirmed by your merchant rule."
            : "Category confirmed by you.",
        },
        category,
      );
    });
    report.status = "review";
    report = await saveReport(report);
    await track("transaction_edited", { transactionCount: ids.size });
    return json({ report });
  });
