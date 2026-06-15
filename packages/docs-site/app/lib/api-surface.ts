import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiModule,
  examplesHtmlToMarkdown,
  htmlToDocText,
  parseDefoldApiDoc,
} from "@defold-typescript/types";

export interface ApiPage {
  namespace: string;
  route: string;
  brief: string;
  module: ApiModule;
}

function typeList(types: string[]): string {
  return types.length > 0 ? types.join(" | ") : "any";
}

export function apiModuleMarkdown(page: Pick<ApiPage, "namespace" | "module">): string {
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
      if (fn.examples) {
        const converted = examplesHtmlToMarkdown(fn.examples);
        if (converted) lines.push(converted, "");
      }
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

interface ApiTarget {
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string }[];
}

export function loadApiSurface(typesDir: string): ApiPage[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };

  const target = targets.find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }

  return target.modules
    .map((mod): ApiPage => {
      const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
      const module = parseDefoldApiDoc(raw);
      return {
        namespace: mod.namespace,
        route: `/api/${mod.namespace}`,
        brief: module.brief,
        module,
      };
    })
    .sort((a, b) => a.namespace.localeCompare(b.namespace));
}
