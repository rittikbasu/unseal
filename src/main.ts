import "./styles.css";
import { decryptPdf } from "./pdf-service";
import { airGapMark, unboundMark } from "./brand";

type Stage =
  | { kind: "choose"; message?: string }
  | { kind: "password"; file: File }
  | { kind: "processing"; file: File }
  | { kind: "ready"; file: File; output: Uint8Array; outputName: string; message?: string }
  | { kind: "error"; file: File; message: string };

declare global {
  interface Window {
    __unsealedPdf?: {
      decrypt(input: Uint8Array, password: string): Promise<Uint8Array>;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("unseal app root is missing");
}

const GENERIC_PDF_ERROR = "We couldn't open this PDF. Check the password and try again.";
const EMPTY_PASSWORD_ERROR = "Enter the PDF password to continue.";
let stage: Stage = { kind: "choose" };
let outputUrl: string | undefined;
let keyboardModality = false;

const documentIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" class="document-icon">
    <path d="M6.5 2.75h7.3L18 6.95v14.3H6.5z" />
    <path d="M13.75 2.75v4.2H18M9.5 11h5M9.5 14.5h5M9.5 18h3" />
  </svg>
`;

const chevronIcon = `
  <svg viewBox="0 0 16 16" aria-hidden="true" class="chevron-icon">
    <path d="m6 3 5 5-5 5" />
  </svg>
`;

const shareIcon = `
  <svg viewBox="0 0 16 16" aria-hidden="true" class="button-icon">
    <path d="M8 10.5V2.75M5.25 5.5 8 2.75l2.75 2.75M3.5 8.5v3A1.75 1.75 0 0 0 5.25 13.25h5.5a1.75 1.75 0 0 0 1.75-1.75v-3" />
  </svg>
`;

const downloadIcon = `
  <svg viewBox="0 0 16 16" aria-hidden="true" class="button-icon">
    <path d="M8 2.75v7.5M5.25 7.75 8 10.5l2.75-2.75M3.25 13.25h9.5" />
  </svg>
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} kb`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

function filenameWithoutPdf(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/\s+$/, "") || "document";
}

function outputName(file: File): string {
  return `${filenameWithoutPdf(file.name)}-unsealed.pdf`;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function header(): string {
  return `
    <header class="site-header">
      <div class="brand-lockup" aria-label="unseal">
        ${unboundMark("brand-mark")}
        <span class="brand-name">unseal</span>
      </div>
    </header>
  `;
}

function hero(stageToDescribe: Stage): string {
  if (stageToDescribe.kind === "choose") {
    return `
      <p class="hero-kicker">one pdf, on this device</p>
      <h1 id="page-title">Create an <em>unprotected copy.</em></h1>
      <p class="hero-copy">Use the password you already know. The original stays untouched.</p>
    `;
  }

  if (stageToDescribe.kind === "processing") {
    return `
      <p class="hero-kicker">working locally</p>
      <h1 id="page-title">Creating an <em>unprotected copy…</em></h1>
      <p class="hero-copy">The PDF never leaves this device.</p>
    `;
  }

  if (stageToDescribe.kind === "ready") {
    return `
      <p class="hero-kicker">complete</p>
      <h1 id="page-title">Your <em>unprotected copy</em> is ready.</h1>
      <p class="hero-copy">It opens without a password. The original is unchanged.</p>
    `;
  }

  return `
    <p class="hero-kicker">one pdf, on this device</p>
    <h1 id="page-title">Enter the <em>PDF password.</em></h1>
    <p class="hero-copy">Use the password you already have. It exists only while this copy is being created.</p>
  `;
}

function privacyRail(): string {
  return `
    <aside class="privacy-rail" aria-label="Privacy details">
      <div class="privacy-mark">${unboundMark("privacy-mark-svg")}</div>
      <div class="privacy-copy">
        <strong>stays on this device</strong>
        <span>your PDF and password are processed in memory. nothing is uploaded.</span>
      </div>
      <span class="privacy-note">original untouched</span>
    </aside>
  `;
}

function hiddenFileInput(label: string, overlay = false): string {
  const className = overlay ? "file-input" : "file-input visually-hidden";
  return `<input id="pdf-file" class="${className}" type="file" accept="application/pdf,.pdf" aria-label="${escapeHtml(label)}" />`;
}

function chooseStage(stageToRender: Extract<Stage, { kind: "choose" }>): string {
  return `
    <section class="task-surface choose-surface" aria-labelledby="surface-title">
      <div class="surface-heading">
        <div>
          <p class="surface-kicker">start here</p>
          <h2 id="surface-title">Choose a protected PDF</h2>
        </div>
        <span class="step-count">1 / 2</span>
      </div>
      <label class="file-picker" for="pdf-file">
        ${hiddenFileInput("Choose a PDF from Files", true)}
        <span class="file-picker-icon">${documentIcon}</span>
        <span class="file-picker-copy">
          <strong>Choose PDF</strong>
          <span>from Files</span>
        </span>
        ${chevronIcon}
      </label>
      ${stageToRender.message ? `<p id="choose-error" class="inline-error" role="alert">${escapeHtml(stageToRender.message)}</p>` : ""}
    </section>
  `;
}

function selectedFileRow(file: File, allowChange = true): string {
  return `
    <div class="selected-file">
      <div class="file-icon">${documentIcon}</div>
      <div class="file-details">
        <span class="file-state">protected original</span>
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · PDF</span>
      </div>
      ${allowChange ? '<button type="button" class="text-button" data-action="change-file">Change PDF</button>' : ""}
    </div>
  `;
}

function passwordStage(file: File, error?: string): string {
  return `
    <section class="task-surface password-surface" aria-labelledby="surface-title">
      <div class="surface-heading">
        <div>
          <p class="surface-kicker">step two</p>
          <h2 id="surface-title">Enter the PDF password</h2>
        </div>
        <span class="step-count">2 / 2</span>
      </div>
      ${selectedFileRow(file)}
      ${hiddenFileInput("Choose a different PDF")}
      <form id="unlock-form" novalidate>
        <label class="field-label" for="pdf-password">Password</label>
        <div class="password-field">
          <input
            id="pdf-password"
            class="password-input is-masked"
            name="pdf-passphrase"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            aria-describedby="password-hint${error ? " password-error" : ""}"
            aria-invalid="${error ? "true" : "false"}"
            aria-label="PDF password"
          />
          <button type="button" class="text-button reveal-button" data-action="toggle-password" aria-pressed="false">Show</button>
        </div>
        <p id="password-hint" class="field-hint">The password is used in memory and never saved.</p>
        ${error ? `<p id="password-error" class="inline-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <button class="primary-button" type="submit">Create unprotected copy</button>
      </form>
    </section>
  `;
}

function processingStage(file: File): string {
  return `
    <section class="task-surface processing-surface" aria-labelledby="surface-title" aria-live="polite" aria-busy="true">
      <div class="surface-heading">
        <div>
          <p class="surface-kicker">working locally</p>
          <h2 id="surface-title">Creating your copy</h2>
        </div>
        <span class="step-count">2 / 2</span>
      </div>
      ${selectedFileRow(file, false)}
      <div class="processing-status" role="status">
        <span class="processing-pulse" aria-hidden="true"></span>
        <span>Removing the password protection…</span>
      </div>
    </section>
  `;
}

function outputFileForStage(stageToRender: Extract<Stage, { kind: "ready" }>): File {
  return new File([new Uint8Array(stageToRender.output).buffer as ArrayBuffer], stageToRender.outputName, { type: "application/pdf" });
}

function readyStage(stageToRender: Extract<Stage, { kind: "ready" }>): string {
  const file = outputFileForStage(stageToRender);
  const canSaveOrShare = canShareFile(file);
  const primaryLabel = canSaveOrShare ? "Save or share" : "Download copy";
  const primaryIcon = canSaveOrShare ? shareIcon : downloadIcon;

  return `
    <section class="task-surface ready-surface" aria-labelledby="surface-title">
      <div class="surface-heading ready-heading">
        <div>
          <p class="surface-kicker">complete</p>
          <h2 id="surface-title" tabindex="-1">Unprotected copy ready</h2>
        </div>
        <span class="ready-badge"><span></span>ready</span>
      </div>
      <div class="release-mark-wrap">${airGapMark()}</div>
      <div class="result-file">
        <div class="result-file-icon">${documentIcon}</div>
        <div class="file-details">
          <span class="file-state">new copy</span>
          <strong title="${escapeHtml(stageToRender.outputName)}">${escapeHtml(stageToRender.outputName)}</strong>
          <span>PDF · opens without a password</span>
        </div>
      </div>
      <p class="result-note">Anyone with this copy can open it.</p>
      ${stageToRender.message ? `<p class="inline-error" role="alert">${escapeHtml(stageToRender.message)}</p>` : ""}
      <div class="action-stack">
        <button class="primary-button" type="button" data-action="save-output" aria-label="${primaryLabel}">${primaryIcon}<span>${primaryLabel}</span></button>
        ${stageToRender.message ? '<button class="secondary-button" type="button" data-action="download-copy">Download copy</button>' : ""}
      </div>
      <button class="text-button reset-button" type="button" data-action="start-over">Choose another PDF</button>
    </section>
  `;
}

function stageMarkup(): string {
  if (stage.kind === "choose") return chooseStage(stage);
  if (stage.kind === "password") return passwordStage(stage.file);
  if (stage.kind === "processing") return processingStage(stage.file);
  if (stage.kind === "ready") return readyStage(stage);
  return passwordStage(stage.file, stage.message);
}

function render(): void {
  const root = app as HTMLDivElement;
  root.dataset.stage = stage.kind;
  root.innerHTML = `
    <div class="app-frame">
      ${header()}
      <main class="app-main">
        <div class="content-grid">
          <section class="identity-panel" aria-labelledby="page-title">
            ${hero(stage)}
          </section>
          <div class="task-area">
            ${stageMarkup()}
          </div>
        </div>
        ${stage.kind === "choose" ? privacyRail() : ""}
      </main>
    </div>
  `;

  bindEvents();

  if (stage.kind === "password" || stage.kind === "error") {
    const input = document.querySelector<HTMLInputElement>("#pdf-password");
    input?.focus();
  }

  if (stage.kind === "ready") {
    document.querySelector<HTMLElement>("#surface-title")?.focus();
  }

  updateKeyboardMode();
}

function openFilePicker(): void {
  const input = document.querySelector<HTMLInputElement>("#pdf-file");
  if (!input) return;
  input.value = "";
  input.click();
}

function selectFile(file: File | undefined): void {
  if (!file) return;
  if (!isPdf(file)) {
    stage = { kind: "choose", message: "Choose a PDF file to continue." };
    render();
    document.querySelector<HTMLInputElement>("#pdf-file")?.focus();
    return;
  }
  stage = { kind: "password", file };
  render();
}

async function unlock(file: File, password: string): Promise<void> {
  if (!password) {
    stage = { kind: "error", file, message: EMPTY_PASSWORD_ERROR };
    render();
    return;
  }

  stage = { kind: "processing", file };
  render();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const output = await decryptPdf(bytes, password);
    stage = { kind: "ready", file, output, outputName: outputName(file) };
    render();
  } catch {
    stage = { kind: "error", file, message: GENERIC_PDF_ERROR };
    render();
  }
}

