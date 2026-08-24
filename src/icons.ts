import {
  Download as DownloadNode,
  Eye as EyeNode,
  EyeOff as EyeOffNode,
  File as FileNode,
  FileLock as FileLockNode,
  LoaderCircle as LoaderCircleNode,
  Share as ShareNode,
  ShieldCheck as ShieldCheckNode,
} from "lucide";

type IconNode = readonly (readonly [string, Readonly<Record<string, string>>])[];

function escapeAttribute(value: string): string {
  return value.replace(/[&<>\"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;",
    };
    return entities[character];
  });
}

function renderIcon(node: IconNode, name: string, className: string): string {
  const children = node
    .map(([tag, attributes]) => {
      const serialized = Object.entries(attributes)
        .map(([attribute, value]) => `${attribute}="${escapeAttribute(value)}"`)
        .join(" ");
      return `<${tag}${serialized ? ` ${serialized}` : ""}></${tag}>`;
    })
    .join("");

  return `<svg class="${className}" data-lucide="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}

export const fileLockIcon = (className = "file-icon-svg"): string => renderIcon(FileLockNode as IconNode, "file-lock", className);
export const fileIcon = (className = "file-icon-svg"): string => renderIcon(FileNode as IconNode, "file", className);
export const shieldCheckIcon = (className = "shield-icon"): string => renderIcon(ShieldCheckNode as IconNode, "shield-check", className);
export const loaderCircleIcon = (className = "loader-icon"): string => renderIcon(LoaderCircleNode as IconNode, "loader-circle", className);
export const shareIcon = (className = "button-icon"): string => renderIcon(ShareNode as IconNode, "share", className);
export const downloadIcon = (className = "button-icon"): string => renderIcon(DownloadNode as IconNode, "download", className);
export const eyeIcon = (className = "button-icon"): string => renderIcon(EyeNode as IconNode, "eye", className);
export const eyeOffIcon = (className = "button-icon"): string => renderIcon(EyeOffNode as IconNode, "eye-off", className);
