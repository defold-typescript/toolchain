export interface ClientAssets {
  readonly js: string;
  readonly css: string;
}

export interface RenderPageOptions {
  readonly title: string;
  readonly client: ClientAssets;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Inlined code ends its element at the first closing tag, so the tag must not appear inside.
function escapeClosingTag(code: string, tag: "script" | "style"): string {
  return code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

/** One HTML document with the client inlined, so the page needs nothing else to load. */
export function renderPage({ title, client }: RenderPageOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${escapeClosingTag(client.css, "style")}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${escapeClosingTag(client.js, "script")}</script>
</body>
</html>
`;
}
