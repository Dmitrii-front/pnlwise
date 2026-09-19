import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
const fixture = resolve("tests/fixtures/business.csv");

test("upload preferences survive reload without persisting files or financial data", async ({
  page,
}) => {
  await page.goto("/generate");
  await expect(
    page.getByRole("button", { name: "Analyze statements" }),
  ).toBeEnabled();

  const businessGrid = page.locator(".form-grid").first();
  await expect(businessGrid.locator(".field-label")).toHaveCount(2);
  await expect(businessGrid.locator(".field-label").nth(1)).toHaveText(
    "Business name · optional",
  );
  const typeBox = await page
    .getByRole("combobox", { name: "Business type", exact: true })
    .boundingBox();
  const nameBox = await page
    .getByPlaceholder("Your business name")
    .boundingBox();
  expect(typeBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  expect(Math.abs(typeBox!.y - nameBox!.y)).toBeLessThanOrEqual(2);

  await page
    .getByRole("combobox", { name: "Business type", exact: true })
    .click();
  await page.getByRole("option", { name: "Consulting", exact: true }).click();
  await page.getByPlaceholder("Your business name").fill("Reload Studio");
  await page.getByLabel("Period start").fill("2026-01-01");
  await page.getByLabel("Period end").fill("2026-12-31");
  await page.getByRole("combobox", { name: "All business accounts" }).click();
  await page
    .getByRole("option", { name: "No, I have more statements" })
    .click();
  await page
    .getByPlaceholder("e.g. Business checking 1234")
    .fill("Operating 1234");
  await page.getByLabel("Upload bank statements").setInputFiles(fixture);

  const storedBeforeReload = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  expect(Object.keys(storedBeforeReload)).toEqual(["pnlwise:upload-form:v1"]);
  expect(JSON.stringify(storedBeforeReload)).not.toContain("business.csv");
  for (const forbidden of [
    "reportId",
    "transaction",
    "merchant",
    "paddle",
    "secret",
  ]) {
    expect(JSON.stringify(storedBeforeReload).toLowerCase()).not.toContain(
      forbidden.toLowerCase(),
    );
  }

  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Business type", exact: true }),
  ).toHaveText("Consulting");
  await expect(page.getByPlaceholder("Your business name")).toHaveValue(
    "Reload Studio",
  );
  await expect(page.getByLabel("Period start")).toHaveValue("2026-01-01");
  await expect(page.getByLabel("Period end")).toHaveValue("2026-12-31");
  await expect(
    page.getByRole("combobox", { name: "All business accounts" }),
  ).toHaveText("No, I have more statements");
  await expect(
    page.getByPlaceholder("e.g. Business checking 1234"),
  ).toHaveValue("Operating 1234");
  await expect(page.getByText("business.csv", { exact: true })).toHaveCount(0);
  await expect(
    page.locator("#pnlwise-business-name-history option"),
  ).toHaveCount(0);
});

test("malformed upload preferences fail safely", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pnlwise:upload-form:v1", "{not-json");
    localStorage.setItem("pnlwise:business-name-history:v1", "not-json");
  });
  await page.goto("/generate");
  await expect(
    page.getByRole("heading", { name: "Start with your statements." }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Your business name")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Analyze statements" }),
  ).toBeEnabled();
});

test("created draft stays in the URL, recovers without duplication, and remains session-owned", async ({
  page,
  browser,
}) => {
  let reportCreates = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/reports")
      reportCreates++;
  });

  await page.goto("/generate");
  const uploadInput = page.getByLabel("Upload bank statements");
  await expect(uploadInput).toBeEnabled();
  await uploadInput.setInputFiles(fixture);
  await page
    .getByRole("combobox", { name: "Business type", exact: true })
    .click();
  await page.getByRole("option", { name: "Consulting", exact: true }).click();
  await page
    .getByPlaceholder("Your business name")
    .fill("Draft Recovery Studio");
  await page.getByRole("button", { name: "Analyze statements" }).click();
  await expect(
    page.getByRole("heading", { name: "Match your statement columns" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/generate\?report=[0-9a-f-]+$/);
  const reportId = new URL(page.url()).searchParams.get("report")!;
  expect(reportCreates).toBe(1);

  await page.goto(`/report/${reportId}`);
  await expect(page).toHaveURL(new RegExp(`/generate\\?report=${reportId}$`));

  await expect(
    page.locator(
      '#pnlwise-business-name-history option[value="Draft Recovery Studio"]',
    ),
  ).toHaveCount(1);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/generate\\?report=${reportId}$`));
  await expect(page.getByPlaceholder("Your business name")).toHaveValue(
    "Draft Recovery Studio",
  );
  await expect(page.getByPlaceholder("Your business name")).toBeDisabled();
  expect(reportCreates).toBe(1);

  await page.getByLabel("Upload bank statements").setInputFiles(fixture);
  await page.getByRole("button", { name: "Analyze statements" }).click();
  await expect(
    page.getByRole("heading", { name: "Match your statement columns" }),
  ).toBeVisible();
  expect(reportCreates).toBe(1);
  await expect(
    page.locator(
      '#pnlwise-business-name-history option[value="Draft Recovery Studio"]',
    ),
  ).toHaveCount(1);

  const stranger = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/report/${reportId}`);
  await expect(strangerPage.getByRole("alert")).toContainText(
    "report is unavailable",
  );
  await expect(
    strangerPage.getByText("Loading your report…", { exact: true }),
  ).toHaveCount(0);
  await strangerPage.goto(`/generate?report=${reportId}`);
  await expect(strangerPage.getByRole("alert")).toContainText(
    "saved draft is unavailable",
  );
  await expect(strangerPage).toHaveURL(/\/generate$/);
  await stranger.close();

  await page.route("**/api/reports/expired-draft", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This report is unavailable in this browser or has expired.",
      }),
    }),
  );
  await page.goto("/generate?report=expired-draft");
  await expect(page.getByRole("alert")).toContainText(
    "saved draft is unavailable",
  );
  await expect(page).toHaveURL(/\/generate$/);
  await page.unroute("**/api/reports/expired-draft");

  await page.goto("/generate?report=not-a-report-id");
  await expect(page.getByRole("alert")).toContainText(
    "saved draft is unavailable",
  );
  await expect(page).toHaveURL(/\/generate$/);
});

