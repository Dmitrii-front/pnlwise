import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, type ModuleDefinition } from "miniflare";
import test from "node:test";
import { NON_AI_BUDGETS } from "../lib/non-ai-budget";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverRoot = join(projectRoot, "dist/server");
const wranglerPath = join(serverRoot, "wrangler.json");

const productionDatabase = {
  binding: "DB",
  database_name: "pnlwise-production",
  database_id: "a745b082-7c95-4cfe-b0d1-bdafff77d195",
};
const stagingDatabase = {
  binding: "DB",
  database_name: "pnlwise-staging",
  database_id: "4c9d7b91-f65a-417f-b3d6-8a5e93a737c1",
};

interface GeneratedWranglerConfig {
  main: string;
  workers_dev?: boolean;
  preview_urls?: boolean;
  triggers?: { crons?: string[] };
  d1_databases?: typeof productionDatabase[];
  vars?: Record<string, unknown>;
}

function build(mode?: "staging") {
  const result = spawnSync(
    process.execPath,
    [
      join(projectRoot, "scripts/run-framework.mjs"),
      "build",
      ...(mode ? ["--mode", mode] : []),
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
      timeout: 120_000,
    },
  );
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${mode || "production"} build failed\n${result.stdout}\n${result.stderr}`,
  );
}

async function generatedConfig() {
  return JSON.parse(
    await readFile(wranglerPath, "utf8"),
  ) as GeneratedWranglerConfig;
}

async function javascriptModules(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptModules(path)));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

async function applyMigrations(database: D1Database) {
  for (const name of [
    "0000_kind_morlun.sql",
    "0001_low_madame_hydra.sql",
    "0002_high_liz_osborn.sql",
  ]) {
    const sql = await readFile(join(projectRoot, "drizzle", name), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement).run();
    }
  }
}

async function insertReport(
  database: D1Database,
  id: string,
  expiresAt: number,
  paid = false,
) {
  await database
    .prepare(
      "INSERT INTO reports(id,session_hash,data,revision,paid,created_at,expires_at) VALUES(?,?,'{}',0,?,?,?)",
    )
    .bind(id, `owner-${id}`, paid ? 1 : 0, expiresAt - 1_000, expiresAt)
    .run();
}

async function insertPayment(
  database: D1Database,
  id: string,
  reportId: string,
  status: "creating" | "pending" | "paid",
) {
  await database
    .prepare(
      "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,created_at) VALUES(?,?,?,1299,'usd',?,?)",
    )
    .bind(id, reportId, `purchase-${id}`, status, Date.now())
    .run();
}

test(
  "generated staging and production Workers preserve retention configuration and behavior",
  { timeout: 180_000 },
  async (context) => {
    await context.test("staging excludes the production cron and database", async () => {
      build("staging");
      const config = await generatedConfig();
      assert.deepEqual(config.triggers?.crons ?? [], []);
      assert.deepEqual(config.d1_databases, [stagingDatabase]);
      assert.notDeepEqual(config.d1_databases, [productionDatabase]);
      assert.deepEqual(config.vars, {});
      assert.equal(config.workers_dev, undefined);
      assert.equal(config.preview_urls, undefined);

      const entryPath = join(serverRoot, config.main);
      const moduleFiles = await javascriptModules(serverRoot);
      const modules: ModuleDefinition[] = [
        entryPath,
        ...moduleFiles.filter((path) => path !== entryPath),
      ].map((path) => ({ type: "ESModule", path }));
      const stagingProofSecret = "local-staging-monitoring-proof-secret";
      const miniflare = new Miniflare({
        modules,
        modulesRoot: serverRoot,
        compatibilityDate: "2026-05-15",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          SENTRY_ENVIRONMENT: "staging",
          MAINTENANCE_SECRET: stagingProofSecret,
        },
        d1Databases: { DB: "staging-proof-integration" },
      });

      try {
        const response = await fetch(
          new URL("/api/monitoring/proof", await miniflare.ready),
          {
            method: "POST",
            redirect: "manual",
            headers: {
              Authorization: `Bearer ${stagingProofSecret}`,
            },
          },
        );
        assert.equal(response.status, 502);
        assert.equal(
          ((await response.json()) as { error?: unknown }).error,
          "Monitoring did not accept the proof event.",
        );
      } finally {
        await miniflare.dispose();
      }
    });

    build();
    const config = await generatedConfig();

    await context.test("production contains canonical routing, cron, DB, and assets", async () => {
      assert.equal(config.workers_dev, false);
      assert.equal(config.preview_urls, true);
      assert.deepEqual(config.triggers?.crons, ["17 3 * * *"]);
      assert.deepEqual(config.d1_databases, [productionDatabase]);
      assert.deepEqual(config.vars, {});
      assert.equal(config.main, "index.js");
      assert.deepEqual(
        [...(await readFile(join(projectRoot, "dist/client/favicon.ico"))).subarray(0, 4)],
        [0, 0, 1, 0],
      );
      assert.match(
        await readFile(join(projectRoot, "dist/client/favicon.svg"), "utf8"),
        /^<svg /,
      );
    });

    await context.test(
      "generated Worker exports fetch and scheduled retention against the DB binding",
      async () => {
        const entryPath = join(serverRoot, config.main);
        const moduleFiles = await javascriptModules(serverRoot);
        const modules: ModuleDefinition[] = [
          entryPath,
          ...moduleFiles.filter((path) => path !== entryPath),
        ].map((path) => ({ type: "ESModule", path }));
        const miniflare = new Miniflare({
          modules,
          modulesRoot: serverRoot,
          compatibilityDate: "2026-05-15",
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            SENTRY_ENVIRONMENT: "production",
          },
          d1Databases: { DB: "retention-integration" },
        });

        try {
          const database = await miniflare.getD1Database("DB");
          await applyMigrations(database);

          const proofResponse = await fetch(
            new URL("/api/monitoring/proof", await miniflare.ready),
            {
              method: "POST",
              redirect: "manual",
              headers: {
                "X-Pnlwise-Monitoring-Proof": "production-proof-v1",
              },
              body: "production requests must return before body handling",
            },
          );
          assert.equal(proofResponse.status, 404);
          assert.equal(
            ((await proofResponse.json()) as { error?: unknown }).error,
            "Not found.",
          );

          const now = Date.now();
          await insertReport(database, "expired", now - 1);
          await insertReport(database, "unexpired", now + 86_400_000);
          await insertReport(database, "expired-paid", now - 1, true);
          await insertReport(database, "expired-creating", now - 1);
          await insertReport(database, "expired-pending", now - 1);
          await insertPayment(database, "paid", "expired-paid", "paid");
          await insertPayment(
            database,
            "creating",
            "expired-creating",
            "creating",
          );
          await insertPayment(
            database,
            "pending",
            "expired-pending",
            "pending",
          );

          const response = await miniflare.dispatchFetch(
            "http://pnlwise.test/api/config",
          );
          assert.equal(response.status, 200);
          const payload = (await response.json()) as { priceCents: unknown };
          assert.equal(typeof payload.priceCents, "number");

          const page = await miniflare.dispatchFetch("http://pnlwise.test/");
          assert.equal(page.status, 200);
          const html = await page.text();
          assert.match(
            html,
            /<link rel="canonical" href="https:\/\/pnlwise\.com"\s*\/>/,
          );
          assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
          assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
          assert.match(html, /<link rel="shortcut icon" href="\/favicon\.ico"/);
          assert.match(html, /"url":"https:\/\/pnlwise\.com"/);
          assert.doesNotMatch(
            html,
            /clearledger-pnl\.to4ka-gr\.chatgpt\.site/,
          );

          const sitemap = await miniflare.dispatchFetch(
            "http://pnlwise.test/sitemap.xml",
          );
          assert.equal(sitemap.status, 200);
          const sitemapXml = await sitemap.text();
          assert.match(sitemapXml, /<loc>https:\/\/pnlwise\.com\//);
          assert.doesNotMatch(
            sitemapXml,
            /clearledger-pnl\.to4ka-gr\.chatgpt\.site/,
          );

          const robots = await miniflare.dispatchFetch(
            "http://pnlwise.test/robots.txt",
          );
          assert.equal(robots.status, 200);
          assert.match(
            await robots.text(),
            /Sitemap: https:\/\/pnlwise\.com\/sitemap\.xml/,
          );

          const worker = await miniflare.getWorker();
          const first = await worker.scheduled({
            cron: "17 3 * * *",
            scheduledTime: new Date(now),
          });
          assert.equal(first.outcome, "ok");
          assert.deepEqual(
            (
              await database
                .prepare("SELECT id FROM reports ORDER BY id")
                .all<{ id: string }>()
            ).results.map((row) => row.id),
            ["expired-creating", "expired-pending", "unexpired"],
          );
          assert.deepEqual(
            (
              await database
                .prepare("SELECT id,status FROM payments ORDER BY id")
                .all<{ id: string; status: string }>()
            ).results,
            [
              { id: "creating", status: "creating" },
              { id: "paid", status: "paid" },
              { id: "pending", status: "pending" },
            ],
          );

          const second = await worker.scheduled({
            cron: "17 3 * * *",
            scheduledTime: new Date(now + 1),
          });
          assert.equal(second.outcome, "ok");
          assert.equal(
            (
              await database
                .prepare("SELECT COUNT(*) AS count FROM reports")
                .first<{ count: number }>()
            )?.count,
            3,
          );
          assert.equal(
            (
              await database
                .prepare("SELECT COUNT(*) AS count FROM payments")
                .first<{ count: number }>()
            )?.count,
            3,
          );
        } finally {
          await miniflare.dispose();
        }
      },
    );

    await context.test(
      "generated Worker enforces non-AI budgets without blocking owned recovery",
      async () => {
        const entryPath = join(serverRoot, config.main);
        const moduleFiles = await javascriptModules(serverRoot);
        const modules: ModuleDefinition[] = [
          entryPath,
          ...moduleFiles.filter((path) => path !== entryPath),
        ].map((path) => ({ type: "ESModule", path }));
        const miniflare = new Miniflare({
          modules,
          modulesRoot: serverRoot,
          compatibilityDate: "2026-05-15",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: { DB: "abu003-integration" },
        });

        const post = (
          path: string,
          body: string | ArrayBuffer,
          cookie?: string,
          headers: HeadersInit = {},
        ) =>
          miniflare.dispatchFetch(`http://pnlwise.test${path}`, {
            method: "POST",
            headers: {
              Origin: "http://pnlwise.test",
              ...(cookie ? { Cookie: cookie } : {}),
              ...headers,
            },
            body,
          });

        try {
          const database = await miniflare.getD1Database("DB");
          await applyMigrations(database);

          const eventResponse = await post(
            "/api/events",
            JSON.stringify({ name: "landing_view" }),
            undefined,
            { "Content-Type": "application/json" },
          );
          assert.equal(eventResponse.status, 200);
          assert.equal(
            (
              await database
                .prepare("SELECT COUNT(*) AS count FROM events WHERE name='landing_view'")
                .first<{ count: number }>()
            )?.count,
            1,
          );
          await database
            .prepare(
              "UPDATE rate_limits SET count=CASE WHEN key LIKE '%:hour:%' THEN ? ELSE ? END WHERE key LIKE 'abuse:public_events:%'",
            )
            .bind(
              NON_AI_BUDGETS.public_events.hourly,
              NON_AI_BUDGETS.public_events.daily,
            )
            .run();
          const dropped = await post(
            "/api/events",
            JSON.stringify({ name: "landing_view" }),
            undefined,
            { "Content-Type": "application/json" },
          );
          assert.equal(dropped.status, 200);
          assert.equal(
            (
              await database
                .prepare("SELECT COUNT(*) AS count FROM events WHERE name='landing_view'")
                .first<{ count: number }>()
            )?.count,
            1,
          );

          const created = await post(
            "/api/reports",
            JSON.stringify({
              businessName: "Synthetic Test",
              businessType: "Other",
              periodStart: "2026-01-01",
              periodEnd: "2026-12-31",
            }),
            undefined,
            { "Content-Type": "application/json" },
          );
          assert.equal(created.status, 201);
          const cookie = created.headers.get("set-cookie")?.split(";", 1)[0];
          assert.ok(cookie);
          const createdPayload = (await created.json()) as {
            report: { id: string };
          };

          await insertReport(database, "expired-create-order", Date.now() - 1);
          await database
            .prepare(
              "UPDATE rate_limits SET count=CASE WHEN key LIKE '%:hour:%' THEN ? ELSE ? END WHERE key LIKE 'abuse:report_create:%'",
            )
            .bind(
              NON_AI_BUDGETS.report_create.hourly,
              NON_AI_BUDGETS.report_create.daily,
            )
            .run();
          const rejectedCreate = await post(
            "/api/reports",
            JSON.stringify({ businessType: "Other" }),
            cookie,
            { "Content-Type": "application/json" },
          );
          assert.equal(rejectedCreate.status, 429);
          assert.ok(
            await database
              .prepare("SELECT 1 FROM reports WHERE id='expired-create-order'")
              .first(),
          );
          await database
            .prepare(
              "DELETE FROM rate_limits WHERE key LIKE 'abuse:report_create:%'",
            )
            .run();
          const admittedCreate = await post(
            "/api/reports",
            JSON.stringify({ businessType: "Other" }),
            cookie,
            { "Content-Type": "application/json" },
          );
          assert.equal(admittedCreate.status, 201);
          assert.equal(
            await database
              .prepare("SELECT 1 FROM reports WHERE id='expired-create-order'")
              .first(),
            null,
          );

          const upload = async (description: string, ownerCookie?: string) => {
            const form = new FormData();
            form.set("reportId", createdPayload.report.id);
            form.set("account", "checking");
            form.set(
              "mapping",
              JSON.stringify({
                date: "Date",
                description: "Description",
                amount: "Amount",
                convention: "credit-positive",
              }),
            );
            form.set(
              "file",
              new File(
                [`Date,Description,Amount\n2026-01-01,${description},-12.34\n`],
                `${description}.csv`,
                { type: "text/csv" },
              ),
            );
            const encoded = new Request("http://pnlwise.test", {
              method: "POST",
              body: form,
            });
            return post(
              "/api/statements/upload",
              await encoded.arrayBuffer(),
              ownerCookie,
              { "Content-Type": encoded.headers.get("content-type")! },
            );
          };

          const parserCount = async () =>
            Number(
              (
                await database
                  .prepare(
                    "SELECT COALESCE(SUM(count),0) AS count FROM rate_limits WHERE key LIKE 'abuse:parser:%'",
                  )
                  .first<{ count: number }>()
              )?.count || 0,
            );
          const beforeUnowned = await parserCount();
          assert.equal((await upload("UNOWNED")).status, 404);
          assert.equal(await parserCount(), beforeUnowned);

          const accepted = await upload("OFFICE SUPPLIES", cookie);
          assert.equal(accepted.status, 200);
          assert.equal(await parserCount(), beforeUnowned + 2);
          await database
            .prepare(
              "UPDATE rate_limits SET count=CASE WHEN key LIKE '%:hour:%' THEN ? ELSE ? END WHERE key LIKE 'abuse:parser:%'",
            )
            .bind(
              NON_AI_BUDGETS.parser.hourly,
              NON_AI_BUDGETS.parser.daily,
            )
            .run();
          assert.equal((await upload("SECOND FILE", cookie)).status, 429);

          const staleProcess = await post(
            `/api/reports/${createdPayload.report.id}/process`,
            JSON.stringify({ stage: 99 }),
            cookie,
            { "Content-Type": "application/json" },
          );
          assert.equal(staleProcess.status, 200);
          assert.equal(
            (
              await database
                .prepare(
                  "SELECT COUNT(*) AS count FROM rate_limits WHERE key LIKE 'abuse:process:%'",
                )
                .first<{ count: number }>()
            )?.count,
            0,
          );
          const advanced = await post(
            `/api/reports/${createdPayload.report.id}/process`,
            JSON.stringify({ stage: 0 }),
            cookie,
            { "Content-Type": "application/json" },
          );
          assert.equal(advanced.status, 200);
          assert.equal(
            (
              await database
                .prepare(
                  "SELECT COUNT(*) AS count FROM rate_limits WHERE key LIKE 'abuse:process:%'",
                )
                .first<{ count: number }>()
            )?.count,
            2,
          );

          assert.ok(
            Number(
              (
                await database
                  .prepare(
                    "SELECT COALESCE(SUM(count),0) AS count FROM rate_limits WHERE key LIKE 'abuse:report_growth:%'",
                  )
                  .first<{ count: number }>()
              )?.count || 0,
            ) > 0,
          );
        } finally {
          await miniflare.dispose();
        }
      },
    );
  },
);
