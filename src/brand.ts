const unboundPath = '<path d="M14 10v25.5C14 47.3 21.5 55 32 55s18-7.7 18-19.5V34"/><path d="M50 20V9"/>';
const airGapPath = '<path d="M14 27v25.5C14 64.3 21.5 72 32 72s18-7.7 18-19.5V51"/><path d="M50 37V26"/>';

export function unboundMark(className = "brand-mark", label?: string): string {
  const title = label ? `<title>${label}</title>` : "";
  return `<svg class="${className}" viewBox="0 0 64 64" fill="none" role="${label ? "img" : "presentation"}" aria-hidden="${label ? "false" : "true"}" focusable="false">${title}${unboundPath}</svg>`;
}

export function airGapMark(className = "release-mark"): string {
  return `<svg class="${className}" viewBox="0 0 64 80" fill="none" role="presentation" aria-hidden="true" focusable="false"><rect class="release-body" x="17" y="7" width="30" height="8" rx="3"/><g class="release-u">${airGapPath}</g></svg>`;
}
