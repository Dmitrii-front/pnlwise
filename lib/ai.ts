import type { Transaction } from "./domain";
import { categorizeTransactionsWithOpenAI } from "./ai-classification";
import { setting } from "./server";
import { reportOperationalError } from "./monitoring";
import { safeProviderRequestId } from "./operational-diagnostics";

const disabledWarning =
  "AI categorization is not enabled. Merchant rules were applied; please review the remaining items.";
const failureWarning =
  "Some transactions could not be categorized automatically. Your extracted data is safe. Review those items manually.";

export async function aiCategorize(
  transactions: Transaction[],
  businessType: string,
) {
  const apiKey = setting("OPENAI_API_KEY");
  const model = setting("OPENAI_MODEL");
  if (!apiKey || !model) return { transactions, warning: disabledWarning };

  try {
    return {
      transactions: await categorizeTransactionsWithOpenAI({
        transactions,
        businessType,
        apiKey,
        model,
      }),
    };
  } catch (error) {
    await reportOperationalError(
      {
        code: "OPENAI_CATEGORIZATION_FALLBACK",
        stage: "openai.categorization",
        providerRequestId: safeProviderRequestId(error),
      },
      error,
    );
    return { transactions, warning: failureWarning };
  }
}
