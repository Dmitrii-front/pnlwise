import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  businessNameHistoryStorageKey,
  uploadFormStorageKey,
} from "../lib/upload-form-storage";
import { deleteSessionData } from "../components/product/session";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("legal pages use current Paddle MoR terminology and official links", () => {
  const terms = source("app/terms/page.tsx");
  const refund = source("app/refund-policy/page.tsx");
  const pricing = source("app/pricing/page.tsx");
  const pages = `${terms}\n${refund}\n${pricing}`;

  for (const text of [terms, refund, pricing]) {
    assert.ok(
      text.replace(/\s+/g, " ").includes("authorized reseller and Merchant of Record"),
    );
  }
  for (const url of [
    "https://www.paddle.com/legal/buyer-terms",
    "https://www.paddle.com/legal/refund-policy",
    "https://www.paddle.com/legal/privacy",
    "https://paddle.net/",
  ]) {
    assert.ok(pages.includes(url), `missing ${url}`);
  }
  assert.match(refund, /mandatory consumer rights/);
  assert.match(terms, /Last updated September 26, 2026/);
  assert.match(refund, /Last updated September 26, 2026/);
});

test("privacy disclosures match storage, provider, and retention behavior", () => {
  const privacy = source("app/privacy/page.tsx");

  assert.match(privacy, /Last updated September 26, 2026/);
  assert.match(privacy, /Cloudflare Workers/);
  assert.match(privacy, /Cloudflare D1/);
  assert.match(privacy, /infrastructure and network/);
  assert.match(privacy, /short-lived hashed identifiers/);
  assert.match(privacy, /Sentry/);
  assert.match(privacy, /restricted, sanitized/);
  assert.match(privacy, /does not enable Sentry Session/);
  assert.match(privacy, /Browser local storage/);
  assert.match(privacy, /business-name values/);
  assert.match(privacy, /separate from cookies/);
  assert.match(privacy, /Raw uploaded source-file contents/);
  assert.match(privacy, /sanitized filename/);
  assert.match(privacy, /file hash/);
  assert.match(privacy, /row count/);
  assert.match(privacy, /retained for 90 days/);
  assert.match(privacy, /Active or incomplete payment processing/);
  assert.match(privacy, /store: false/);
  assert.match(privacy, /does not by itself enable Zero Data/);
});

test("checkout presents linked acknowledgement and remains Sandbox-only", () => {
  const report = source("components/product/report.tsx");
  const paddle = source("lib/paddle.ts");
  const paymentCore = source("lib/paddle-payment-core.ts");

  assert.match(report, /By continuing to payment/);
  assert.match(report, /href="\/terms"/);
  assert.match(report, /href="\/privacy"/);
  assert.match(report, /href="\/refund-policy"/);
  assert.match(report, /Paddle Sandbox/);
  assert.match(report, /environment: "sandbox"/);
  assert.match(paddle, /Environment\.sandbox/);
  assert.ok(paymentCore.includes("pdl_sdbx_apikey_"));
  assert.ok(paymentCore.includes("^test_"));
});

test("successful server deletion clears local Pnlwise state", async () => {
  const storage = new MemoryStorage();
  storage.setItem(uploadFormStorageKey, "saved-form");
  storage.setItem(businessNameHistoryStorageKey, "saved-names");
  let calls = 0;

  await deleteSessionData(async (input, init) => {
    calls++;
    assert.equal(input, "/api/session/data");
    assert.deepEqual(init, { method: "DELETE" });
    return Response.json({ ok: true });
  }, storage);

  assert.equal(calls, 1);
  assert.equal(storage.getItem(uploadFormStorageKey), null);
  assert.equal(storage.getItem(businessNameHistoryStorageKey), null);
});

test("failed server deletion preserves local Pnlwise state", async () => {
  const storage = new MemoryStorage();
  storage.setItem(uploadFormStorageKey, "saved-form");
  storage.setItem(businessNameHistoryStorageKey, "saved-names");

  await assert.rejects(
    deleteSessionData(
      async () =>
        Response.json({ error: "Deletion is temporarily unavailable." }, { status: 409 }),
      storage,
    ),
    /Deletion is temporarily unavailable/,
  );

  assert.equal(storage.getItem(uploadFormStorageKey), "saved-form");
  assert.equal(storage.getItem(businessNameHistoryStorageKey), "saved-names");
});
