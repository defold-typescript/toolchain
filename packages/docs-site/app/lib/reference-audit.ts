import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { slugify } from "./headings";

export interface DanglingRef {
  /** Directory of the guide file the reference lives in. */
  source: string;
  /** The raw reference text as written in the source. */
  reference: string;
  /** Why it failed to resolve. */
  reason: string;
}

// Backtick spans are only treated as repo paths when they begin with one of
// these top dirs; this keeps API symbols (`go.get_position`) and shell snippets
// (`bun run build`) from being misread as files. `src/`/`test/` are deliberately
// excluded: the guide cites them as the *consumer's* Defold project layout
// (`src/main.ts`), which this repo has no top-level equivalent of.
const REPO_PATH_PREFIXES = ["packages/", "docs/", "scripts/"];

const MD_LINK_RE = /\]\(([^)\s]+)\)/g;
const BACKTICK_RE = /`([^`]+)`/g;
const HEADING_RE = /^\s*(#{2,3})\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
// Images are assets with their own pipeline and carry a `#max-width=` sizing
// directive (not an anchor), so a relative image link is not audited as a repo
// file. Everything else non-`.md` and relative is a repo file/dir citation.
const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif)$/i;

// Mirror `renderMarkdown`'s heading-id rule: only h2/h3 get ids, duplicates
// gain a `-2`, `-3` suffix, and headings inside code fences are skipped.
function anchorsFor(text: string): Set<string> {
  const out = new Set<string>();
  const counts = new Map<string, number>();
  let inFence = false;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING_RE.exec(line);
    if (!match) continue;
    const base = slugify(match[2] ?? "");
    if (!base) continue;
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

// Drop fenced code blocks so example links/paths inside them are not audited;
// inline backtick spans (the citations we do check) survive.
function stripCodeFences(text: string): string {
  const kept: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) kept.push(line);
  }
  return kept.join("\n");
}

export function findDanglingReferences(
  text: string,
  fileDir: string,
  repoRoot: string,
): DanglingRef[] {
  const out: DanglingRef[] = [];
  const prose = stripCodeFences(text);
  const ownAnchors = anchorsFor(text);
  const anchorCache = new Map<string, Set<string>>();

  for (const match of prose.matchAll(MD_LINK_RE)) {
    const href = match[1];
    if (!href) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) continue;
    if (href.startsWith("#")) {
      const fragment = href.slice(1);
      if (fragment && !ownAnchors.has(fragment)) {
        out.push({ source: fileDir, reference: href, reason: `missing anchor: ${href}` });
      }
      continue;
    }
    const [path, ...fragmentParts] = href.split("#");
    if (!path) continue;
    // A relative link that is not a `.md` guide page points at a repo file or
    // dir (an example project, a source file). It must resolve on disk relative
    // to the guide, or it 404s on the deployed site the way `../examples/…` did
    // (the site hosts only guide routes, not repo paths). Skip images.
    if (!path.endsWith(".md")) {
      if (!IMAGE_RE.test(path) && !existsSync(resolve(fileDir, path))) {
        out.push({ source: fileDir, reference: href, reason: `missing file: ${path}` });
      }
      continue;
    }
    const target = resolve(fileDir, path);
    if (!existsSync(target)) {
      out.push({ source: fileDir, reference: href, reason: `missing file: ${path}` });
      continue;
    }
    const anchor = fragmentParts.join("#");
    if (!anchor) continue;
    let anchors = anchorCache.get(target);
    if (!anchors) {
      anchors = anchorsFor(readFileSync(target, "utf8"));
      anchorCache.set(target, anchors);
    }
    if (!anchors.has(anchor)) {
      out.push({ source: fileDir, reference: href, reason: `missing anchor: #${anchor}` });
    }
  }

  for (const match of prose.matchAll(BACKTICK_RE)) {
    const span = match[1]?.trim();
    if (!span || /\s/.test(span)) continue;
    if (!REPO_PATH_PREFIXES.some((prefix) => span.startsWith(prefix))) continue;
    const clean = span.replace(/\/$/, "");
    if (!existsSync(resolve(repoRoot, clean))) {
      out.push({ source: fileDir, reference: span, reason: `missing repo path: ${span}` });
    }
  }

  return out;
}
