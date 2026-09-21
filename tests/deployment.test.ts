import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

test("production deployment builds and preserves Dashboard runtime variables", () => {
  assert.equal(
    packageJson.scripts?.["deploy:production"],
    "npm run build && npx wrangler deploy --config dist/server/wrangler.json --keep-vars",
  );
});

test("every tracked Wrangler deploy command preserves Dashboard runtime variables", () => {
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    if (!/\bwrangler\s+deploy\b/.test(command)) continue;
    assert.match(command, /(?:^|\s)--keep-vars(?:\s|$)/, `${name} must use --keep-vars`);
  }
});
