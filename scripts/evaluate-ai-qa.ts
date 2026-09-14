import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { categorizeTransactionsWithOpenAI } from "../lib/ai-classification";
import {
  categoryById,
  classify,
  detectDuplicates,
  detectTransfers,
  needsReview,
  type Statement,
  type Transaction,
} from "../lib/domain";
import { parseCsv, parsePdf, parseXlsx } from "../lib/parsing";

const expected = new Map<string, string>([
  ["STRIPE PAYOUT ST-0103", "sales"],
  ["ACH CREDIT CLIENT A INV-1042", "sales"],
  ["HOME DEPOT #0412", "materials"],
  ["ABC PLUMBING SUPPLY", "materials"],
  ["GOOGLE ADS 784510", "advertising"],
  ["QUICKBOOKS ONLINE", "software"],
  ["ACH OFFICE RENT JAN", "rent"],
  ["GUSTO PAYROLL", "payroll"],
  ["STATE FARM BUSINESS", "insurance"],
  ["SHELL OIL 5743", "vehicle"],
  ["MONTHLY SERVICE FEE", "bank-fees"],
  ["TRANSFER TO BUSINESS SAVINGS 2711", "transfer"],
  ["OWNER DRAW", "owner-draw"],
  ["AMAZON MKTPLACE PMTS", "office"],
  ["THE LOCAL KITCHEN", "meals"],
  ["STRIPE PROCESSING FEE", "merchant-fees"],
  ["STRIPE PAYOUT ST-0202", "sales"],
  ["ACH CREDIT CLIENT B INV-1088", "sales"],
  ["JONES ELECTRIC LLC", "subcontractors"],
  ["META ADS 77841", "advertising"],
  ["AWS EMEA", "software"],
  ["ACH OFFICE RENT FEB", "rent"],
  ["CITY ELECTRIC UTILITY", "utilities"],
  ["MARTIN CPA SERVICES", "professional"],
  ["BUSINESS TERM LOAN DISBURSEMENT", "loan-proceeds"],
  ["LOAN PRINCIPAL PAYMENT", "loan-principal"],
  ["OWNER CONTRIBUTION", "owner-contribution"],
  ["TRANSFER FROM BUSINESS SAVINGS 2711", "transfer"],
  ["AMAZON.COM*8J41", "office"],
  ["VENMO PAYMENT JONES ELECTRIC", "subcontractors"],
  ["REVERSAL MONTHLY SERVICE FEE", "refund"],
  ["STRIPE PAYOUT ST-0302", "sales"],
  ["ACH CREDIT CLIENT C INV-1134", "sales"],
  ["MILLER HVAC LLC", "subcontractors"],
  ["GOOGLE ADS 991404", "advertising"],
  ["CANVA PRO", "software"],
  ["MICROSOFT 365", "software"],
  ["ACH OFFICE RENT MAR", "rent"],
  ["APPLE STORE R042", "personal"],
  ["PAYPAL *J SMITH", "subcontractors"],
  ["COUNTY BUSINESS LICENSE", "taxes"],
  ["HOME DEPOT RETURN", "materials"],
]);

const fixture = (name: string) => resolve("tests/fixtures", name);
const arrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

async function loadPack() {
  const [csv, xlsx, pdf] = await Promise.all([
    readFile(fixture("01_January_Statement.csv"), "utf8"),
    readFile(fixture("02_February_Statement.xlsx")),
    readFile(fixture("03_March_Statement.pdf")),
  ]);
  const parsed = [
    parseCsv(csv, "january"),
    await parseXlsx(arrayBuffer(xlsx), "february"),
    await parsePdf(arrayBuffer(pdf), "march"),
  ];
  const statements = ["january", "february", "march"].map(
    (id) => ({ id, account: "business-checking" }) as Statement,
  );
  const transactions = detectTransfers(
    detectDuplicates(parsed.flat(), statements).map(classify),
    statements,
  );
  return { parsed, transactions };
}

function reviewAt(transaction: Transaction, threshold: number) {
  return (
    !transaction.userConfirmed &&
    (transaction.confidence < threshold ||
      transaction.categoryId === "unknown" ||
      transaction.categoryId === "refund" ||
      !!transaction.duplicateOf)
  );
}

async function main() {
  const { parsed, transactions } = await loadPack();
  const baseline = {
    parsedByFile: parsed.map((rows) => rows.length),
    parsedTotal: transactions.length,
    afterDeduplication: transactions.filter((row) => !row.duplicateOf).length,
    reviewWithoutAi: transactions.filter(needsReview).length,
  };
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    console.log(
      JSON.stringify(
        {
          ...baseline,
          aiRun:
            "skipped: set OPENAI_API_KEY and OPENAI_MODEL in the runtime environment",
        },
        null,
        2,
      ),
    );
    return;
  }

  let classified = [...transactions];
  for (let cursor = 0; cursor < classified.length; cursor += 40) {
    const updates = await categorizeTransactionsWithOpenAI({
      transactions: classified.slice(cursor, cursor + 40),
      businessType: "Construction / Contractor",
      apiKey,
      model,
    });
    const byId = new Map(updates.map((row) => [row.id, row]));
    classified = classified.map((row) => byId.get(row.id) || row);
  }

  const effective = classified.filter((row) => !row.duplicateOf);
  const missingExpectations = effective.filter(
    (row) => !expected.has(row.rawDescription),
  );
  if (missingExpectations.length)
    throw new Error(
      `Missing expectations: ${missingExpectations
        .map((row) => row.rawDescription)
        .join(", ")}`,
    );

  const wrong = effective.filter(
    (row) =>
      row.categoryId !== "unknown" &&
      row.categoryId !== expected.get(row.rawDescription),
  );
  const abstained = effective.filter((row) => row.categoryId === "unknown");
  const thresholds = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((threshold) => {
    const autoAcceptedErrors = wrong.filter(
      (row) => !reviewAt(row, threshold),
    ).length;
    return {
      threshold,
      reviewCount: classified.filter((row) => reviewAt(row, threshold)).length,
      autoAcceptedErrors,
    };
  });
  const safest = thresholds
    .filter((result) => result.autoAcceptedErrors === 0)
    .sort(
      (a, b) => a.reviewCount - b.reviewCount || a.threshold - b.threshold,
    )[0];

  console.log(
    JSON.stringify(
      {
        ...baseline,
        model,
        reviewWithAi: classified.filter(needsReview).length,
        thresholds,
        recommendedThreshold: safest?.threshold ?? null,
        misclassifications: wrong.map((row) => ({
          description: row.rawDescription,
          expected: expected.get(row.rawDescription),
          actual: row.categoryId,
          confidence: row.confidence,
          inReview: needsReview(row),
          reason: row.aiReason,
        })),
        abstentions: abstained.map((row) => row.rawDescription),
        categoryTypesValid: classified.every(
          (row) => categoryById[row.categoryId]?.type === row.transactionType,
        ),
      },
      null,
      2,
    ),
  );
}

await main();
