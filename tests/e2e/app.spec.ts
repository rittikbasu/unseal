import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const execFileAsync = promisify(execFile);
const fixture = "tests/fixtures/encrypted.pdf";
const password = "bank-test-2026";

test("guides a user from a protected PDF to a shareable copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "make a shareable copy" })).toBeVisible();
  await expect(page.getByText("your file stays on this device")).toBeVisible();

  await page.locator("#pdf-file").setInputFiles(fixture);
  await expect(page.getByText("encrypted.pdf")).toBeVisible();
  await expect(page.getByLabel("PDF password")).toBeVisible();

  await page.getByLabel("PDF password").fill(password);
  await page.getByRole("button", { name: "Create shareable copy" }).click();
  await expect(page.locator("#action-title")).toHaveText("your copy is ready");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save to Files" }).click();
  const download = await downloadPromise;

  const tempDir = await mkdtemp(`${tmpdir()}/unsealed-ui-`);
  const outputPath = `${tempDir}/output.pdf`;
  try {
    await download.saveAs(outputPath);
    const { stdout } = await execFileAsync("pdfinfo", [outputPath]);
    expect(stdout).toContain("Encrypted:       no");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("shows a calm error for an incorrect password", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await page.getByLabel("PDF password").fill("not-the-password");
  await page.getByRole("button", { name: "Create shareable copy" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open that PDF with this password");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("does not expose engine details for a malformed PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles("tests/fixtures/corrupted.pdf");
  await page.getByLabel("PDF password").fill("anything");
  await page.getByRole("button", { name: "Create shareable copy" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open that PDF with this password");
  await expect(page.getByRole("alert")).not.toContainText("corrupted.pdf");
});
