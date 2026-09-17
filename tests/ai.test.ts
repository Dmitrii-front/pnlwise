import test from "node:test";
import assert from "node:assert/strict";
import { categorizeTransactionsWithOpenAI } from "../lib/ai-classification";
import { classify, needsReview, type Transaction } from "../lib/domain";
import { parseCsv } from "../lib/parsing";

function transaction(description: string, amount: string, id: string) {
  return {
    ...classify(
      parseCsv(
        `Date,Description,Amount\n01/15/2026,${description},${amount}`,
        "statement",
        { convention: "credit-positive" },
      )[0],
    ),
    id,
  };
}

function response(items: unknown[]) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          content: [{ type: "output_text", text: JSON.stringify({ items }) }],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("AI classifies only reviewable candidates with a strict enum contract", async () => {
  const transactions = [
    transaction("STRIPE PAYOUT 123456", "8200", "stripe"),
    transaction("JONES ELECTRIC LLC", "-750", "jones"),
    transaction("TRANSFER TO SAVINGS", "-100", "transfer"),
    transaction("ADOBE", "-50", "adobe"),
    transaction("APPLE STORE", "-899", "apple"),
  ];
  let requestBody: Record<string, unknown> | undefined;

  const result = await categorizeTransactionsWithOpenAI({
    transactions,
    businessType: "Construction / Contractor",
    apiKey: "test-key",
    model: "test-model",
    fetcher: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return response([
        {
          id: "stripe",
          merchant: "Stripe",
          categoryId: "sales",
          transactionType: "income",
          confidence: 0.98,
          reason: "Payment processor payout; verify the large credit.",
        },
        {
          id: "jones",
          merchant: "Jones Electric LLC",
          categoryId: "subcontractors",
          transactionType: "expense",
          confidence: 0.91,
          reason: "Likely trade subcontractor for a contractor business.",
        },
        {
          id: "apple",
          merchant: "Apple Store",
          categoryId: "personal",
          transactionType: "personal",
          confidence: 0.9,
          reason: "Possible personal purchase; confirm business purpose.",
        },
      ]);
    },
  });

  assert.equal(requestBody?.model, "test-model");
  assert.equal(requestBody?.store, false);
  const format = (requestBody?.text as { format: Record<string, unknown> })
    .format;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  const categoryEnum = (
    format.schema as {
      properties: {
        items: { items: { properties: { categoryId: { enum: string[] } } } };
      };
    }
  ).properties.items.items.properties.categoryId.enum;
  assert.equal(categoryEnum.includes("duplicate"), false);

  const input = JSON.parse(String(requestBody?.input)) as {
    businessType: string;
    transactions: {
      id: string;
      description: string;
      amountCents: number;
      direction: string;
    }[];
  };
  assert.equal(input.businessType, "Construction / Contractor");
  assert.deepEqual(
    input.transactions.map(({ id }) => id),
    ["stripe", "jones", "apple"],
  );
  assert.equal(input.transactions[0].description, "STRIPE PAYOUT [redacted]");
  assert.equal(input.transactions[0].amountCents, 820000);
  assert.equal(input.transactions[0].direction, "credit");

  const byId = new Map(result.map((item) => [item.id, item]));
  assert.equal(byId.get("jones")?.categoryId, "subcontractors");
  assert.equal(needsReview(byId.get("jones") as Transaction), false);
  assert.equal(byId.get("stripe")?.confidence, 0.69);
  assert.equal(needsReview(byId.get("stripe") as Transaction), true);
  assert.equal(byId.get("apple")?.confidence, 0.69);
  assert.equal(needsReview(byId.get("apple") as Transaction), true);
  assert.equal(byId.get("transfer")?.categoryId, "transfer");
  assert.equal(byId.get("adobe")?.categoryId, "software");
});

test("ordinary low-confidence AI classifications remain in Review", async () => {
  const transactions = [transaction("AMAZON MARKETPLACE", "-25", "amazon")];
  const result = await categorizeTransactionsWithOpenAI({
    transactions,
    businessType: "Construction / Contractor",
    apiKey: "test-key",
    model: "test-model",
    fetcher: async () =>
      response([
        {
          id: "amazon",
          merchant: "Amazon Marketplace",
          categoryId: "office",
          transactionType: "expense",
          confidence: 0.8,
          reason:
            "Likely office supplies, but the purchase details are absent.",
        },
      ]),
  });

  assert.equal(result[0].categoryId, "office");
  assert.equal(result[0].confidence, 0.8);
  assert.equal(needsReview(result[0]), true);
});

test("AI output rejects category/type mismatches", async () => {
  const transactions = [transaction("UNKNOWN VENDOR", "-25", "unknown")];
  await assert.rejects(
    () =>
      categorizeTransactionsWithOpenAI({
        transactions,
        businessType: "Other",
        apiKey: "test-key",
        model: "test-model",
        fetcher: async () =>
          response([
            {
              id: "unknown",
              merchant: "Unknown Vendor",
              categoryId: "office",
              transactionType: "income",
              confidence: 0.9,
              reason: "Office purchase.",
            },
          ]),
      }),
    /category\/type mismatch/,
  );
});

test("AI output must return each requested transaction exactly once", async () => {
  const transactions = [transaction("UNKNOWN VENDOR", "-25", "unknown")];
  await assert.rejects(
    () =>
      categorizeTransactionsWithOpenAI({
        transactions,
        businessType: "Other",
        apiKey: "test-key",
        model: "test-model",
        fetcher: async () => response([]),
      }),
    /invalid classification IDs/,
  );
});