test("anonymous upload, review, loan split, P&L, unpaid export, and delete", async ({
  page,
  request,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your bank statements.",
  );
  await page
    .getByRole("link", { name: "Upload bank statements" })
    .first()
    .click();
  await page.getByLabel("Upload bank statements").setInputFiles(fixture);
  await page
    .getByRole("combobox", { name: "Business type", exact: true })
    .click();
  await page.getByRole("option", { name: "Consulting", exact: true }).click();
  await page.getByPlaceholder("Your business name").fill("Acme Test Studio");
  await page.getByRole("button", { name: "Analyze statements" }).click();
  await expect(
    page.getByRole("heading", { name: "Match your statement columns" }),
  ).toBeVisible();
  for (const [field, column] of [
    ["date", "Date"],
    ["description", "Description"],
    ["amount", "Amount"],
    ["currency", "Currency"],
  ]) {
    await page.getByRole("combobox", { name: `Map ${field}` }).click();
    await page.getByRole("option", { name: column, exact: true }).click();
  }
  await page.getByRole("combobox", { name: "Amount convention" }).click();
  await page
    .getByRole("option", { name: "Positive = money in / credit" })
    .click();
  await page.getByRole("button", { name: "Use these columns" }).click();
  await expect(page).toHaveURL(/generate\/review\?report=/, { timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "Review your transactions." }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("report")!;
  const payload = (await page.evaluate(async (reportId) => {
    const response = await fetch(`/api/reports/${reportId}`);
    return response.json();
  }, id)) as {
    report: {
      transactions: unknown[];
      statements: { amountConvention?: string }[];
    };
    reviewCount: number;
  };
  expect(payload.report.transactions).toHaveLength(8);
  expect(payload.report.statements[0].amountConvention).toBe("credit-positive");
  expect(payload.reviewCount).toBe(4);
  await page.goto(`/generate/processing?report=${id}`);
  await expect(page).toHaveURL(
    new RegExp(`/generate/review\\?report=${id}$`),
  );
  const stranger = await browser.newContext();
  const other = await stranger.request.get(`/api/reports/${id}`);
  expect([401, 404]).toContain(other.status());
  await stranger.close();
  await page.screenshot({ path: "outputs/review-desktop.png", fullPage: true });
  const loan = page.getByRole("row").filter({ hasText: "Loan payment" });
  await loan.getByRole("button", { name: "Split interest" }).click();
  await page.getByPlaceholder("0.00").fill("25.00");
  await page.getByRole("button", { name: "Save split" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Category for Coffee shop" })
    .click();
  await page.getByRole("option", { name: "Personal", exact: true }).click();
  await page.getByRole("button", { name: "Just this transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Confirm Loan deposit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm Owner draw", exact: true })
    .click();
  await expect(page.getByText("No transactions need review.")).toBeVisible();
  await page
    .getByRole("button", { name: "Generate P&L", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/report/${id}`));
  await expect(
    page.getByText("Your P&L is ready.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/generate/review?report=${id}`);
  await expect(page).toHaveURL(new RegExp(`/report/${id}$`));
  await expect(page.locator(".profit-metric strong")).toHaveText("$6,090.00");
  await page.getByRole("tab", { name: "Detailed", exact: true }).click();
  await expect(page.locator(".report-category details").first()).toBeVisible();
  await page.screenshot({ path: "outputs/report-desktop.png", fullPage: true });
  const unpaidStatus = await page.evaluate(async (reportId) => {
    const response = await fetch(`/api/reports/${reportId}/export/pdf`);
    return response.status;
  }, id);
  expect(unpaidStatus).toBe(402);
  const noOrigin = await request.post("/api/reports", {
    data: { businessType: "Other" },
  });
  expect(noOrigin.status()).toBe(403);
  await page.getByRole("button", { name: "Download my P&L" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Purchases are not enabled",
  );
  await page.getByRole("button", { name: "Back to preview" }).click();
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete my data" })
    .click();
  await expect(page).toHaveURL(/\/generate$/);
  expect([401, 404]).toContain(
    (await page.request.get(`/api/reports/${id}`)).status(),
  );
  expect(errors).toEqual([]);
});
test("mobile sample, navigation and upload have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/generate",
    "/report/sample",
    "/pricing",
    "/bank-statement-to-pnl",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (path === "/")
      await page.screenshot({
        path: "outputs/home-mobile.png",
        fullPage: true,
      });
    if (path === "/report/sample")
      await page.screenshot({
        path: "outputs/report-mobile.png",
        fullPage: true,
      });
  }
});
test("public SEO and private robots", async ({ page, request }) => {
  await page.goto("/bank-statement-to-pnl");
  await expect(page).toHaveTitle(/Bank Statement to P&L Generator/);
  expect(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
  ).toMatch(/\/bank-statement-to-pnl$/);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/profit-and-loss-for-1099");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /report/");
  await page.goto("/generate");
  expect(
    await page.locator('meta[name="robots"]').getAttribute("content"),
  ).toContain("noindex");
  const missing = await request.get("/no-such-page");
  expect(missing.status()).toBe(404);
});
