import type { ModuleManifestEntry } from "./regen";

// A constant family the engine registers and one function's prose names, but no
// ref-doc element declares. Each release's own prose is the evidence, so a
// surface declares exactly the members its release documents; the engine-binding
// diff keeps every member registered. The prose is a parameter's `<li>` list, or,
// with no `parameter`, a `<code>` mention in the function's description.
interface ProseConstantFamily {
  readonly namespace: string;
  readonly prefix: string;
  readonly describes: string;
  readonly evidence: {
    readonly namespace: string;
    readonly function: string;
    readonly parameter?: string;
  };
}

const VERTEX_ATTRIBUTES = {
  namespace: "material",
  function: "material.set_vertex_attributes",
  parameter: "attributes",
} as const;

const PROSE_CONSTANT_FAMILIES: readonly ProseConstantFamily[] = [
  {
    namespace: "graphics",
    prefix: "SEMANTIC_TYPE_",
    describes: "Vertex attribute semantic type",
    evidence: VERTEX_ATTRIBUTES,
  },
  {
    namespace: "graphics",
    prefix: "DATA_TYPE_",
    describes: "Vertex attribute data type",
    evidence: VERTEX_ATTRIBUTES,
  },
  {
    namespace: "graphics",
    prefix: "COORDINATE_SPACE_",
    describes: "Vertex attribute coordinate space",
    evidence: VERTEX_ATTRIBUTES,
  },
  {
    namespace: "material",
    prefix: "CONSTANT_TYPE_",
    describes: "Material constant type",
    evidence: { namespace: "material", function: "material.set_constants", parameter: "constants" },
  },
  {
    namespace: "render",
    prefix: "TEXTURE_BIT",
    describes: "Render target buffer flag that samples a depth or stencil buffer as a texture",
    evidence: { namespace: "render", function: "render.render_target" },
  },
];

interface DocElement {
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly parameters?: readonly { readonly name: string; readonly doc?: string }[];
  readonly members?: readonly { readonly name: string }[];
}

interface ApiDoc {
  readonly elements: readonly DocElement[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evidenceFunction(
  family: ProseConstantFamily,
  modules: readonly ModuleManifestEntry[],
): DocElement | undefined {
  const source = modules.find((m) => m.namespace === family.evidence.namespace);
  return (source?.doc as ApiDoc | undefined)?.elements.find(
    (e) => e.type === "FUNCTION" && e.name === family.evidence.function,
  );
}

// A release may declare the family itself, as `CONSTANT`s or `ENUM` members.
function declaresFamily(family: ProseConstantFamily, modules: readonly ModuleManifestEntry[]) {
  const target = modules.find((m) => m.namespace === family.namespace);
  const prefix = `${family.namespace}.${family.prefix}`;
  return ((target?.doc as ApiDoc | undefined)?.elements ?? []).some(
    (e) =>
      e.name.startsWith(prefix) ||
      (e.members ?? []).some((member) => member.name.startsWith(prefix)),
  );
}

function evidencedNames(family: ProseConstantFamily, fn: DocElement | undefined) {
  const { parameter } = family.evidence;
  const prose =
    parameter === undefined
      ? (fn?.description ?? "")
      : (fn?.parameters?.find((p) => p.name === parameter)?.doc ?? "");
  const name = escapeRegExp(`${family.namespace}.${family.prefix}`);
  const item = new RegExp(
    parameter === undefined ? `<code>(${name}\\w*)</code>` : `<li><code>(${name}\\w+)</code></li>`,
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
    const fn = evidenceFunction(family, out);
    const names = evidencedNames(family, fn);
    if (names.length === 0) {
      // The evidence function survives but its prose lists no member: unless the
      // release declares the family itself, the constants would vanish unannounced.
      if (fn !== undefined && !declaresFamily(family, out)) {
        throw new Error(
          `prose constant family ${family.namespace}.${family.prefix}*: ${family.evidence.function} lists no member and ${family.namespace} declares none`,
        );
      }
      continue;
    }
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
