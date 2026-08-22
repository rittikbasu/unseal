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
let passwordInput: HTMLInputElement | null = null;
let outputUrl: string | undefined;

const documentIcon = `
  <svg viewBox="0 0 48 48" aria-hidden="true" class="document-icon">
    <path d="M13 5.5h16.5L37 13v29.5H13z" />
    <path d="M29 5.5V13h8" />
    <path d="M19 21h12M19 27h12M19 33h8" />
  </svg>
`;

const checkIcon = `
  <svg viewBox="0 0 48 48" aria-hidden="true" class="check-icon">
    <circle cx="24" cy="24" r="17" />
    <path d="m16 24 5.5 5.5L33 18" />
  </svg>
`;

const arrowIcon = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="arrow-icon">
    <path d="M4 10h11M10 4l6 6-6 6" />
  </svg>
`;

const downloadIcon = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="button-icon">
    <path d="M10 3v9M6.5 9.5 10 13l3.5-3.5M4 16h12" />
  </svg>
`;

const shareIcon = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="button-icon">
    <path d="M10 13V3M6.5 6.5 10 3l3.5 3.5M4 10v5.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V10" />
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

function fileRow(file: File): string {
  return `
    <div class="file-row">
      <div class="file-icon">${documentIcon}</div>
      <div class="file-copy">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · pdf</span>
      </div>
      <button type="button" class="text-button" data-action="change-file">change</button>
    </div>
  `;
}

function header(): string {
  return `
    <header class="topbar">
      <a class="brand" href="/" aria-label="unsealed home">unsealed<span class="brand-dot">.</span></a>
      <div class="privacy-chip">
        <span class="privacy-dot"></span>
        stays on this device
      </div>
    </header>
  `;
}

function chooseStage(): string {
  return `
    <section class="action-card" aria-labelledby="action-title">
      <div class="card-kicker"><span>01</span><span>choose a file</span></div>
      <div class="file-illustration">${documentIcon}</div>
      <h2 id="action-title">start with your pdf</h2>
      <p class="card-copy">pick the protected file from your phone. nothing is uploaded.</p>
      <input id="pdf-file" class="visually-hidden" type="file" accept="application/pdf,.pdf" />
      <button class="primary-button" type="button" data-action="choose-file">
        choose pdf ${arrowIcon}
      </button>
      <p class="card-footnote">you will need the password you already have.</p>
    </section>
  `;
}

function passwordStage(file: File, error?: string): string {
  return `
    <section class="action-card" aria-labelledby="action-title">
      <div class="card-kicker"><span>02</span><span>enter the password</span></div>
      ${fileRow(file)}
      <div class="card-divider"></div>
      <form id="unlock-form" novalidate>
        <label class="field-label" for="pdf-password">pdf password</label>
        <div class="password-field">
          <input id="pdf-password" name="password" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" />
          <button type="button" class="show-button" data-action="toggle-password" aria-pressed="false">show</button>
        </div>
        ${error ? `<p class="inline-error" role="alert">${escapeHtml(error)}</p>` : `<p class="field-hint">passwords are used only in memory for this conversion.</p>`}
        <button class="primary-button" type="submit">
          create shareable copy ${arrowIcon}
        </button>
      </form>
    </section>
  `;
}

function processingStage(file: File): string {
  return `
    <section class="action-card processing-card" aria-labelledby="action-title" aria-live="polite">
      <div class="card-kicker"><span>03</span><span>making your copy</span></div>
      <div class="processing-mark"><span class="spinner"></span></div>
      <h2 id="action-title">one moment</h2>
      <p class="card-copy">opening <strong>${escapeHtml(file.name)}</strong> on this device.</p>
      <p class="card-footnote">the original file will not be changed.</p>
    </section>
  `;
}

function readyStage(file: File, outputName: string): string {
  return `
    <section class="action-card ready-card" aria-labelledby="action-title">
      <div class="card-kicker"><span>04</span><span>ready to share</span></div>
      <div class="success-mark">${checkIcon}</div>
      <h2 id="action-title">your copy is ready</h2>
      <p class="card-copy">${escapeHtml(outputName)} is no longer password protected.</p>
      <div class="result-row">
        <div class="result-file-icon">${documentIcon}</div>
        <div class="file-copy">
          <strong>${escapeHtml(filenameWithoutPdf(file.name))}-unsealed.pdf</strong>
          <span>safe to send or save</span>
        </div>
      </div>
      <div class="button-stack">
        <button class="primary-button" type="button" data-action="share-output">
          share copy ${shareIcon}
        </button>
        <button class="secondary-button" type="button" data-action="download-output">
          save to files ${downloadIcon}
        </button>
      </div>
      <button class="text-button reset-button" type="button" data-action="start-over">make another copy</button>
    </section>
  `;
}

