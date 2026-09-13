import { htmlToDocText } from "@defold-typescript/types";

/** An icon asset: a Phosphor duotone glyph by name, or a Devicon SVG by `<dir>/<file>` path. */
export type Glyph = { set: "phosphor"; name: string } | { set: "devicon"; file: string };

/**
 * Defold marks platform- and caution-specific API prose two ways: extension
 * `.script_api` text carries `[icon:ios]`, and engine ref-doc HTML carries
 * `<span class="icon-ios"></span>`. Both normalise to the bracket marker, which
 * the markdown renderer turns into a badge and plain-text surfaces strip.
 * `glyph` names a single-colour Devicon brand mark where Devicon has one for the
 * platform, else a Phosphor duotone glyph. Client-reachable, so no node imports.
 */
export const PLATFORM_ICONS: Record<string, { label: string; glyph: Glyph }> = {
  ios: { label: "iOS", glyph: { set: "devicon", file: "apple/apple-original" } },
  apple: { label: "Apple", glyph: { set: "devicon", file: "apple/apple-original" } },
  android: { label: "Android", glyph: { set: "devicon", file: "android/android-plain" } },
  html5: { label: "HTML5", glyph: { set: "devicon", file: "html5/html5-plain" } },
  windows: { label: "Windows", glyph: { set: "devicon", file: "windows11/windows11-original" } },
  linux: { label: "Linux", glyph: { set: "devicon", file: "linux/linux-plain" } },
  macos: { label: "macOS", glyph: { set: "phosphor", name: "desktop" } },
  osx: { label: "macOS", glyph: { set: "phosphor", name: "desktop" } },
  googleplay: { label: "Google Play", glyph: { set: "phosphor", name: "google-play-logo" } },
  amazon: { label: "Amazon", glyph: { set: "phosphor", name: "amazon-logo" } },
  facebook: { label: "Facebook", glyph: { set: "devicon", file: "facebook/facebook-plain" } },
  attention: { label: "Attention", glyph: { set: "phosphor", name: "warning" } },
  alert: { label: "Attention", glyph: { set: "phosphor", name: "warning" } },
};

/** The table entry for a marker name, ignoring inherited `Object` members. */
export function platformIcon(name: string): { label: string; glyph: Glyph } | undefined {
  return Object.hasOwn(PLATFORM_ICONS, name) ? PLATFORM_ICONS[name] : undefined;
}

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
