import type { Transaction } from "./domain";
import type { AiBudgetCheck } from "./ai-classification";
import { setting } from "./server";
import { reportOperationalError } from "./monitoring";
import { runAiCategorization } from "./ai-core";

export async function aiCategorize(
  transactions: Transaction[],
  businessType: string,
  beforeRequest?: AiBudgetCheck,
) {
  return runAiCategorization({
    transactions,
    businessType,
    apiKey: setting("OPENAI_API_KEY"),
    model: setting("OPENAI_MODEL"),
    beforeRequest,
    report: reportOperationalError,
  });
}
