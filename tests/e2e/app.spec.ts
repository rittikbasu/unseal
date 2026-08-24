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
  await expect(input).toHaveAttribute("autocomplete", "one-time-code");
  await expect(input).toHaveAttribute("rows", "1");
  await expect(input).toHaveClass(/is-masked/);
  await input.fill(value);
}

test("uses the supplied envelope identity and exact opening copy", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Unseal your password protected PDF.");
  await expect(page.getByRole("heading", { name: "Unseal your password protected PDF." })).toBeVisible();
  await expect(page.getByText("Create a copy that opens without a password. Your PDF never leaves this device.")).toBeVisible();
  await expect(page.locator(".brand-mark")).toHaveAttribute("src", "/unseal-envelope.png");
  await expect(page.locator(".brand-mark")).toHaveCSS("height", "28px");
  await expect(page.locator(".brand-name")).toHaveCSS("font-size", "28px");
  await expect(page.locator(".brand-name")).toHaveCSS("font-weight", "500");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.png");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("type", "image/png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
  await expect(page.locator('[data-lucide="file-lock"]')).toHaveCount(1);
  await expect(page.locator('[data-lucide="file"]')).toHaveCount(0);
  await expect(page.locator(".panel-bar > span")).toHaveCount(0);
  await expect(page.getByText("Anyone with this copy can open it.")).toHaveCount(0);

  const heart = page.locator(".signature-heart");
  await expect(heart).toHaveAttribute("viewBox", "0 0 650 900");
  await expect(page.getByRole("link", { name: "made with love by rittik, visit rittik.fyi" })).toHaveAttribute("href", "https://rittik.fyi");
});

test("uses the full desktop page track for the stacked task card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const initial = await page.locator(".flow-panel").boundingBox();
  if (!initial) throw new Error("initial task card is missing");
  expect(initial.width).toBeGreaterThanOrEqual(670);

  await page.locator("#pdf-file").setInputFiles(fixture);
  const passwordPanel = await page.locator(".flow-panel").boundingBox();
  const fileRow = await page.locator(".file-row").boundingBox();
  if (!passwordPanel || !fileRow) throw new Error("password task card geometry is missing");
  expect(passwordPanel.width).toBeGreaterThanOrEqual(670);
  expect(fileRow.width).toBeGreaterThanOrEqual(625);
  expect(fileRow.height).toBeLessThan(100);
  const intro = await page.locator(".intro").boundingBox();
  const subtitle = await page.locator(".intro p").boundingBox();
  if (!intro || !subtitle) throw new Error("desktop intro geometry is missing");
  expect(intro.width).toBeLessThanOrEqual(672);
  expect(Math.abs(passwordPanel.x - intro.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((passwordPanel.x + passwordPanel.width) - (intro.x + intro.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(subtitle.x - intro.x)).toBeLessThanOrEqual(1);
  expect(subtitle.width).toBe(intro.width);
  expect(subtitle.height).toBeLessThan(30);
  expect(await page.locator(".intro h1").evaluate((element) => getComputedStyle(element).fontSize)).toBe("60px");
  expect(await page.locator(".intro p").evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  expect(await page.locator(".password-grid").evaluate((element) => getComputedStyle(element).display)).toBe("block");

  const privacy = await page.locator(".privacy-line").boundingBox();
  if (!privacy) throw new Error("privacy line geometry is missing");
  expect(Math.abs(privacy.x - passwordPanel.x)).toBeLessThanOrEqual(1);
  expect(privacy.width).toBe(passwordPanel.width);
  expect(await page.locator(".privacy-line").evaluate((element) => getComputedStyle(element).gap)).toBe("5px");
  await expect(page.locator(".panel-bar > span")).toHaveCount(0);
});

test("treats a PDF password as a one-off document secret, not a login credential", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);

  const input = page.getByLabel("PDF password");
  expect(await input.evaluate((element) => document.activeElement === element)).toBe(false);
  await expect(input).not.toBeFocused();
  await expect(input).toHaveAttribute("id", "document-value");
  expect(await input.evaluate((element) => element.tagName)).toBe("TEXTAREA");
  await expect(input).toHaveAttribute("autocomplete", "one-time-code");
  await expect(input).toHaveAttribute("rows", "1");
  await expect(input).toHaveAttribute("inputmode", "text");
  expect(await input.getAttribute("name")).toBeNull();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(input).toHaveCSS("-webkit-text-security", "disc");
  await expect(page.getByText("used once, never saved", { exact: true })).toBeVisible();
  const revealButton = page.getByRole("button", { name: "show password" });
  await expect(revealButton.locator("span")).toHaveCount(0);
  await input.fill(password);
  await input.focus();
  await revealButton.click();
  await expect(input).not.toHaveClass(/is-masked/);
  expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);
  await page.getByRole("button", { name: "hide password" }).click();
  await expect(input).toHaveClass(/is-masked/);
  expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);

  await page.evaluate(() => {
    (window as Window & { __credentialFormSubmitted?: boolean }).__credentialFormSubmitted = false;
    document.addEventListener("submit", () => {
      (window as Window & { __credentialFormSubmitted?: boolean }).__credentialFormSubmitted = true;
    }, { capture: true, once: true });
  });

  await input.fill(password);
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Your copy is ready." })).toBeVisible();
  await expect(page.getByLabel("PDF password")).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & { __credentialFormSubmitted?: boolean }).__credentialFormSubmitted)).toBe(false);
});

