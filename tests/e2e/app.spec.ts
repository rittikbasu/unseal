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
  const input = page.getByLabel("PDF password");
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveAttribute("autocomplete", "off");
  await expect(input).toHaveAttribute("name", "pdf-passphrase");
  await expect(input).toHaveClass(/is-masked/);
  await input.fill(value);
}

test("guides a user from a protected PDF to a shareable copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make a PDF shareable." })).toBeVisible();
  await expect(page.getByText("local only")).toBeVisible();

  await enterPassword(page, password);
  await expect(page.getByRole("button", { name: "Unlock PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock PDF" }).click();
  await expect(page.getByText("unprotected copy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share PDF" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
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

test("shows an inline error for an incorrect password", async ({ page }) => {
  await page.goto("/");
  await enterPassword(page, "not-the-password");
  await page.getByRole("button", { name: "Unlock PDF" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open that PDF with this password");
  await expect(page.getByRole("button", { name: "Unlock PDF" })).toBeVisible();
});

test("does not expose engine details for a malformed PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles("tests/fixtures/corrupted.pdf");
  await page.getByLabel("PDF password").fill("anything");
  await page.getByRole("button", { name: "Unlock PDF" }).click();

  await expect(page.getByRole("alert")).toContainText("We couldn't open that PDF with this password");
  await expect(page.getByRole("alert")).not.toContainText("corrupted.pdf");
});

test("uses the native file sheet for Download on iPhone when supported", async ({ page }) => {
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
  await page.getByRole("button", { name: "Unlock PDF" }).click();
  await expect(page.getByText("unprotected copy")).toBeVisible();

  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __sharedFileName?: string }).__sharedFileName)).toBe("encrypted-unsealed.pdf");
});
