import "./styles.css";
import { decryptPdf } from "./pdf-service";
import { envelopeLogo } from "./brand";
import { downloadIcon, eyeIcon, eyeOffIcon, fileIcon, fileLockIcon, loaderCircleIcon, shareIcon, shieldCheckIcon } from "./icons";
import { signatureHeart } from "./signature";

type Stage =
  | { kind: "choose"; message?: string }
  | { kind: "password"; file: File }
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

const GENERIC_PDF_ERROR = "Wrong password. Try again.";
const EMPTY_PASSWORD_ERROR = "Enter the PDF password to continue.";
const DOCUMENT_SECRET_SELECTOR = "[data-document-secret]";
const MIN_PROCESSING_MS = 280;
let stage: Stage = { kind: "choose" };
let isProcessing = false;
let outputUrl: string | undefined;

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
      <div class="header-inner">
        <div class="brand-lockup" role="img" aria-label="unseal">
          ${envelopeLogo("brand-mark")}
          <span class="brand-name">unseal</span>
        </div>
      </div>
    </header>
  `;
}

function intro(stageToDescribe: Stage): string {
  if (stageToDescribe.kind === "ready") {
    return `
      <section class="intro" aria-labelledby="page-title">
        <h1 id="page-title">Your copy is ready.</h1>
        <p>It opens without a password. The original is unchanged.</p>
      </section>
    `;
  }

  return `
    <section class="intro" aria-labelledby="page-title">
      <h1 id="page-title">Unseal your password protected PDF.</h1>
      <p>Create a copy that opens without a password. Your PDF never leaves this device.</p>
    </section>
  `;
}

function panelBar(title: string, status?: string, focusable = false): string {
  return `
    <div class="panel-bar">
      <h2 id="panel-title"${focusable ? ' tabindex="-1"' : ""}>${title}</h2>
      ${status ? `<span>${status}</span>` : ""}
    </div>
  `;
}

function hiddenFileInput(label: string, overlay = false): string {
  const className = overlay ? "file-input" : "visually-hidden";
  return `<input id="pdf-file" class="${className}" type="file" accept="application/pdf,.pdf" aria-label="${escapeHtml(label)}" />`;
}

function selectedFileRow(file: File, allowChange = true, result = false): string {
  return `
    <div class="file-row${result ? " result-file" : ""}">
      <div class="file-icon">${result ? fileIcon() : fileLockIcon()}</div>
      <div class="file-copy">
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · ${result ? "opens without a password" : "protected PDF"}</span>
      </div>
      ${allowChange ? '<button type="button" class="quiet-button" data-action="change-file">Change</button>' : ""}
    </div>
  `;
}

function chooseStage(stageToRender: Extract<Stage, { kind: "choose" }>): string {
  return `
    <section class="flow-panel choose-panel" aria-labelledby="panel-title">
      ${panelBar("Choose PDF")}
      <div class="panel-body">
        <label class="choose-control" for="pdf-file">
          ${hiddenFileInput("Choose a protected PDF from Files", true)}
          <span class="file-icon">${fileLockIcon()}</span>
          <span class="file-copy">
            <strong>Choose a protected PDF</strong>
            <span>Browse Files</span>
          </span>
          <span class="choose-action">Choose</span>
        </label>
        ${stageToRender.message ? `<p id="choose-error" class="inline-error" role="alert">${escapeHtml(stageToRender.message)}</p>` : ""}
      </div>
    </section>
  `;
}

function passwordStage(file: File, error?: string): string {
  return `
    <section class="flow-panel password-panel" aria-labelledby="panel-title" aria-busy="${isProcessing}">
      ${panelBar("Enter password")}
      <div class="panel-body password-grid">
        ${selectedFileRow(file)}
        ${hiddenFileInput("Choose a different PDF")}
        <div id="unlock-controls" class="password-controls">
          <div class="field-heading">
            <label for="document-value">PDF password</label>
            <span>used once, never saved</span>
          </div>
          <div class="password-field">
            <textarea
              id="document-value"
              class="password-input is-masked"
              data-document-secret
              rows="1"
              wrap="off"
              inputmode="text"
              autocomplete="one-time-code"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="go"
              aria-multiline="false"
              aria-describedby="document-hint${error ? " document-error" : ""}"
              aria-invalid="${error ? "true" : "false"}"
              aria-label="PDF password"
            ></textarea>
            <button type="button" class="quiet-button reveal-button" data-action="toggle-password" aria-pressed="false" aria-label="show password">${eyeIcon()}</button>
          </div>
          <p id="document-hint" class="visually-hidden">used once, never saved.</p>
          ${error ? `<p id="document-error" class="inline-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button create-copy-button" type="button" data-action="create-copy"${isProcessing ? ' disabled aria-busy="true"' : ""}>
            ${isProcessing ? `${loaderCircleIcon()}<span>Creating copy</span>` : "Create copy"}
          </button>
        </div>
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
  const primaryLabel = canSaveOrShare ? "Save or share" : "Download";
  const primaryIcon = canSaveOrShare ? shareIcon() : downloadIcon();

  return `
    <section class="flow-panel ready-panel" aria-labelledby="panel-title">
      ${panelBar("New copy", "Ready", true)}
      <div class="panel-body ready-grid">
        ${selectedFileRow(file, false, true)}
        <div class="ready-actions">
          ${stageToRender.message ? `<p class="inline-error" role="alert">${escapeHtml(stageToRender.message)}</p>` : ""}
          <button class="primary-button" type="button" data-action="save-output" aria-label="${primaryLabel}">${primaryIcon}<span>${primaryLabel}</span></button>
          ${stageToRender.message ? '<button class="secondary-button" type="button" data-action="download-copy">Download</button>' : ""}
          <button class="quiet-button reset-button" type="button" data-action="start-over">Choose another PDF</button>
        </div>
      </div>
    </section>
  `;
}

function stageMarkup(): string {
  if (stage.kind === "choose") return chooseStage(stage);
  if (stage.kind === "password") return passwordStage(stage.file);
  if (stage.kind === "ready") return readyStage(stage);
  return passwordStage(stage.file, stage.message);
}

function privacyLine(): string {
  return `
    <p class="privacy-line">
      ${shieldCheckIcon()}
      <span>Processed on this device. Nothing is uploaded.</span>
    </p>
  `;
}

function signatureFooter(): string {
  return `
    <footer class="project-signature" role="contentinfo">
      <a
        href="https://rittik.fyi"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="made with love by rittik, visit rittik.fyi"
      >
        <span>made with</span>
        ${signatureHeart()}
        <span>by</span>
        <strong>rittik</strong>
      </a>
    </footer>
  `;
}

type ViewTransitionHandle = {
  updateCallbackDone?: Promise<unknown>;
  finished?: Promise<unknown>;
};

type StartViewTransition = (update: () => void) => ViewTransitionHandle;

let hasRendered = false;

function commitRender(useFallbackMotion: boolean): void {
  const root = app as HTMLDivElement;
  root.dataset.stage = stage.kind;
  root.dataset.processing = isProcessing ? "true" : "false";
  root.dataset.motion = useFallbackMotion ? "fallback" : "none";

  let experience = root.querySelector<HTMLElement>(".experience");
  if (!experience) {
    root.innerHTML = `
      <div class="app-frame">
        ${header()}
        <main class="app-main">
          <div class="experience"></div>
          ${signatureFooter()}
        </main>
      </div>
    `;
    experience = root.querySelector<HTMLElement>(".experience");
  }

  if (!experience) throw new Error("unseal experience region is missing");
  experience.innerHTML = `${intro(stage)}${stageMarkup()}${privacyLine()}`;
  bindEvents();
  updateKeyboardMode();
}

function focusCurrentStage(): void {
  if (stage.kind === "ready") {
    document.querySelector<HTMLElement>("#panel-title")?.focus();
  }

  updateKeyboardMode();
}

function render(): Promise<void> {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = hasRendered && !reducedMotion;
  const candidate = Reflect.get(document, "startViewTransition");
  const startViewTransition = typeof candidate === "function"
    ? candidate.bind(document) as StartViewTransition
    : undefined;

  hasRendered = true;

  if (shouldAnimate && startViewTransition) {
    const transition = startViewTransition(() => commitRender(false));
    const updateDone = transition.updateCallbackDone ?? Promise.resolve();
    const finished = transition.finished ?? updateDone;
    void finished
      .then(() => requestAnimationFrame(focusCurrentStage))
      .catch(() => requestAnimationFrame(focusCurrentStage));
    return updateDone.then(() => undefined).catch(() => undefined);
  }

  commitRender(shouldAnimate);
  requestAnimationFrame(focusCurrentStage);
  return Promise.resolve();
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function keepProcessingVisible(startedAt: number): Promise<void> {
  const remaining = MIN_PROCESSING_MS - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
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
  if (!isPdf(file)) {
    stage = { kind: "choose", message: "Choose a PDF file to continue." };
    void render();
    return;
  }
  stage = { kind: "password", file };
  void render();
}

function setProcessingButton(busy: boolean): void {
  const root = app as HTMLDivElement;
  root.dataset.processing = busy ? "true" : "false";
  const section = document.querySelector<HTMLElement>(".password-panel");
  const button = document.querySelector<HTMLButtonElement>('[data-action="create-copy"]');
  if (!section || !button) return;

  section.setAttribute("aria-busy", String(busy));
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.innerHTML = busy ? `${loaderCircleIcon()}<span>Creating copy</span>` : "Create copy";

  if (busy) {
    document.querySelector("#document-error")?.remove();
    const input = document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR);
    input?.setAttribute("aria-invalid", "false");
    input?.setAttribute("aria-describedby", "document-hint");
  }
}

function showUnlockError(message: string): void {
  setProcessingButton(false);
  (app as HTMLDivElement).dataset.stage = "error";
  const input = document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR);
  const button = document.querySelector<HTMLButtonElement>('[data-action="create-copy"]');
  if (!input || !button) return;

  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", "document-hint document-error");
  let error = document.querySelector<HTMLParagraphElement>("#document-error");
  if (!error) {
    error = document.createElement("p");
    error.id = "document-error";
    error.className = "inline-error";
    error.setAttribute("role", "alert");
    button.before(error);
  }
  error.textContent = message;
}

async function unlock(file: File, password: string, secretInput: HTMLTextAreaElement | null): Promise<void> {
  if (!password) {
    stage = { kind: "error", file, message: EMPTY_PASSWORD_ERROR };
    await render();
    return;
  }

  isProcessing = true;
  setProcessingButton(true);
  await nextPaint();
  const processingStartedAt = performance.now();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const output = await decryptPdf(bytes, password);
    await keepProcessingVisible(processingStartedAt);
    isProcessing = false;
    stage = { kind: "ready", file, output, outputName: outputName(file) };
    await render();
    if (secretInput) secretInput.value = "";
  } catch {
    await keepProcessingVisible(processingStartedAt);
    isProcessing = false;
    stage = { kind: "error", file, message: GENERIC_PDF_ERROR };
    showUnlockError(GENERIC_PDF_ERROR);
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
      await render();
    }
    return;
  }

  directDownload(file);
}

function downloadCopy(): void {
  const file = outputFile();
  if (file) directDownload(file);
}

function createCopyFromPassword(): void {
  if (isProcessing || (stage.kind !== "password" && stage.kind !== "error")) return;
  const input = document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR);
  const password = input?.value ?? "";
  void unlock(stage.file, password, input ?? null);
}

function bindEvents(): void {
  const fileInput = document.querySelector<HTMLInputElement>("#pdf-file");
  fileInput?.addEventListener("change", () => selectFile(fileInput.files?.[0]));

  document.querySelectorAll<HTMLButtonElement>('[data-action="change-file"]').forEach((button) => {
    button.addEventListener("click", openFilePicker);
  });

  document.querySelector<HTMLButtonElement>('[data-action="create-copy"]')?.addEventListener("click", createCopyFromPassword);

  document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR)?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    createCopyFromPassword();
  });

  document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR)?.addEventListener("input", (event) => {
    const input = event.currentTarget as HTMLTextAreaElement;
    input.setAttribute("aria-invalid", "false");
  });

  const toggleButton = document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]');
  toggleButton?.addEventListener("pointerdown", (event) => {
    if (document.activeElement === document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR)) {
      event.preventDefault();
    }
  });
  toggleButton?.addEventListener("mousedown", (event) => {
    if (document.activeElement === document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR)) {
      event.preventDefault();
    }
  });
  toggleButton?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const input = document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR);
    if (!input) return;
    const showing = !input.classList.contains("is-masked");
    input.classList.toggle("is-masked", showing);
    button.innerHTML = showing ? eyeIcon() : eyeOffIcon();
    button.setAttribute("aria-pressed", String(!showing));
    button.setAttribute("aria-label", showing ? "show password" : "hide password");
  });

  document.querySelector<HTMLButtonElement>('[data-action="save-output"]')?.addEventListener("click", () => {
    void saveOutput();
  });

  document.querySelector<HTMLButtonElement>('[data-action="download-copy"]')?.addEventListener("click", downloadCopy);

  document.querySelector<HTMLButtonElement>('[data-action="start-over"]')?.addEventListener("click", () => {
    const secret = document.querySelector<HTMLTextAreaElement>(DOCUMENT_SECRET_SELECTOR);
    if (secret) secret.value = "";
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = undefined;
    stage = { kind: "choose" };
    void render();
  });
}

function updateKeyboardMode(): void {
  const root = app as HTMLDivElement;
  const viewport = window.visualViewport;
  const activeElement = document.activeElement;
  const inputFocused = activeElement instanceof HTMLTextAreaElement && activeElement.matches(DOCUMENT_SECRET_SELECTOR);
  const keyboardOpen = Boolean(
    inputFocused
      && viewport
      && viewport.height < window.innerHeight - 160,
  );
  root.dataset.keyboard = keyboardOpen ? "true" : "false";
}

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement) || !target.matches(DOCUMENT_SECRET_SELECTOR)) return;
  updateKeyboardMode();
});

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.matches(DOCUMENT_SECRET_SELECTOR)) updateKeyboardMode();
});

window.visualViewport?.addEventListener("resize", updateKeyboardMode);
window.addEventListener("resize", updateKeyboardMode);

if (import.meta.env.DEV) {
  window.__unsealedPdf = { decrypt: decryptPdf };
}

async function startApp(): Promise<void> {
  const root = document.documentElement;
  let fontReady = false;

  try {
    await Promise.race([
      document.fonts.load('510 16px "Inter Variable"'),
      new Promise((_, reject) => setTimeout(() => reject(new Error("font timeout")), 1800)),
    ]);
    fontReady = document.fonts.check('510 16px "Inter Variable"');
  } catch {
    fontReady = false;
  }

  root.classList.remove("fonts-loading");
  root.classList.add(fontReady ? "fonts-ready" : "fonts-fallback");
  await render();
}

void startApp();