test("waits for the local font before revealing the interface", async ({ page }) => {
  await page.addInitScript(() => {
    const originalLoad = document.fonts.load.bind(document.fonts);
    Object.defineProperty(document.fonts, "load", {
      configurable: true,
      value: async (font: string, text?: string) => {
        await new Promise((resolve) => setTimeout(resolve, 650));
        return originalLoad(font, text);
      },
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator("html");
  const appRoot = page.locator("#app");

  await expect(root).toHaveClass(/fonts-loading/);
  await expect(appRoot).toHaveCSS("visibility", "hidden");
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
  await expect(root).toHaveClass(/fonts-ready/);
  await expect(appRoot).toHaveCSS("visibility", "visible");
});

test("balances the initial flow and signature inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".brand-mark")).toHaveCSS("height", "26px");
  await expect(page.locator(".brand-name")).toHaveCSS("font-size", "26px");

  const signature = page.getByRole("contentinfo");
  const signatureLink = signature.getByRole("link", { name: "made with love by rittik, visit rittik.fyi" });
  await expect(signature).toBeVisible();
  await expect(signatureLink).toHaveAttribute("href", "https://rittik.fyi");
  const footerWeights = await page.evaluate(() => {
    const link = document.querySelector(".project-signature a");
    const name = document.querySelector(".project-signature strong");
    if (!link || !name) throw new Error("footer signature is missing");
    return { link: getComputedStyle(link).fontWeight, name: getComputedStyle(name).fontWeight };
  });
  expect(footerWeights.name).toBe(footerWeights.link);

  const geometry = await page.evaluate(() => {
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    const experience = document.querySelector(".experience")?.getBoundingClientRect();
    const footer = document.querySelector(".project-signature")?.getBoundingClientRect();
    if (!header || !experience || !footer) throw new Error("mobile composition regions are missing");
    const availableCenter = (header.bottom + footer.top) / 2;
    const experienceCenter = (experience.top + experience.bottom) / 2;
    return {
      centerDelta: Math.abs(availableCenter - experienceCenter),
      footerBottom: footer.bottom,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  expect(geometry.centerDelta).toBeLessThanOrEqual(40);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.innerHeight + 1);
});

test("keeps iPhone focus sizing intentional without disabling page zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);

  const input = page.getByLabel("PDF password");
  await input.click();
  await expect(page.locator(".password-field")).toHaveCSS("border-color", "rgb(111, 150, 232)");
  await expect(input).toHaveCSS("font-size", "16px");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).not.toContain("maximum-scale");
  expect(viewport).not.toContain("user-scalable=no");
});

test("animates state changes with the View Transitions API when available", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount = 0;
    const original = Reflect.get(document, "startViewTransition");
    if (typeof original !== "function") return;
    Reflect.set(document, "startViewTransition", (update: () => void) => {
      (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount =
        ((window as Window & { __viewTransitionCount?: number }).__viewTransitionCount ?? 0) + 1;
      return original.call(document, update);
    });
  });

  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await expect.poll(() => page.evaluate(() => (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount)).toBe(1);
});

test("uses a restrained fallback animation without View Transitions", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await expect(page.locator(".flow-panel")).toHaveCSS("animation-name", "stage-enter");
});

test("suppresses state motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount = 0;
    const original = Reflect.get(document, "startViewTransition");
    if (typeof original !== "function") return;
    Reflect.set(document, "startViewTransition", (update: () => void) => {
      (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount =
        ((window as Window & { __viewTransitionCount?: number }).__viewTransitionCount ?? 0) + 1;
      return original.call(document, update);
    });
  });

  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await expect.poll(() => page.evaluate(() => (window as Window & { __viewTransitionCount?: number }).__viewTransitionCount)).toBe(0);
  await expect(page.locator(".flow-panel")).toHaveCSS("animation-name", "none");
});

