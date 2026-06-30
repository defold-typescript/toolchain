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

// Hand-curated briefs for the types whose intent isn't obvious from members
// alone (the opaque `Hash`, the index-accessed `Vector`, the branded `Opaque`);
// the rest get a short component summary. These are core types, never sourced
// from `ref-doc.zip`.
const TYPE_BRIEFS: Record<string, string> = {
  Vector: "A read-only numeric vector accessed by index; `length` is its component count.",
  Vector3: "A three-component vector with `x`, `y`, and `z` components.",
  Vector4: "A four-component vector with `x`, `y`, `z`, and `w` components.",
  Quaternion: "A rotation quaternion with `x`, `y`, `z`, and `w` components.",
  Matrix4: "A 4x4 transformation matrix.",
  Hash: "An opaque, branded handle to a hashed name: hold it and pass it back to the engine API, but never inspect or construct it.",
  Url: "A message-passing address with `socket`, `path`, and `fragment` components.",
  Opaque:
    "A nominal, branded handle to an engine value: hold it and pass it back to the API, but never inspect or construct it. The `Name` parameter mints a distinct brand per kind, so handles of different kinds never interchange.",
};

// Deep, multi-paragraph descriptions for the two brand types whose intent is
// the least obvious at a glance. Paragraphs are separated by blank lines and
// rendered as the page body (`description` wins over `brief` in
// `apiPageMarkdown`). Kept in lockstep with the canonical JSDoc on
// `Core.Hash`/`Core.Opaque` in `packages/types/src/core-types.ts` — when one
// changes, change the other. These strings are the same HTML-ish data contract
// as ref-doc descriptions: `htmlToDocText` strips tags and decodes entities, so
// a literal generic like `Opaque<"node">` is written `Opaque&lt;"node"&gt;` to
// survive the tag-strip and decode back before Markdown rendering.
const TYPE_DESCRIPTIONS: Record<string, string> = {
  Hash: [
    "A nominal, branded handle to a *hashed name* — the identifier Defold uses in place of a string for game-object and component ids, resource paths, input-action names, material, animation, and constant names, and the `socket`, `path`, and `fragment` of every `Url`. You obtain one from the global `hash(name)` function (or receive it back from the engine) and pass it straight to the API; you never inspect or assemble its bits by hand.",
    "The brand is a phantom `unique symbol` property that exists only in the type system and is erased at transpile — at runtime a `Hash` is the engine's opaque hash value, not an object carrying that property. Because the symbol is not exported, consumer code cannot fabricate a `Hash`; the only sources are `hash()` and the engine. That nominal branding is what stops a bare `string` or `number` from standing in where the API expects an already-hashed name. Many engine functions also accept a plain `string` and hash it for you, but a value already typed `Hash` is passed through as-is.",
    "Hashing is one-way: the original string cannot be recovered from a `Hash`. `hash_to_hex(h)` renders it as a hexadecimal string for logging, and `pprint` shows it as `hash: [0x…]`. Two hashes are equal exactly when they name the same thing, so a `Hash` is safe to compare, store, and use as a table key.",
  ].join("\n\n"),
  Opaque: [
    "A typed handle to a resource the engine owns and manages — a GUI node, a texture, a render target, a physics body, a socket, and so on. You get one back from an engine function, keep it in a variable, and pass it to the other functions that act on that resource. Treat it as an opaque ticket: meaningful to the engine, not a value you read or assemble yourself.",
    'Why a dedicated type? Each kind of handle is its own brand, so the compiler keeps them apart: `Opaque&lt;"node"&gt;` and `Opaque&lt;"texture"&gt;` are different types, and passing a texture where a node is expected is a compile error, exactly as a wrong primitive would be. The brand is a phantom `unique symbol` property that lives only in the type system and is erased at transpile — at runtime the value is just the engine\'s userdata. Because the symbol is never exported, consumer code cannot fabricate a handle or inspect or construct one; the engine API is the only source.',
    'The handle kinds modeled today, grouped by area: GUI &amp; rendering — `Opaque&lt;"node"&gt;`, `Opaque&lt;"texture"&gt;`, `Opaque&lt;"render_target"&gt;`, `Opaque&lt;"constant"&gt;`, `Opaque&lt;"constant_buffer"&gt;`; resources &amp; buffers — `Opaque&lt;"resource"&gt;`, `Opaque&lt;"buffer"&gt;`, `Opaque&lt;"bufferstream"&gt;`; sockets — `Opaque&lt;"client"&gt;`, `Opaque&lt;"server"&gt;`, `Opaque&lt;"master"&gt;`, `Opaque&lt;"connected"&gt;`, `Opaque&lt;"unconnected"&gt;`; Box2D physics — `Opaque&lt;"b2Body"&gt;`, `Opaque&lt;"b2World"&gt;`; and the generic `Opaque&lt;"userdata"&gt;`.',
    'Handles always come back from the engine. For example: `gui.get_node("button")` yields `Opaque&lt;"node"&gt;`; `render.render_target(name, opts)` yields `Opaque&lt;"render_target"&gt;`; `render.constant_buffer()` yields `Opaque&lt;"constant_buffer"&gt;`; `resource.load_buffer(path)` yields `Opaque&lt;"buffer"&gt;`; `buffer.get_stream(buf, "rgb")` yields `Opaque&lt;"bufferstream"&gt;`; `b2d.get_world()` yields `Opaque&lt;"b2World"&gt;`; `socket.tcp()` yields a `master` socket handle; and the `self` passed to lifecycle functions like `init` and `update` is `Opaque&lt;"userdata"&gt;`.',
    'Contrast with a `LuaTable` alias, which says the opposite: "inspect freely, the shape simply isn\'t modeled." An `Opaque` says "do not look inside — this value is meaningful only to the engine."',
  ].join("\n\n"),
};

const INTERFACE_RE = /export interface (\w+)[^{]*\{([\s\S]*?)\}/g;

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

function buildPage(name: string, members: RawMember[]): ApiPage {
  const functions: ApiFunction[] = [];
  const properties: ApiPropertyShape[] = [];
  for (const member of members) {
    if (/Lua\w+Method</.test(member.rhs))
      functions.push(...parseOperatorMethod(member.name, member.rhs));
    else properties.push(parseProperty(member));
  }
  const brief = TYPE_BRIEFS[name] ?? "";
  const description = TYPE_DESCRIPTIONS[name] ?? "";
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
    pages.push(buildPage(name, parseMembers(match[2] as string)));
  }
  return pages;
}