function outputFile(): File | undefined {
  if (stage.kind !== "ready") return undefined;
  return outputFileForStage(stage);
}

type ShareFileFunction = (data: { files: File[]; title: string }) => Promise<void>;
type ShareResult = "shared" | "cancelled" | "failed";

function shareFunction(): ShareFileFunction | undefined {
  const candidate = Reflect.get(navigator, "share");
  return typeof candidate === "function" ? candidate.bind(navigator) as ShareFileFunction : undefined;
}

function canShareFile(file: File): boolean {
  const share = shareFunction();
  const canShare = Reflect.get(navigator, "canShare");
  if (!share) return false;
  if (typeof canShare !== "function") return true;
  try {
    return Boolean(canShare.call(navigator, { files: [file] }));
  } catch {
    return false;
  }
}

async function nativeShare(file: File): Promise<ShareResult> {
  const share = shareFunction();
  if (!share || !canShareFile(file)) return "failed";

  try {
    await share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "failed";
  }
}

function directDownload(file: File): void {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = outputUrl;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function saveOutput(): Promise<void> {
  const file = outputFile();
  if (!file) return;

  if (canShareFile(file)) {
    const result = await nativeShare(file);
    if (result === "failed" && stage.kind === "ready") {
      stage = { ...stage, message: "The share sheet didn't open. Try again or download the copy." };
      render();
    }
    return;
  }

  directDownload(file);
}

function downloadCopy(): void {
  const file = outputFile();
  if (file) directDownload(file);
}

function bindEvents(): void {
  const fileInput = document.querySelector<HTMLInputElement>("#pdf-file");
  fileInput?.addEventListener("change", () => selectFile(fileInput.files?.[0]));

  document.querySelectorAll<HTMLButtonElement>('[data-action="change-file"]').forEach((button) => {
    button.addEventListener("click", openFilePicker);
  });

  document.querySelector<HTMLFormElement>("#unlock-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (stage.kind !== "password" && stage.kind !== "error") return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void unlock(stage.file, String(form.get("pdf-passphrase") ?? ""));
  });

  document.querySelector<HTMLInputElement>("#pdf-password")?.addEventListener("input", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    input.setAttribute("aria-invalid", "false");
  });

  document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const input = document.querySelector<HTMLInputElement>("#pdf-password");
    if (!input) return;
    const showing = !input.classList.contains("is-masked");
    input.classList.toggle("is-masked", showing);
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-pressed", String(!showing));
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });

  document.querySelector<HTMLButtonElement>('[data-action="save-output"]')?.addEventListener("click", () => {
    void saveOutput();
  });

  document.querySelector<HTMLButtonElement>('[data-action="download-copy"]')?.addEventListener("click", downloadCopy);

  document.querySelector<HTMLButtonElement>('[data-action="start-over"]')?.addEventListener("click", () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = undefined;
    stage = { kind: "choose" };
    render();
  });
}

