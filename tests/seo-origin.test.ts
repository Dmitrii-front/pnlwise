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

test("favicon metadata retains SVG and provides a valid multi-size ICO", () => {
  const layout = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /url: "\/favicon\.svg", type: "image\/svg\+xml"/);
  assert.match(layout, /url: "\/favicon\.ico"/);
  assert.match(layout, /type: "image\/x-icon"/);
  assert.match(layout, /sizes: "16x16 32x32 48x48"/);
  assert.match(layout, /shortcut: "\/favicon\.ico"/);

  const icon = readFileSync(new URL("../public/favicon.ico", import.meta.url));
  assert.ok(icon.length > 6);
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  assert.equal(count, 3);
  const sizes = new Set<number>();
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    sizes.add(icon[entry] || 256);
    assert.equal(icon[entry + 1] || 256, icon[entry] || 256);
    const byteLength = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    assert.ok(byteLength > 0 && offset + byteLength <= icon.length);
    assert.deepEqual([...icon.subarray(offset, offset + 8)], [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  }
  assert.deepEqual([...sizes].sort((a, b) => a - b), [16, 32, 48]);
});

test("footer omits unconditional sign-in while optional auth remains gated", () => {
  const footer = readFileSync(
    new URL("../components/product/shared.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(footer, /href=["']\/sign-in["']/);

  const account = readFileSync(
    new URL("../components/product/account.tsx", import.meta.url),
    "utf8",
  );
  assert.match(account, /fetch\("\/api\/auth\/status"\)/);
  assert.match(account, /if \(!enabled\)/);
  assert.match(account, /Create free account \/ Sign in/);
  for (const route of [
    "../app/sign-in/page.tsx",
    "../app/api/auth/status/route.ts",
    "../app/api/auth/start/route.ts",
    "../app/api/auth/signout/route.ts",
    "../app/auth/confirm/route.ts",
  ]) {
    assert.ok(readFileSync(new URL(route, import.meta.url)).length > 0);
  }
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
