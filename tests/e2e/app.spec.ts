import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const execFileAsync = promisify(execFile);
const fixture = "tests/fixtures/encrypted.pdf";
const password = "bank-test-2026";

async function enterPassword(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.locator("#pdf-file").setInputFiles(fixture);
  const input = page.locator("#pdf-password");
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveAttribute("autocomplete", "off");
  await expect(input).toHaveAttribute("name", "pdf-passphrase");
  await expect(input).toHaveClass(/is-masked/);
  await input.fill(value);
}

test("guides a user from a protected PDF to an unprotected copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create an unprotected copy." })).toBeVisible();
  await expect(page.getByText("stays on this device")).toBeVisible();
  await expect(page.getByText("local only")).toHaveCount(0);

  await enterPassword(page, password);
  const fieldStyles = await page.locator(".password-field").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { boxShadow: styles.boxShadow, borderColor: styles.borderColor };
  });
  expect(fieldStyles.boxShadow).toBe("none");
  expect(fieldStyles.borderColor).not.toContain("94, 92, 230");
  await expect(page.getByRole("button", { name: "Create unprotected copy" })).toBeVisible();
  await page.getByRole("button", { name: "Create unprotected copy" }).click();
  await expect(page.getByRole("heading", { name: "Unprotected copy ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share PDF" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download copy" }).click();
  const download = await downloadPromise;

  const tempDir = await mkdtemp(`${tmpdir()}/unseal-ui-`);
  const outputPath = `${tempDir}/output.pdf`;
  try {
    await download.saveAs(outputPath);
    const { stdout } = await execFileAsync("pdfinfo", [outputPath]);
    expect(stdout).toContain("Encrypted:       no");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("shows an inline error for an incorrect password", async ({ page }) => {
  await page.goto("/");
  await enterPassword(page, "not-the-password");
  await page.getByRole("button", { name: "Create unprotected copy" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open this PDF");
  await expect(page.getByRole("button", { name: "Create unprotected copy" })).toBeVisible();
});

test("does not expose engine details or filenames for a malformed PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles("tests/fixtures/corrupted.pdf");
  await page.locator("#pdf-password").fill("anything");
  await page.getByRole("button", { name: "Create unprotected copy" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open this PDF");
  await expect(page.getByRole("alert")).not.toContainText("corrupted.pdf");
  await expect(page.getByRole("alert")).not.toContainText("qpdf");
});

test("uses the native file sheet for Save or share on iPhone when supported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        (window as Window & { __sharedFileName?: string }).__sharedFileName = data.files?.[0]?.name;
      },
    });
  });

  await page.goto("/");
  await enterPassword(page, password);
  await page.getByRole("button", { name: "Create unprotected copy" }).click();
  await expect(page.getByRole("heading", { name: "Unprotected copy ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save or share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download copy" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save or share" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __sharedFileName?: string }).__sharedFileName)).toBe("encrypted-unsealed.pdf");
});

test("requires a password before starting PDF processing", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await page.getByRole("button", { name: "Create unprotected copy" }).click();

  await expect(page.getByRole("alert")).toContainText("Enter the PDF password");
  await expect(page.locator("#pdf-password")).toHaveAttribute("aria-invalid", "true");
});

test("does not request external resources on initial load", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4173") externalRequests.push(request.url());
  });

  await page.goto("/");
  await page.waitForTimeout(250);

  expect(externalRequests).toEqual([]);
});
