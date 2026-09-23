import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { config, PUBLIC_SITE_ORIGIN } from "../lib/config";

const legacyOrigin = "clearledger-pnl.to4ka-gr.chatgpt.site";
const workersDevOrigin = "pnlwise.d-nadtochii-dev.workers.dev";

test("public SEO output uses the tracked production origin", () => {
  assert.equal(PUBLIC_SITE_ORIGIN, "https://pnlwise.com");
  assert.equal(config.siteUrl, PUBLIC_SITE_ORIGIN);
  assert.ok(
    sitemap().every((entry) => entry.url.startsWith(`${PUBLIC_SITE_ORIGIN}/`)),
  );
  assert.equal(robots().sitemap, `${PUBLIC_SITE_ORIGIN}/sitemap.xml`);
});

test("source configuration has no obsolete or workers.dev public origin", () => {
  for (const file of [
    "../lib/config.ts",
    "../components/product/seo.tsx",
    "../app/layout.tsx",
    "../app/page.tsx",
    "../app/[...slug]/page.tsx",
    "../app/sitemap.ts",
    "../app/robots.ts",
    "../.env.example",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, new RegExp(legacyOrigin.replaceAll(".", "\\.")));
    assert.doesNotMatch(
      source,
      new RegExp(workersDevOrigin.replaceAll(".", "\\.")),
    );
  }
});
