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

test("private UI routes explicitly return noindex and nofollow headers", async () => {
  const entries = await nextConfig.headers!();
  for (const source of [
    "/generate",
    "/generate/:path*",
    "/report/:path*",
    "/checkout",
    "/checkout/:path*",
    "/sign-in",
  ]) {
    const entry = entries.find((candidate) => candidate.source === source);
    assert.ok(entry, `missing header rule for ${source}`);
    assert.equal(
      entry.headers.find((header) => header.key === "X-Robots-Tag")?.value,
      "noindex, nofollow",
    );
  }

  const report = entries.find(
    (candidate) => candidate.source === "/report/:path*",
  );
  assert.equal(
    report?.headers.find((header) => header.key === "Cache-Control")?.value,
    "private, no-store",
  );
});
