import type { ModuleManifestEntry } from "./regen";

// A constant family the engine registers and one function's parameter prose
// lists, but no ref-doc element declares. Each release's own list is the
// evidence, so a surface declares exactly the members its release documents.
interface ProseConstantFamily {
  readonly namespace: string;
  readonly prefix: string;
  readonly describes: string;
  readonly evidence: {
    readonly namespace: string;
    readonly function: string;
    readonly parameter: string;
  };
}

const PROSE_CONSTANT_FAMILIES: readonly ProseConstantFamily[] = [
  {
    namespace: "graphics",
    prefix: "SEMANTIC_TYPE_",
    describes: "Vertex attribute semantic type",
    evidence: {
      namespace: "material",
      function: "material.set_vertex_attributes",
      parameter: "attributes",
    },
  },
];

interface DocElement {
  readonly type: string;
  readonly name: string;
  readonly parameters?: readonly { readonly name: string; readonly doc?: string }[];
}

interface ApiDoc {
  readonly elements: readonly DocElement[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evidencedNames(family: ProseConstantFamily, modules: readonly ModuleManifestEntry[]) {
  const source = modules.find((m) => m.namespace === family.evidence.namespace);
  if (!source) return [];
  const fn = (source.doc as ApiDoc).elements.find(
    (e) => e.type === "FUNCTION" && e.name === family.evidence.function,
  );
  const prose = fn?.parameters?.find((p) => p.name === family.evidence.parameter)?.doc ?? "";
  const item = new RegExp(
    `<li><code>(${escapeRegExp(`${family.namespace}.${family.prefix}`)}\\w+)</code></li>`,
    "g",
  );
  return [...new Set(Array.from(prose.matchAll(item), (m) => m[1] as string))];
}

function constantElement(name: string, brief: string) {
  return {
    type: "CONSTANT",
    name,
    brief,
    description: "",
    returnvalues: [],
    parameters: [],
    examples: "",
    replaces: "",
    error: "",
    tparams: [],
    members: [],
    notes: [],
    language: "",
  };
}

export function synthesizeProseConstants(
  modules: readonly ModuleManifestEntry[],
): ModuleManifestEntry[] {
  let out = [...modules];
  for (const family of PROSE_CONSTANT_FAMILIES) {
    const names = evidencedNames(family, out);
    if (names.length === 0) continue;
    const index = out.findIndex((m) => m.namespace === family.namespace);
    const target = out[index];
    if (!target) continue;
    const doc = target.doc as ApiDoc;
    const declared = new Set(doc.elements.map((e) => e.name));
    const brief = `${family.describes}, for \`${family.evidence.function}\`.`;
    const added = names.filter((n) => !declared.has(n)).map((n) => constantElement(n, brief));
    if (added.length === 0) continue;
    out = out.map((m, i) =>
      i === index ? { ...m, doc: { ...doc, elements: [...doc.elements, ...added] } } : m,
    );
  }
  return out;
}
