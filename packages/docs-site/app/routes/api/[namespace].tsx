import { type ApiModule, htmlToDocText } from "@defold-typescript/types";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";

function typeList(types: string[]): string {
  return types.length > 0 ? types.join(" | ") : "any";
}

function moduleMarkdown(page: { namespace: string; module: ApiModule }): string {
  const m = page.module;
  const lines: string[] = [`# ${m.namespace}`, ""];
  const intro = htmlToDocText(m.description || m.brief);
  if (intro) lines.push(intro, "");

  if (m.functions.length > 0) {
    lines.push("## Functions", "");
    for (const fn of m.functions) {
      const params = fn.parameters
        .map((p) => `${p.name}${p.isOptional ? "?" : ""}: ${typeList(p.types)}`)
        .join(", ");
      const ret = fn.returnValues.map((r) => typeList(r.types)).join(", ");
      lines.push(`### \`${fn.name}(${params})${ret ? `: ${ret}` : ""}\``, "");
      const doc = htmlToDocText(fn.description || fn.brief);
      if (doc) lines.push(doc, "");
      if (fn.examples) lines.push("```lua", fn.examples, "```", "");
    }
  }

  if (m.variables.length > 0) {
    lines.push("## Variables", "");
    for (const v of m.variables) {
      lines.push(`### \`${v.name}: ${typeList(v.types)}\``, "");
      const doc = htmlToDocText(v.description || v.brief);
      if (doc) lines.push(doc, "");
    }
  }

  if (m.constants.length > 0) {
    lines.push("## Constants", "");
    for (const cst of m.constants) {
      lines.push(`### \`${cst.name}\``, "");
      const doc = htmlToDocText(cst.description || cst.brief);
      if (doc) lines.push(doc, "");
    }
  }

  if (m.properties.length > 0) {
    lines.push("## Properties", "");
    for (const prop of m.properties) {
      lines.push(`### \`${prop.name}: ${typeList(prop.types)}\``, "");
      const doc = htmlToDocText(prop.description || prop.brief);
      if (doc) lines.push(doc, "");
    }
  }

  return lines.join("\n");
}

function isEmptyModule(m: ApiModule): boolean {
  return (
    m.functions.length === 0 &&
    m.variables.length === 0 &&
    m.constants.length === 0 &&
    m.properties.length === 0
  );
}

export default createRoute(
  ssgParams(() => apiPages().map((page) => ({ namespace: page.namespace }))),
  async (c) => {
    const namespace = c.req.param("namespace");
    const page = apiPages().find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    const body = moduleMarkdown(page);
    if (isEmptyModule(page.module)) {
      // Honest empty state: the namespace exists, the fixture for it just
      // hasn't been populated with elements yet. Don't pretend there's
      // content — show the brief and a quiet "not yet documented" card.
      return c.render(
        <article class="prose">
          <h1>{page.module.namespace}</h1>
          {page.module.brief ? <p>{htmlToDocText(page.module.brief)}</p> : null}
          <div class="not-prose mt-6 rounded-lg border border-dashed border-border bg-surface px-5 py-6 text-sm text-text-muted">
            <p class="font-medium text-text">No symbols documented yet</p>
            <p class="mt-1">
              The Defold reference fixture for this namespace ships with no elements, so the
              reference surface for it is empty. Once a populated fixture lands, the page picks up
              functions, variables, constants, and properties automatically.
            </p>
          </div>
        </article>,
        { title: `${page.module.namespace} API` },
      );
    }

    const html = await renderMarkdown(body);
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
