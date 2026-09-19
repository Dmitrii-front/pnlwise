import assert from "node:assert/strict";
import test from "node:test";
import { safeAnalyticsMetadata } from "../lib/analytics";

test("analytics drops referrer hostnames while preserving approved product metadata", () => {
  assert.deepEqual(
    safeAnalyticsMetadata({
      landing: "/pricing",
      referral: "private.example",
      referrer: "private.example",
      hostname: "private.example",
      businessType: "Consulting",
    }),
    { landing: "/pricing", businessType: "Consulting" },
  );
});
