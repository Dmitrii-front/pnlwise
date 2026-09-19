import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";

test("all application routes explicitly deny framing", async () => {
  const entries = await nextConfig.headers!();
  for (const source of ["/", "/:path*"]) {
    const entry = entries.find((candidate) => candidate.source === source);
    assert.ok(entry);
    assert.equal(
      entry.headers.find((header) => header.key === "Content-Security-Policy")
        ?.value,
      "frame-ancestors 'none'",
    );
    assert.equal(
      entry.headers.find((header) => header.key === "X-Frame-Options")?.value,
      "DENY",
    );
  }
});
