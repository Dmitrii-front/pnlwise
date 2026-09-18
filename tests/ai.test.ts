import test from "node:test";
import assert from "node:assert/strict";
import {
  categorizeTransactionsWithOpenAI,
  openAiFailureDiagnostic,
  OpenAIClassificationError,
} from "../lib/ai-classification";
import { safeOperationalDiagnostic } from "../lib/operational-diagnostics";
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

test("OpenAI provider failures have stable safe classifications without mutating fallback data", async () => {
  const transactions = [transaction("PRIVATE MERCHANT", "-25", "unknown")];
  const original = structuredClone(transactions);
  const cases = [
    {
      response: new Response("{}", {
        status: 429,
        headers: { "x-request-id": "req_rate-limit-123" },
      }),
      code: "OPENAI_RATE_LIMITED",
      stage: "openai.categorization.rate_limit",
      retryable: true,
      status: 429,
    },
    {
      response: new Response("{}", {
        status: 503,
        headers: { "x-request-id": "req_server-123456" },
      }),
      code: "OPENAI_PROVIDER_FAILED",
      stage: "openai.categorization.provider",
      retryable: true,
      status: 503,
    },
    {
      response: new Response('{"status":"completed","output_text":"bad"}', {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req_invalid-12345",
        },
      }),
      code: "OPENAI_RESPONSE_INVALID",
      stage: "openai.categorization.response",
      retryable: false,
      status: 200,
    },
  ];

  for (const expected of cases) {
    let failure: unknown;
    try {
      await categorizeTransactionsWithOpenAI({
        transactions,
        businessType: "Other",
        apiKey: "test-key",
        model: "test-model",
        fetcher: async () => expected.response,
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof OpenAIClassificationError);
    const safe = safeOperationalDiagnostic(openAiFailureDiagnostic(failure));
    assert.equal(safe.code, expected.code);
    assert.equal(safe.stage, expected.stage);
    assert.equal(safe.retryable, expected.retryable);
    assert.equal(
      safe.http_status,
      expected.status >= 400 ? expected.status : undefined,
    );
    assert.equal(safe.provider, "openai");
    assert.equal(safe.route, "api.reports.process");
  }
  assert.deepEqual(transactions, original);
  assert.equal(
    JSON.stringify(cases.map((item) => item.code)).includes("PRIVATE MERCHANT"),
    false,
  );
});

test("OpenAI timeout and network failures remain distinguishable and retryable", async () => {
  const transactions = [transaction("UNKNOWN VENDOR", "-25", "unknown")];
  for (const [name, code, stage] of [
    ["TimeoutError", "OPENAI_TIMEOUT", "openai.categorization.timeout"],
    ["TypeError", "OPENAI_NETWORK_FAILED", "openai.categorization.network"],
  ] as const) {
    let failure: unknown;
    try {
      await categorizeTransactionsWithOpenAI({
        transactions,
        businessType: "Other",
        apiKey: "test-key",
        model: "test-model",
        fetcher: async () => {
          const error = new Error("provider request failed");
          error.name = name;
          throw error;
        },
      });
    } catch (error) {
      failure = error;
    }
    const safe = safeOperationalDiagnostic(openAiFailureDiagnostic(failure));
    assert.equal(safe.code, code);
    assert.equal(safe.stage, stage);
    assert.equal(safe.retryable, true);
  }
});
