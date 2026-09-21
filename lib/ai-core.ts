import type { Transaction } from "./domain";
import type { OperationalDiagnostic } from "./operational-diagnostics";
import {
  type AiBudgetCheck,
  categorizeTransactionsWithOpenAI,
  type Fetcher,
  openAiFailureDiagnostic,
} from "./ai-classification";
import {
  aiBudgetDiagnostic,
  AiBudgetExhaustedError,
} from "./ai-budget";

export const AI_DISABLED_WARNING =
  "AI categorization is not enabled. Merchant rules were applied; please review the remaining items.";
export const AI_FAILURE_WARNING =
  "Some transactions could not be categorized automatically. Your extracted data is safe. Review those items manually.";
export const AI_BUDGET_WARNING =
  "Automatic categorization is temporarily limited. Merchant rules were applied; please review the remaining items.";

export async function runAiCategorization(input: {
  transactions: Transaction[];
  businessType: string;
  apiKey?: string;
  model?: string;
  beforeRequest?: AiBudgetCheck;
  fetcher?: Fetcher;
  report: (
    diagnostic: OperationalDiagnostic,
    error?: unknown,
  ) => Promise<unknown>;
}) {
  if (!input.apiKey || !input.model)
    return { transactions: input.transactions, warning: AI_DISABLED_WARNING };

  try {
    return {
      transactions: await categorizeTransactionsWithOpenAI({
        transactions: input.transactions,
        businessType: input.businessType,
        apiKey: input.apiKey,
        model: input.model,
        beforeRequest: input.beforeRequest,
        fetcher: input.fetcher,
      }),
    };
  } catch (error) {
    if (error instanceof AiBudgetExhaustedError) {
      await input.report(aiBudgetDiagnostic(error.reason), error);
      return { transactions: input.transactions, warning: AI_BUDGET_WARNING };
    }
    await input.report(openAiFailureDiagnostic(error), error);
    return { transactions: input.transactions, warning: AI_FAILURE_WARNING };
  }
}
