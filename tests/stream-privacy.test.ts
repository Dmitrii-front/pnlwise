import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ExcelJS from "exceljs";
import { build } from "vite";
import { disableReadableStreamDebug } from "../build/disable-readable-stream-debug";

const marker = "PNLWISE_STREAM_PRIVACY_TEST_REGRESSION_37D9";

async function javascriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(file)));
    else if (/\.(?:m?js)$/.test(entry.name)) files.push(file);
  }
  return files;
}

test(
  "bundled XLSX parsing cannot emit workbook contents through stream debugging",
  { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "pnlwise-stream-"));
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Transactions");
      worksheet.addRow(["Date", "Description", "Debit", "Credit"]);
      worksheet.addRow(["2026-01-15", marker, 12.34, ""]);
      const fixture = path.join(directory, "synthetic.xlsx");
      await writeFile(fixture, Buffer.from(await workbook.xlsx.writeBuffer()));

      const excelEntry = pathToFileURL(
        path.resolve("node_modules/exceljs/excel.js"),
      ).href;
      const entry = path.join(directory, "entry.mjs");
      await writeFile(
        entry,
        `import { readFileSync } from "node:fs";
import ExcelJS from ${JSON.stringify(excelEntry)};
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(readFileSync(process.argv[2]));
console.log("ROWS=" + workbook.worksheets[0].actualRowCount);
`,
      );

      const output = path.join(directory, "dist");
      await build({
        configFile: false,
        logLevel: "silent",
        plugins: [disableReadableStreamDebug()],
        ssr: { noExternal: true },
        build: {
          emptyOutDir: true,
          outDir: output,
          ssr: entry,
          target: "node22",
          rollupOptions: {
            output: { entryFileNames: "runner.mjs" },
          },
        },
      });

      const bundled = (
        await Promise.all(
          (await javascriptFiles(output)).map((file) => readFile(file, "utf8")),
        )
      ).join("\n");
      assert.doesNotMatch(
        bundled,
        /\.debuglog\(\s*(["'`])stream\1\s*\)/,
      );

      const run = spawnSync(
        process.execPath,
        [path.join(output, "runner.mjs"), fixture],
        {
          encoding: "utf8",
          env: { ...process.env, NODE_DEBUG: "stream" },
        },
      );
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /ROWS=2/);
      const logs = `${run.stdout}\n${run.stderr}`;
      assert.doesNotMatch(logs, new RegExp(marker));
      assert.doesNotMatch(logs, /<worksheet\b|<sheetData\b|<sst\b|<sharedStrings\b/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