test("keeps the password step in place while creating a copy", async ({ page }) => {
  await page.goto("/");
  await enterPassword(page, password);
  const header = await page.locator(".site-header").evaluate((element) => {
    (window as Window & { __headerNode?: HTMLElement }).__headerNode = element;
    return true;
  });
  expect(header).toBe(true);
  await page.evaluate(() => {
    (window as Window & { __processingPainted?: boolean }).__processingPainted = false;
    const observer = new MutationObserver(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-action="create-copy"]');
      if (!button?.disabled || !button.querySelector('[data-lucide="loader-circle"]')) return;
      requestAnimationFrame(() => {
        if (document.querySelector('[data-action="create-copy"]:disabled [data-lucide="loader-circle"]')) {
          (window as Window & { __processingPainted?: boolean }).__processingPainted = true;
        }
      });
    });
    observer.observe(document.querySelector("#app") as HTMLElement, { childList: true, subtree: true, attributes: true });
  });

  const input = page.getByLabel("PDF password");
  await page.getByRole("button", { name: "Create copy" }).click();
  const createButton = page.locator('[data-action="create-copy"]');
  await expect(createButton).toBeDisabled();
  await expect(createButton).toContainText("Creating copy");
  await expect(input).toHaveValue(password);
  await expect(createButton.locator('[data-lucide="loader-circle"]')).toBeVisible();
  await expect(page.locator(".processing-panel")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your copy is ready." })).toBeVisible();
  await expect(page.getByLabel("PDF password")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const headerNode = (window as Window & { __headerNode?: HTMLElement }).__headerNode;
    return headerNode === document.querySelector(".site-header");
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as Window & { __processingPainted?: boolean }).__processingPainted)).toBe(true);
});

test("guides a user from a protected PDF to an unprotected copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Unseal your password protected PDF." })).toBeVisible();
  await expect(page.getByText("Processed on this device. Nothing is uploaded.")).toBeVisible();
  await expect(page.getByText("local only")).toHaveCount(0);

  await enterPassword(page, password);
  await expect(page.locator(".password-field")).toHaveCSS("border-color", "rgb(111, 150, 232)");
  const fieldStyles = await page.locator(".password-field").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { boxShadow: styles.boxShadow };
  });
  expect(fieldStyles.boxShadow).not.toBe("none");
  await expect(page.getByRole("button", { name: "Create copy" })).toBeVisible();
  await page.getByRole("button", { name: "Create copy" }).click();
  await expect(page.getByRole("heading", { name: "Your copy is ready." })).toBeVisible();
  await expect(page.locator('[data-lucide="file"]')).toHaveCount(1);
  await expect(page.locator('[data-lucide="file-lock"]')).toHaveCount(0);
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
  await page.getByRole("button", { name: "Create copy" }).click();

  await expect(page.getByRole("alert")).toHaveText("Wrong password. Try again.");
  await expect(page.getByLabel("PDF password")).toHaveValue("not-the-password");
  await expect(page.getByRole("button", { name: "Create copy" })).toBeVisible();
});

test("does not expose engine details or filenames for a malformed PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles("tests/fixtures/corrupted.pdf");
  await page.getByLabel("PDF password").fill("anything");
  await page.getByRole("button", { name: "Create copy" }).click();

  await expect(page.getByRole("alert")).toHaveText("Wrong password. Try again.");
  await expect(page.getByRole("alert")).not.toContainText("corrupted.pdf");
  await expect(page.getByRole("alert")).not.toContainText("qpdf");
});

test("recovers for a later request after the PDF worker fails", async ({ page }) => {
  await page.addInitScript(() => {
    let failed = false;
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      if (!failed) {
        failed = true;
        setTimeout(() => this.dispatchEvent(new ErrorEvent("error")), 0);
        return;
      }
      return originalPostMessage.apply(this, args);
    };
  });

  await page.goto("/");
  await enterPassword(page, password);
  await page.getByRole("button", { name: "Create copy" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong password. Try again.");
  await expect(page.getByLabel("PDF password")).toHaveValue(password);

  await page.getByRole("button", { name: "Create copy" }).click();
  await expect(page.getByRole("heading", { name: "Your copy is ready." })).toBeVisible();
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
  await page.getByRole("button", { name: "Create copy" }).click();
  await expect(page.getByRole("heading", { name: "Your copy is ready." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save or share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download copy" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save or share" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __sharedFileName?: string }).__sharedFileName)).toBe("encrypted-unsealed.pdf");
});

test("requires a password before starting PDF processing", async ({ page }) => {
  await page.goto("/");
  await page.locator("#pdf-file").setInputFiles(fixture);
  await page.getByRole("button", { name: "Create copy" }).click();

  await expect(page.getByRole("alert")).toContainText("Enter the PDF password");
  await expect(page.getByLabel("PDF password")).toHaveAttribute("aria-invalid", "true");
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
