import type { ApiFunction, ApiModule } from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";

// `ApiProperty` is not re-exported from the types package entry (matching
// `api-surface.ts`); index into `ApiModule` for the structural shape instead.
type ApiPropertyShape = ApiModule["properties"][number];

// The core global value types plus the generic `Opaque` brand, documented as
// reference pages. Kept in lockstep with the `declare global` re-exports in
// `packages/types/src/engine-globals.d.ts` by `global-types-drift.test.ts`.
const VALUE_TYPE_NAMES = [
  "Vector",
  "Vector3",
  "Vector4",
  "Quaternion",
  "Matrix4",
  "Hash",
  "Url",
  "Opaque",
] as const;

// TSTL operator metamethod types -> their display operator and arity. A method
// RHS naming a type outside this table is rejected (see `parseOperatorMethod`)
// so a new language-extension method fails loudly instead of rendering wrong.
const OPERATOR_METHODS: Record<string, { op: string; unary: boolean }> = {
  LuaAdditionMethod: { op: "+", unary: false },
  LuaSubtractionMethod: { op: "-", unary: false },
  LuaMultiplicationMethod: { op: "*", unary: false },
  LuaDivisionMethod: { op: "/", unary: false },
  LuaNegationMethod: { op: "-", unary: true },
};

const INTERFACE_RE = /export interface (\w+)[^{]*\{([\s\S]*?)\}/g;

// Rewrite the JSDoc inline `{@link [Core.]X}` tag to Markdown inline code, then
// entity-encode `&`/`<`/`>` so the string survives the shared render path:
// `apiPageMarkdown` runs `htmlToDocText` over the description, which strips any
// `<…>` it reads as a tag and decodes the entities back. Encoding must cover
// inline code too (not only prose) — a raw `Opaque<"node">` inside backticks
// would be eaten by the tag strip just the same.
function encodeProse(text: string): string {
  return text
    .replace(/\{@link\s+(?:Core\.)?([\w.]+)\s*\}/g, "`$1`")
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;");
}

// Convert a `/** … */` JSDoc block above a value-type interface into the same
// HTML-ish Markdown contract ref-doc descriptions use. Strips the `/**`/`*/`
// delimiters and the per-line ` * ` gutter, drops the `@remarks`/`@example`
// markers (keeping their bodies), and entity-encodes every prose and inline-code
// run while leaving fenced `@example` code verbatim for Markdown to render.
export function jsdocToMarkdown(block: string): string {
  const lines = block
    .replace(/^\s*\/\*\*+/, "")
    .replace(/\*\/\s*$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""));

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let fence: string[] | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push(encodeProse(paragraph.join("\n")));
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      fence.push(line);
      if (trimmed === "```") {
        blocks.push(fence.join("\n"));
        fence = null;
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      fence = [line];
      continue;
    }
    if (trimmed === "") {
      flush();
      continue;
    }
    if (trimmed.startsWith("@remarks") || trimmed.startsWith("@example")) {
      flush();
      const body = trimmed.replace(/^@\w+\s*/, "");
      if (body) paragraph.push(body);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  if (fence) blocks.push(fence.join("\n"));
  return blocks.join("\n\n");
}

// The page brief is the first sentence of the converted summary: the first
// paragraph (soft-wrapped lines rejoined with spaces) up to the first sentence
// terminator, matching the JSDoc convention that the opening sentence is the
// summary.
function firstSentence(markdown: string): string {
  const firstParagraph = (markdown.split("\n\n")[0] ?? "").replace(/\n/g, " ").trim();
  const match = firstParagraph.match(/^([\s\S]*?\.)(?:\s|$)/);
  return (match ? (match[1] as string) : firstParagraph).trim();
}

// The `/** … */` block immediately above the interface declaration at
// `interfaceStart`, or `""` when none precedes it. A `declare const …Brand`
// line above the JSDoc (as for `Hash`/`Opaque`) sits before the block's `/**`,
// so it is never swept in.
function precedingJsdoc(source: string, interfaceStart: number): string {
  const before = source.slice(0, interfaceStart).replace(/\s+$/, "");
  if (!before.endsWith("*/")) return "";
  const open = before.lastIndexOf("/**");
  return open < 0 ? "" : before.slice(open);
}

interface RawMember {
  name: string;
  rhs: string;
}

// Walk an interface body line by line, skipping JSDoc blocks, index
// signatures, and brand (`[symbol]`) members, yielding `name: RHS` pairs.
function parseMembers(body: string): RawMember[] {
  const members: RawMember[] = [];
  let inJsdoc = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (inJsdoc) {
      if (line.includes("*/")) inJsdoc = false;
      continue;
    }
    if (line.startsWith("/**")) {
      if (!line.includes("*/")) inJsdoc = true;
      continue;
    }
    if (line.startsWith("*") || line.startsWith("//")) continue;
    const decl = line.replace(/^readonly\s+/, "");
    if (decl.startsWith("[")) continue;
    const match = decl.match(/^(\w+)\s*:\s*(.+?);?$/);
    if (!match) continue;
    members.push({ name: match[1] as string, rhs: (match[2] as string).trim() });
  }
  return members;
}

