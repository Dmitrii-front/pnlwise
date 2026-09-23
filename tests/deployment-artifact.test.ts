import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, type ModuleDefinition } from "miniflare";
import test from "node:test";

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
    });

    build();
    const config = await generatedConfig();

    await context.test("production contains one cron, one production DB, and no vars", () => {
      assert.deepEqual(config.triggers?.crons, ["17 3 * * *"]);
      assert.deepEqual(config.d1_databases, [productionDatabase]);
      assert.deepEqual(config.vars, {});
      assert.equal(config.main, "index.js");
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
          d1Databases: { DB: "retention-integration" },
        });

        try {
          const database = await miniflare.getD1Database("DB");
          await applyMigrations(database);
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
  },
);
