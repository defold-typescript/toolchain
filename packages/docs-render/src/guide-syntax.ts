import { glyphSvg } from "./glyph";
import { type Glyph, platformIcon } from "./platform-icons";
import { Badge, TooltipTrigger } from "./ui";

// The guide syntax the remark plugins in `guide-plugins.ts` read.

// Image src fragments carry render hints the site strips before emitting the
// URL: `max-width=420` caps the rendered width and a valueless `inline` asks for
// the SVG markup itself rather than an `<img>` (see `remarkGuideImages`).
export function imageParamsFromSrc(src: string): {
  src: string;
  maxWidth?: string;
  inline?: true;
} {
  const hash = src.indexOf("#");
  if (hash === -1) return { src };
  const base = src.slice(0, hash);
  const params = src.slice(hash + 1).split("&");
  const rest: string[] = [];
  let maxWidth: string | undefined;
  let inline = false;
  for (const param of params) {
    const [rawKey, rawValue = ""] = param.split("=");
    const key = decodeURIComponent(rawKey ?? "");
    const value = decodeURIComponent(rawValue);
    if (key === "max-width" || key === "maxWidth" || key === "mw") {
      const normalized = /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
      if (/^\d+(?:\.\d+)?(?:px|rem|em|ch|%|vw)$/.test(normalized)) maxWidth = normalized;
    } else if (param === "inline") {
      inline = true;
    } else {
      rest.push(param);
    }
  }
  const cleanSrc = `${base}${rest.length > 0 ? `#${rest.join("&")}` : ""}`;
  return {
    src: cleanSrc,
    ...(maxWidth ? { maxWidth } : {}),
    ...(inline ? { inline: true as const } : {}),
  };
}

// A fence info string carries the language in its first token; Shiki reads only
// that and ignores the rest. We borrow a `title="src/board.ts"` (or single-quoted)
// suffix to caption the block with a filename chip.
export function codeTitleFromInfo(info: string): string | undefined {
  const match = info.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
  if (!match) return undefined;
  const title = match[1] ?? match[2] ?? "";
  return title.length > 0 ? title : undefined;
}

// Fence languages labelled with a language badge, keyed by the info string's
// first token. Every other language renders exactly as Shiki emits it.
export const FENCE_LANGUAGES: Record<string, { label: string; glyph: Glyph }> = {
  lua: { label: "Lua", glyph: { set: "devicon", file: "lua/lua-plain" } },
  ts: { label: "TypeScript", glyph: { set: "devicon", file: "typescript/typescript-plain" } },
  typescript: {
    label: "TypeScript",
    glyph: { set: "devicon", file: "typescript/typescript-plain" },
  },
  tsx: { label: "TypeScript", glyph: { set: "devicon", file: "typescript/typescript-plain" } },
};

export function fenceLanguage(info: string): { label: string; glyph: Glyph } | undefined {
  return FENCE_LANGUAGES[info.trim().split(/\s+/)[0]?.toLowerCase() ?? ""];
}

export interface FenceVariant {
  key: string;
  labels?: readonly [string, string];
  language?: string;
}

// A `<lang> <marker>` info string marks a fence as the second variant of the
// snippet in the fence before it: `original` is the source of a translated
// fence, `builder` the builder-statement spelling of a config. Each pair renders
// as one tab group whose key names its tab set, and the page scripts switch
// each group on its own; `labels` replaces the two tabs' language
// names, and `language` is the `FENCE_LANGUAGES` label both fences must carry
// to pair (`builder` requires TypeScript, the only language the builder
// spelling exists in). Shiki and the badge read only the first token, so the
// fence still highlights and badges as `<lang>`.
export const FENCE_VARIANTS = new Map<string, FenceVariant>([
  ["original", { key: "typescript-lua" }],
  ["builder", { key: "config-builder", labels: ["Config", "Builder"], language: "TypeScript" }],
]);

export function fenceVariant(info: string): FenceVariant | undefined {
  return FENCE_VARIANTS.get(info.trim().split(/\s+/)[1] ?? "");
}

const platformBadges = new Map<string, string>();

// A known `[icon:X]` marker as an icon-only badge inside a tooltip trigger that
// names the platform; unknown names return undefined and stay literal text.
export function platformBadge(name: string): string | undefined {
  const platform = platformIcon(name);
  if (!platform) return undefined;
  let badge = platformBadges.get(name);
  if (badge === undefined) {
    badge = TooltipTrigger({
      content: platform.label,
      class: "platform-badge",
      children: Badge({
        variant: platform.tone ?? "outline",
        class: "platform-badge-icon",
        icon: glyphSvg(platform.glyph, "platform-badge-glyph"),
        role: "img",
        "aria-label": platform.label,
      }),
    });
    platformBadges.set(name, badge);
  }
  return badge;
}

// GitHub's five alert kinds. A `> [!NOTE]` blockquote (case-insensitive marker)
// becomes a styled callout; every other blockquote passes through unchanged.
export const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\]/i;

export const ALERT_LABELS: Record<AlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

// A `> [!MORE]` blockquote (case-insensitive marker) becomes a native
// tap-to-reveal `<details>`; trailing same-line text is the `<summary>` label,
// or this default when the marker stands alone. `MORE` is not an admonition —
// the alert rule leaves it untouched and vice-versa.
export const MORE_MARKER = /^\[!more\]/i;
export const MORE_DEFAULT_SUMMARY = "More";

// Longest visible cell text, in characters, a column may hold and still render
// on one line.
export const SHORT_COLUMN_CHARS = 24;
