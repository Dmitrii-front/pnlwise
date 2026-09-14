import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
const fixture = resolve("tests/fixtures/business.csv");
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
  await expect(page).toHaveURL(/generate\/review\?report=/, { timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "Review your transactions." }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("report")!;
  const response = await page.request.get(`/api/reports/${id}`);
  const payload = await response.json();
  expect(payload.report.transactions).toHaveLength(8);
  expect(payload.reviewCount).toBe(4);
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
  await expect(page.locator(".profit-metric strong")).toHaveText("$6,090.00");
  await page.getByRole("tab", { name: "Detailed", exact: true }).click();
  await expect(page.locator(".report-category details").first()).toBeVisible();
  await page.screenshot({ path: "outputs/report-desktop.png", fullPage: true });
  const unpaid = await page.request.get(`/api/reports/${id}/export/pdf`);
  expect(unpaid.status()).toBe(402);
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