function errorStage(message: string): string {
  return `
    <section class="action-card error-card" aria-labelledby="action-title">
      <div class="card-kicker"><span>02</span><span>try again</span></div>
      <div class="error-mark">!</div>
      <h2 id="action-title">that did not work</h2>
      <p class="card-copy" role="alert">${escapeHtml(message)}</p>
      <div class="button-stack">
        <button class="primary-button" type="button" data-action="try-again">try again ${arrowIcon}</button>
        <button class="secondary-button" type="button" data-action="change-file">choose another file</button>
      </div>
      <p class="card-footnote">the original file is still untouched.</p>
    </section>
  `;
}

function render(): void {
  const root = app as HTMLDivElement;
  const title = stage.kind === "ready" ? "your copy is ready" : "make a shareable copy";
  const description = stage.kind === "ready"
    ? "your original is untouched. the new copy is ready to send."
    : "open a protected pdf with the password you know, then make a clean copy for someone else.";
  const stageMarkup =
    stage.kind === "choose"
      ? chooseStage()
      : stage.kind === "password"
        ? passwordStage(stage.file)
        : stage.kind === "processing"
          ? processingStage(stage.file)
          : stage.kind === "ready"
            ? readyStage(stage.file, stage.outputName)
            : errorStage(stage.message);

  root.innerHTML = `
    ${header()}
    <main class="page-content">
      <div class="content-grid">
        <section class="intro" aria-labelledby="page-title">
          <p class="eyebrow">protected pdfs, made shareable</p>
          <h1 id="page-title">${title.replace(" ", " <span>")}</span></h1>
          <p class="lede">${description}</p>
          <div class="process-note">
            <span class="process-number">01—04</span>
            <span>choose · unlock · share</span>
          </div>
        </section>
        <div class="action-column">
          ${stageMarkup}
          <p class="privacy-note"><span class="privacy-dot"></span><span><strong>your file stays on this device.</strong> your pdf and password never leave this browser.</span></p>
        </div>
      </div>
    </main>
    <footer class="site-footer">
      <span>unsealed</span>
      <span>no upload · no account · no trace</span>
    </footer>
  `;

  bindEvents();
  if (stage.kind === "password" || stage.kind === "error") {
    passwordInput = document.querySelector<HTMLInputElement>("#pdf-password");
    passwordInput?.focus();
  } else {
    passwordInput = null;
  }
}

function selectFile(file: File | undefined): void {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    stage = { kind: "choose" };
    render();
    return;
  }
  stage = { kind: "password", file };
  render();
}

async function unlock(file: File, password: string): Promise<void> {
  stage = { kind: "processing", file };
  render();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const output = await decryptPdf(bytes, password);
    const outputName = `${filenameWithoutPdf(file.name)}-unsealed.pdf`;
    stage = { kind: "ready", file, output, outputName };
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

function downloadOutput(): void {
  const file = outputFile();
  if (!file) return;

  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = outputUrl;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function shareOutput(): Promise<void> {
  const file = outputFile();
  if (!file) return;

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  downloadOutput();
}

function bindEvents(): void {
  const fileInput = document.querySelector<HTMLInputElement>("#pdf-file");
  const chooseButton = document.querySelector<HTMLButtonElement>('[data-action="choose-file"]');
  chooseButton?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => selectFile(fileInput.files?.[0]));

  document.querySelectorAll<HTMLButtonElement>('[data-action="change-file"]').forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector<HTMLInputElement>("#pdf-file");
      input?.click();
    });
  });

  document.querySelector<HTMLFormElement>("#unlock-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (stage.kind !== "password") return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void unlock(stage.file, String(form.get("password") ?? ""));
  });

  document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const input = document.querySelector<HTMLInputElement>("#pdf-password");
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "show" : "hide";
    button.setAttribute("aria-pressed", String(!showing));
  });

  document.querySelector<HTMLButtonElement>('[data-action="try-again"]')?.addEventListener("click", () => {
    if (stage.kind !== "error") return;
    stage = { kind: "password", file: stage.file };
    render();
  });

  document.querySelector<HTMLButtonElement>('[data-action="share-output"]')?.addEventListener("click", () => {
    void shareOutput();
  });
  document.querySelector<HTMLButtonElement>('[data-action="download-output"]')?.addEventListener("click", downloadOutput);
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
