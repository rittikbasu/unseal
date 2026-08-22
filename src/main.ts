import "./styles.css";
import { decryptPdf } from "./pdf-service";

type Stage =
  | { kind: "choose" }
  | { kind: "password"; file: File }
  | { kind: "processing"; file: File }
  | { kind: "ready"; file: File; output: Uint8Array; outputName: string }
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
  throw new Error("unsealed app root is missing");
}

let stage: Stage = { kind: "choose" };
let outputUrl: string | undefined;

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

const saveIcon = `
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

function header(): string {
  return `
    <header class="topbar">
      <a class="brand" href="/" aria-label="unseal home">unseal</a>
      <span class="local-status"><span class="local-dot"></span>local only</span>
    </header>
  `;
}

function stepBar(label: string, meta: string, action = ""): string {
  return `
    <div class="step-bar">
      <span class="step-label">${label}</span>
      ${action || `<span class="step-meta">${meta}</span>`}
    </div>
  `;
}

function fileRow(file: File, allowChange = true): string {
  return `
    <div class="file-row">
      <div class="file-icon">${documentIcon}</div>
      <div class="file-details">
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · PDF</span>
      </div>
      ${allowChange ? '<button type="button" class="quiet-button" data-action="change-file">Change</button>' : ""}
    </div>
  `;
}

function chooseStage(): string {
  return `
    <section class="task-card" aria-labelledby="page-title">
      ${stepBar("PDF", "1 / 2")}
      <button class="file-picker" type="button" data-action="choose-file">
        <span class="file-picker-icon">${documentIcon}</span>
        <span class="file-picker-copy">
          <strong>Choose a PDF</strong>
          <span>from Files</span>
        </span>
        ${chevronIcon}
      </button>
      <input id="pdf-file" class="visually-hidden" type="file" accept="application/pdf,.pdf" />
    </section>
  `;
}

function passwordStage(file: File, error?: string): string {
  return `
    <section class="task-card" aria-labelledby="page-title">
      ${stepBar("PDF password", "2 / 2", '<button type="button" class="quiet-button" data-action="change-file">Change</button>')}
      ${fileRow(file)}
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
            aria-label="PDF password"
          />
          <button type="button" class="quiet-button reveal-button" data-action="toggle-password" aria-pressed="false">Show</button>
        </div>
        ${error ? `<p class="inline-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <button class="primary-button" type="submit">Unlock PDF</button>
      </form>
    </section>
  `;
}

function processingStage(file: File): string {
  return `
    <section class="task-card processing-card" aria-labelledby="page-title" aria-live="polite">
      ${stepBar("PDF password", "")}
      ${fileRow(file, false)}
      <div class="processing-state">
        <span class="spinner" aria-hidden="true"></span>
        <span>Unlocking PDF…</span>
      </div>
    </section>
  `;
}

function readyStage(name: string): string {
  return `
    <section class="task-card" aria-labelledby="page-title">
      <div class="step-bar">
        <span class="step-label">Ready</span>
        <span class="ready-status"><span class="ready-dot"></span>unprotected copy</span>
      </div>
      <div class="result-row">
        <div class="result-file-icon">${documentIcon}</div>
        <div class="file-details">
          <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
          <span>PDF · ready to send</span>
        </div>
      </div>
      <p class="warning-line">This copy is not password-protected.</p>
      <div class="action-row">
        <button class="primary-button" type="button" data-action="download-output" aria-label="Download PDF">
          ${saveIcon}<span>Download</span>
        </button>
        <button class="secondary-button" type="button" data-action="share-output" aria-label="Share PDF">
          ${shareIcon}<span>Share</span>
        </button>
      </div>
      <button class="quiet-button reset-button" type="button" data-action="start-over">Choose another PDF</button>
    </section>
  `;
}

function render(): void {
  const root = app as HTMLDivElement;
  const stageMarkup =
    stage.kind === "choose"
      ? chooseStage()
      : stage.kind === "password"
        ? passwordStage(stage.file)
        : stage.kind === "processing"
          ? processingStage(stage.file)
          : stage.kind === "ready"
            ? readyStage(stage.outputName)
            : passwordStage(stage.file, stage.message);

  root.innerHTML = `
    ${header()}
    <main class="page-content">
      <div class="hero">
        <h1 id="page-title">Make a PDF <span>shareable.</span></h1>
      </div>
      <div class="task-column">
        ${stageMarkup}
      </div>
    </main>
  `;

  bindEvents();
  if (stage.kind === "password" || stage.kind === "error") {
    document.querySelector<HTMLInputElement>("#pdf-password")?.focus();
  }
}

function openFilePicker(): void {
  const input = document.querySelector<HTMLInputElement>("#pdf-file");
  if (!input) return;
  input.value = "";
  input.click();
}

function selectFile(file: File | undefined): void {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return;
  stage = { kind: "password", file };
  render();
}

async function unlock(file: File, password: string): Promise<void> {
  stage = { kind: "processing", file };
  render();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const output = await decryptPdf(bytes, password);
    stage = { kind: "ready", file, output, outputName: outputName(file) };
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : "This PDF could not be opened.";
    stage = { kind: "error", file, message };
    render();
  }
}

function outputFile(): File | undefined {
  if (stage.kind !== "ready") return undefined;
  return new File([new Uint8Array(stage.output).buffer as ArrayBuffer], stage.outputName, { type: "application/pdf" });
}

function isAppleTouchDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type ShareFileFunction = (data: { files: File[]; title: string }) => Promise<void>;

function shareFunction(): ShareFileFunction | undefined {
  const candidate = Reflect.get(navigator, "share");
  return typeof candidate === "function" ? candidate.bind(navigator) as ShareFileFunction : undefined;
}

function canShareFile(file: File): boolean {
  const share = shareFunction();
  const canShare = Reflect.get(navigator, "canShare");
  return Boolean(share && (typeof canShare !== "function" || canShare.call(navigator, { files: [file] })));
}

type ShareResult = "shared" | "cancelled" | "unsupported";

async function nativeShare(file: File): Promise<ShareResult> {
  const share = shareFunction();
  if (!share || !canShareFile(file)) return "unsupported";

  try {
    await share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "unsupported";
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

async function downloadOutput(): Promise<void> {
  const file = outputFile();
  if (!file) return;

  if (isAppleTouchDevice() && canShareFile(file)) {
    await nativeShare(file);
    return;
  }

  directDownload(file);
}

async function shareOutput(): Promise<void> {
  const file = outputFile();
  if (!file) return;

  const result = await nativeShare(file);
  if (result === "unsupported") directDownload(file);
}

function bindEvents(): void {
  const fileInput = document.querySelector<HTMLInputElement>("#pdf-file");
  document.querySelector<HTMLButtonElement>('[data-action="choose-file"]')?.addEventListener("click", openFilePicker);
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

  document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const input = document.querySelector<HTMLInputElement>("#pdf-password");
    if (!input) return;
    const showing = !input.classList.contains("is-masked");
    input.classList.toggle("is-masked", showing);
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-pressed", String(!showing));
  });

  document.querySelector<HTMLButtonElement>('[data-action="share-output"]')?.addEventListener("click", () => {
    void shareOutput();
  });
  document.querySelector<HTMLButtonElement>('[data-action="download-output"]')?.addEventListener("click", () => {
    void downloadOutput();
  });
  document.querySelector<HTMLButtonElement>('[data-action="start-over"]')?.addEventListener("click", () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = undefined;
    stage = { kind: "choose" };
    render();
  });
}

if (import.meta.env.DEV) {
  window.__unsealedPdf = { decrypt: decryptPdf };
}

render();
