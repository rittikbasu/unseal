import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const execFileAsync = promisify(execFile);

const fixtures = [
  { file: "encrypted.pdf", password: "bank-test-2026", label: "legacy encrypted" },
  { file: "aes128.pdf", password: "aes-test", label: "aes-128 encrypted" },
  { file: "aes256.pdf", password: "aes-test", label: "aes-256 encrypted" },
];

for (const fixture of fixtures) {
  test(`creates a passwordless PDF in the browser from ${fixture.label} input`, async ({ page }) => {
    const encrypted = await readFile(`tests/fixtures/${fixture.file}`);

    await page.goto("/");
    const output = await page.evaluate(
      async ({ bytes, password }) => {
        const api = (window as Window & {
          __unsealedPdf?: {
            decrypt(input: Uint8Array, password: string): Promise<Uint8Array>;
          };
        }).__unsealedPdf;

        if (!api) {
          throw new Error("browser PDF API is not registered");
        }

        return Array.from(await api.decrypt(new Uint8Array(bytes), password));
      },
      { bytes: Array.from(encrypted), password: fixture.password },
    );

    const tempDir = await mkdtemp(`${tmpdir()}/unsealed-`);
    const outputPath = `${tempDir}/output.pdf`;

    try {
      await writeFile(outputPath, Buffer.from(output));
      const { stdout } = await execFileAsync("pdfinfo", [outputPath]);

      expect(stdout).toContain("Encrypted:       no");
      expect(Buffer.from(output).subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
}
