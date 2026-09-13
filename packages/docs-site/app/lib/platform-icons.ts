import { htmlToDocText } from "@defold-typescript/types";

/**
 * Defold marks platform- and caution-specific API prose two ways: extension
 * `.script_api` text carries `[icon:ios]`, and engine ref-doc HTML carries
 * `<span class="icon-ios"></span>`. Both normalise to the bracket marker, which
 * the markdown renderer turns into a badge and plain-text surfaces strip.
 * `icon` names a Phosphor duotone glyph. Client-reachable, so no node imports.
 */
export const PLATFORM_ICONS: Record<string, { label: string; icon: string }> = {
  ios: { label: "iOS", icon: "apple-logo" },
  android: { label: "Android", icon: "android-logo" },
  html5: { label: "HTML5", icon: "globe" },
  windows: { label: "Windows", icon: "windows-logo" },
  linux: { label: "Linux", icon: "linux-logo" },
  macos: { label: "macOS", icon: "desktop" },
  osx: { label: "macOS", icon: "desktop" },
  googleplay: { label: "Google Play", icon: "google-play-logo" },
  amazon: { label: "Amazon", icon: "amazon-logo" },
  facebook: { label: "Facebook", icon: "facebook-logo" },
  attention: { label: "Attention", icon: "warning" },
  alert: { label: "Attention", icon: "warning" },
};

export const PLATFORM_MARKER = /\[icon:([\w-]+)\]/g;

const ICON_SPAN = /<span\s+class=["']icon-([\w-]+)["']\s*>\s*<\/span>/gi;

export function iconSpansToMarkers(html: string): string {
  return html.replace(ICON_SPAN, "[icon:$1]");
}

/** `htmlToDocText` that keeps engine icon spans as `[icon:X]` markers. */
export function platformDocText(html: string): string {
  return htmlToDocText(iconSpansToMarkers(html));
}

/** Removes every `[icon:X]` marker for surfaces that render plain text. */
export function stripPlatformMarkers(text: string): string {
  return text
    .replace(PLATFORM_MARKER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}