function splitGenericArgs(args: string): string[] {
  return args
    .split(",")
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

// Expand one operator-method member (possibly a `&`-joined overload) into one
// `ApiFunction` per arm. Argument is the first generic, return the last;
// negation is nullary. Throws on an unrecognised `Lua<Op>Method` type.
function parseOperatorMethod(name: string, rhs: string): ApiFunction[] {
  return rhs.split("&").map((arm) => {
    const match = arm.trim().match(/^(Lua\w+Method)<(.*)>$/);
    if (!match) {
      throw new Error(`global-types: cannot parse operator method "${name}": ${arm.trim()}`);
    }
    const methodType = match[1] as string;
    const spec = OPERATOR_METHODS[methodType];
    if (!spec) {
      throw new Error(
        `global-types: unknown operator method "${methodType}" on "${name}" — add it to OPERATOR_METHODS`,
      );
    }
    const generics = splitGenericArgs(match[2] as string);
    const returnType = generics[generics.length - 1] as string;
    const parameters = spec.unary
      ? []
      : [{ name: "rhs", doc: "", types: [generics[0] as string], isOptional: false }];
    const brief = spec.unary ? "Lua unary `-` operator." : `Lua \`${spec.op}\` operator.`;
    return {
      name,
      brief,
      description: "",
      parameters,
      returnValues: [{ name: "", doc: "", types: [returnType], isOptional: false }],
    };
  });
}

function parseProperty(member: RawMember): ApiPropertyShape {
  return {
    name: member.name,
    types: member.rhs
      .split("|")
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
    brief: "",
    description: "",
  };
}

function buildPage(name: string, members: RawMember[], jsdoc: string): ApiPage {
  const functions: ApiFunction[] = [];
  const properties: ApiPropertyShape[] = [];
  for (const member of members) {
    if (/Lua\w+Method</.test(member.rhs))
      functions.push(...parseOperatorMethod(member.name, member.rhs));
    else properties.push(parseProperty(member));
  }
  const description = jsdoc ? jsdocToMarkdown(jsdoc) : "";
  const brief = description ? firstSentence(description) : "";
  const module: ApiModule = {
    namespace: name,
    brief,
    description,
    functions,
    variables: [],
    constants: [],
    properties,
    typedefs: [],
  };
  return {
    namespace: name,
    route: `/api/${name}`,
    brief,
    module,
    translations: {},
    signatures: {},
    category: "global-type",
  };
}

/**
 * Parse the core value-type interfaces out of a `core-types.ts` source string
 * into one `ApiPage` per type under the `global-type` category. Takes the
 * source as a string (not a file read) so it stays off the client graph,
 * matching the docs-site's node-free-client constraint. Properties become
 * `properties`; TSTL `Lua<Op>Method` members become `functions` with signatures
 * derived from the generic arguments, never hand-written.
 */
export function parseGlobalTypes(source: string): ApiPage[] {
  const pages: ApiPage[] = [];
  for (const match of source.matchAll(INTERFACE_RE)) {
    const name = match[1] as string;
    if (!(VALUE_TYPE_NAMES as readonly string[]).includes(name)) continue;
    const jsdoc = precedingJsdoc(source, match.index ?? 0);
    pages.push(buildPage(name, parseMembers(match[2] as string), jsdoc));
  }
  return pages;
}
