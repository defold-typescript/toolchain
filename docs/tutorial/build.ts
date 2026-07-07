#!/usr/bin/env bun
/**
 * Build the tutorial. Reads snippets/, slides.ts, and template.html.tmpl; highlights
 * each snippet with Shiki; renders the slides into the template; writes the
 * final self-contained HTML to dist/index.html. Pictures are linked from
 * defold.com on purpose — they are part of the original tutorial, not vendored.
 *
 * Run with: bun run build
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codeToHtml } from "shiki";
import { type Slide, type SlideElement, slides } from "./slides.ts";
import { verifySnippets } from "./verify.ts";

const HERE = import.meta.dir;
const SNIPPETS_DIR = join(HERE, "snippets");
const TEMPLATE_PATH = join(HERE, "template.html.tmpl");
const OUTPUT_DIR = join(HERE, "dist");
const OUTPUT_PATH = join(OUTPUT_DIR, "index.html");

const HL_LANG = "ts";
const HL_THEME = "github-dark";

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Highlight a snippet and strip the outer <pre><code> shell. The slide
 * template provides its own <pre class="shiki-shell"><code> wrapper; we
 * return only the inline-styled token spans so the output is a single
 * (not double) <code> nesting. On any unexpected shape we fall back to
 * escaping the raw code so the build never throws on a malformed highlight.
 */
async function highlight(code: string): Promise<string> {
  try {
    const html = await codeToHtml(code, { lang: HL_LANG, theme: HL_THEME });
    const match = html.match(/<pre[^>]*>\s*<code>([\s\S]*?)<\/code>\s*<\/pre>/);
    return match ? match[1] : escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}

/**
 * Minimal inline markdown for the body paragraphs:
 *  - [text](url)        → <a target="_blank">
 *  - *italic* / **bold** → <em> / <strong>
 *  - `code`             → <code>
 * Order matters: links first so the * inside link text doesn't italicize,
 * then bold, then italic, then code. Newlines inside a single paragraph are
 * preserved as-is (we split paragraphs at the manifest level).
 */
function renderInline(text: string): string {
  let out = text;
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    const href = escapeAttr(u);
    return `<a href="${href}" target="_blank" rel="noopener">${t}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function renderParagraph(text: string): string {
  return `    <p>${renderInline(escapeHtml(text))}</p>`;
}

function renderBullets(items: string[]): string {
  const inner = items.map((it) => `      <li>${renderInline(escapeHtml(it))}</li>`).join("\n");
  return `    <ul class="bullets">\n${inner}\n    </ul>`;
}

function renderNumbered(items: string[]): string {
  const inner = items.map((it) => `      <li>${renderInline(escapeHtml(it))}</li>`).join("\n");
  return `    <ol class="numbered">\n${inner}\n    </ol>`;
}

function renderImage(src: string, alt: string): string {
  return `    <figure class="slide-figure">\n      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" />\n    </figure>`;
}

function renderSidenote(text: string): string {
  const html = renderInline(escapeHtml(text)).replace(/\n/g, "<br>");
  return `    <aside class="sidenote">${html}</aside>`;
}

function renderSnippet(highlighted: string, caption?: string): string {
  const cap = caption
    ? `\n      <figcaption>${renderInline(escapeHtml(caption))}</figcaption>`
    : "";
  return `    <figure class="slide-snippet">\n      <pre class="shiki-shell"><code>${highlighted}</code></pre>${cap}\n    </figure>`;
}

async function renderElement(el: SlideElement, snippetCache: Map<string, string>): Promise<string> {
  switch (el.kind) {
    case "paragraph":
      return renderParagraph(el.text);
    case "bullets":
      return renderBullets(el.items);
    case "numbered":
      return renderNumbered(el.items);
    case "image":
      return renderImage(el.src, el.alt);
    case "sidenote":
      return renderSidenote(el.text);
    case "snippet": {
      let highlighted = snippetCache.get(el.file);
      if (!highlighted) {
        const code = await readFile(join(SNIPPETS_DIR, el.file), "utf8");
        highlighted = await highlight(code);
        snippetCache.set(el.file, highlighted);
      }
      return renderSnippet(highlighted, el.caption);
    }
  }
}

async function renderSlide(
  index: number,
  total: number,
  slide: Slide,
  snippetCache: Map<string, string>,
): Promise<string> {
  const isTitle = index === 0;
  const progress = Math.round(((index + 1) / total) * 100);

  const headerLines: string[] = [];
  if (isTitle) {
    headerLines.push(`    <header class="slide-header slide-title">`);
    headerLines.push(`      <h1 id="${slide.id}">${escapeHtml(slide.title)}</h1>`);
    if (slide.tagline) {
      headerLines.push(`      <p class="slide-tagline">${escapeHtml(slide.tagline)}</p>`);
    }
    headerLines.push(`    </header>`);
  } else {
    headerLines.push(`    <header class="slide-header">`);
    headerLines.push(
      `      <h2 id="${slide.id}">${escapeHtml(slide.title)}<a class="anchor" href="#${slide.id}" aria-label="Permalink">§</a></h2>`,
    );
    headerLines.push(`    </header>`);
  }

  const bodyParts = await Promise.all(slide.elements.map((el) => renderElement(el, snippetCache)));

  return `  <section class="slide" data-index="${index}" data-id="${slide.id}" aria-label="Slide ${index + 1} of ${total}">
    <div class="slide-progress" style="--progress: ${progress}%"></div>
${headerLines.join("\n")}
${bodyParts.join("\n")}
  </section>`;
}

async function main(): Promise<void> {
  // Fail loud if a snippet has drifted from the canonical player.ts. Catches
  // a copy-paste error in the tutorial author or a player.ts rewrite that
  // wasn't followed by updating the snippets/ files. Cheap to run; the
  // verify reads each snippet once and the source once.
  await verifySnippets({ throwOnFailure: true });

  const total = slides.length;
  const snippetCache = new Map<string, string>();
  const rendered = await Promise.all(slides.map((s, i) => renderSlide(i, total, s, snippetCache)));

  const template = await readFile(TEMPLATE_PATH, "utf8");
  const out = template
    .replace(/<!--SLIDES-->/g, rendered.join("\n\n"))
    .replace(/<!--SLIDE_COUNT-->/g, String(total))
    .replace(/<!--GENERATED_AT-->/g, new Date().toISOString());

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, out, "utf8");

  const rel = (p: string) => p.slice(HERE.length + 1);
  console.log(
    `wrote ${rendered.length} slide(s) to ${rel(OUTPUT_PATH)} (${(out.length / 1024).toFixed(1)} KB)`,
  );
}

await main();
