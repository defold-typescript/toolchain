import { htmlToDocText } from "@defold-typescript/types";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";
import type { ApiPage } from "../../lib/api-surface";
import { renderMarkdown } from "../../lib/markdown";

function typeList(types: string[]): string {
  return types.length > 0 ? types.join(" | ") : "any";
}

function moduleMarkdown(page: ApiPage): string {
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

export default createRoute(
  ssgParams(() => apiPages().map((page) => ({ namespace: page.namespace }))),
  async (c) => {
    const namespace = c.req.param("namespace");
    const page = apiPages().find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();
    const html = await renderMarkdown(moduleMarkdown(page));
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${namespace} API`,
    });
  },
);
