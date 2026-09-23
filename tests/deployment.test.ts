import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };
const viteConfig = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8",
);
const workerEntry = readFileSync(
  new URL("../worker/index.ts", import.meta.url),
  "utf8",
);
const reportCreationRoute = readFileSync(
  new URL("../app/api/reports/route.ts", import.meta.url),
  "utf8",
);

test("production deployment builds and preserves Dashboard runtime variables", () => {
  assert.equal(
    packageJson.scripts?.["deploy:production"],
    "npm run build && npx wrangler deploy --config dist/server/wrangler.json --keep-vars",
  );
});

test("production alone receives the tracked daily retention cron", () => {
  assert.match(viteConfig, /PRODUCTION_RETENTION_CRON = "17 3 \* \* \*"/);
  assert.match(
    viteConfig,
    /command === "build" && mode !== "staging" \? "production" : "staging"/,
  );
  assert.match(viteConfig, /database_name: "pnlwise-production"/);
  assert.match(
    viteConfig,
    /database_id: "a745b082-7c95-4cfe-b0d1-bdafff77d195"/,
  );
  assert.match(
    viteConfig,
    /databaseTarget === "production"[\s\S]*?workers_dev: false,[\s\S]*?preview_urls: true,[\s\S]*?triggers: \{ crons: \[PRODUCTION_RETENTION_CRON\] \}/,
  );
  assert.match(viteConfig, /main: "\.\/worker\/index\.ts"/);
  assert.doesNotMatch(viteConfig, /staging[\s\S]{0,80}PRODUCTION_RETENTION_CRON/);
});

test("production disables its stable workers.dev URL and preserves previews", () => {
  assert.match(viteConfig, /workers_dev: false/);
  assert.match(viteConfig, /preview_urls: true/);
  assert.doesNotMatch(viteConfig, /pnlwise\.d-nadtochii-dev\.workers\.dev/);
});

test("custom Worker delegates HTTP and schedules direct retention cleanup", () => {
  assert.match(workerEntry, /createWorkerHandler\(/);
  assert.match(workerEntry, /cleanupExpired\(true\)/);
  assert.doesNotMatch(workerEntry, /MAINTENANCE_SECRET|\/api\/maintenance|fetch\s*\(/);
});

test("report creation retains opportunistic cleanup", () => {
  assert.match(reportCreationRoute, /guardOrigin\(req\);\s*await cleanupExpired\(\);/);
});

test("every tracked Wrangler deploy command preserves Dashboard runtime variables", () => {
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    if (!/\bwrangler\s+deploy\b/.test(command)) continue;
    assert.match(command, /(?:^|\s)--keep-vars(?:\s|$)/, `${name} must use --keep-vars`);
  }
});