function updateKeyboardMode(): void {
  const root = app as HTMLDivElement;
  const viewport = window.visualViewport;
  const activeElement = document.activeElement;
  const inputFocused = activeElement instanceof HTMLInputElement && activeElement.id === "pdf-password";
  const keyboardOpen = Boolean(
    inputFocused
      && viewport
      && viewport.height < window.innerHeight - 160,
  );
  root.dataset.keyboard = keyboardOpen ? "true" : "false";
}

document.addEventListener("keydown", (event) => {
  if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
    keyboardModality = true;
  }
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.id === "pdf-password") {
    active.closest(".password-field")?.classList.add("is-keyboard-focus");
  }
}, true);

document.addEventListener("pointerdown", () => {
  keyboardModality = false;
  document.querySelector(".password-field.is-keyboard-focus")?.classList.remove("is-keyboard-focus");
}, true);

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "pdf-password") return;
  target.closest(".password-field")?.classList.toggle("is-keyboard-focus", keyboardModality);
  updateKeyboardMode();
});

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "pdf-password") updateKeyboardMode();
});

window.visualViewport?.addEventListener("resize", updateKeyboardMode);
window.addEventListener("resize", updateKeyboardMode);

if (import.meta.env.DEV) {
  window.__unsealedPdf = { decrypt: decryptPdf };
}

render();
