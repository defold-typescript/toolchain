import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFOLD_TYPE_MAP,
  type Hash,
  type Matrix4,
  type Opaque,
  type Quaternion,
  type Url,
  type Vector,
  type Vector3,
  type Vector4,
} from "./core-types";

const VALUE_TYPES = [
  "Hash",
  "Opaque",
  "Vector",
  "Vector3",
  "Vector4",
  "Quaternion",
  "Matrix4",
  "Url",
] as const;

// The next step derives each global-type page's brief from the first sentence of
// these JSDoc summaries, so each must carry the concept it names.
const SUMMARY_MARKERS: Record<string, string> = {
  Vector: "accessed by index",
  Vector3: "three-component vector",
  Vector4: "four-component vector",
  Quaternion: "rotation quaternion",
  Matrix4: "transformation matrix",
  Url: "message-passing address",
};

const coreSource = readFileSync(path.join(import.meta.dir, "core-types.ts"), "utf8");
const coreLines = coreSource.split("\n");

function declarationLine(name: string): number {
  const index = coreLines.findIndex((line) => line.trim().startsWith(`export interface ${name}`));
  if (index < 0) throw new Error(`interface ${name} not found`);
  return index;
}

function precedingNonBlank(lineIndex: number): string | undefined {
  for (let i = lineIndex - 1; i >= 0; i--) {
    const trimmed = (coreLines[i] as string).trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

// The JSDoc summary for `name`: text from its `/**` block up to the first
// sentence terminator, gutter stripped.
function jsdocSummary(name: string): string {
  const start = declarationLine(name);
  let open = -1;
  for (let i = start - 1; i >= 0; i--) {
    if ((coreLines[i] as string).trim().startsWith("/**")) {
      open = i;
      break;
    }
  }
  if (open < 0) throw new Error(`no JSDoc block above ${name}`);
  const body = coreLines
    .slice(open, start)
    .map((line) =>
      line
        .trim()
        .replace(/^\/\*\*+/, "")
        .replace(/\*\/$/, "")
        .replace(/^\*\s?/, ""),
    )
    .join(" ")
    .trim();
  const terminator = body.search(/\.(\s|$)/);
  return terminator < 0 ? body : body.slice(0, terminator);
}

type TypeToken = { token: string; channel: "types" | "brief"; label: string };

// A ref-doc spells types in two channels: a `types` array, which can sit at any
// depth (parameters, return values, nested `fields`, `functions` under a
// TYPEDEF), and an element's `brief` type span, which is a PROPERTY's only type
// carrier. Keying on the `types` key alone — never on the enclosing key name —
// is what keeps the walk generic as fixtures grow new positions. The `brief`
// scan mirrors `parseProperty` (`api-doc.ts:126-134`); keep the two in sync.
function typeTokens(value: unknown, label = ""): TypeToken[] {
  const tokens: TypeToken[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      tokens.push(...typeTokens(item, `${label}[${index}]`));
    });
    return tokens;
  }
  if (value === null || typeof value !== "object") return tokens;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childLabel = label ? `${label}.${key}` : key;
    if (key === "types" && Array.isArray(child)) {
      child.forEach((item, index) => {
        if (typeof item === "string") {
          tokens.push({ token: item, channel: "types", label: `${childLabel}[${index}]` });
          return;
        }
        tokens.push(...typeTokens(item, `${childLabel}[${index}]`));
      });
      continue;
    }
    if (key === "brief" && typeof child === "string") {
      const span = /<span class="type">([^<]+)<\/span>/.exec(child);
      if (span?.[1] !== undefined) {
        for (const token of span[1]
          .split("|")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)) {
          tokens.push({ token, channel: "brief", label: childLabel });
        }
      }
      continue;
    }
    tokens.push(...typeTokens(child, childLabel));
  }
  return tokens;
}

function bareMatrixTokens(doc: unknown, label = ""): string[] {
  return typeTokens(doc, label)
    .filter((entry) => entry.token === "matrix")
    .map((entry) => entry.label);
}

function fixtureDocs(): Array<{ file: string; doc: unknown }> {
  const docs: Array<{ file: string; doc: unknown }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(target);
        continue;
      }
      if (!entry.name.endsWith("_doc.json")) continue;
      try {
        docs.push({ file: target, doc: JSON.parse(readFileSync(target, "utf8")) });
      } catch {}
    }
  };
  walk(path.resolve(import.meta.dir, "..", "fixtures"));
  return docs;
}

describe("core-types", () => {
  test("Vector3 is assignable to { x: number; y: number; z: number }", () => {
    const v = { x: 1, y: 2, z: 3 } as unknown as Vector3;
    const shaped: { x: number; y: number; z: number } = v;
    expect(shaped.x + shaped.y + shaped.z).toBe(6);
  });

  test("Vector4 has x/y/z/w numeric fields", () => {
    const v = { x: 1, y: 2, z: 3, w: 4 } as unknown as Vector4;
    expect(v.w).toBe(4);
  });

  test("Quaternion has x/y/z/w numeric fields", () => {
    const q = { x: 0, y: 0, z: 0, w: 1 } as unknown as Quaternion;
    expect(q.w).toBe(1);
  });

  test("Vector indexed-access yields number", () => {
    const v: Vector = Object.assign([1, 2, 3] as readonly number[], { length: 3 }) as Vector;
    expect(v[0]).toBe(1);
    expect(v.length).toBe(3);
  });

  test("Matrix4 carries m00..m33 fields", () => {
    const fields = ["m00", "m01", "m02", "m03", "m10", "m11", "m12", "m13"] as const;
    const m = {
      m00: 1,
      m01: 0,
      m02: 0,
      m03: 0,
      m10: 0,
      m11: 1,
      m12: 0,
      m13: 0,
      m20: 0,
      m21: 0,
      m22: 1,
      m23: 0,
      m30: 0,
      m31: 0,
      m32: 0,
      m33: 1,
      c0: { x: 1, y: 0, z: 0, w: 0 },
      c1: { x: 0, y: 1, z: 0, w: 0 },
      c2: { x: 0, y: 0, z: 1, w: 0 },
      c3: { x: 0, y: 0, z: 0, w: 1 },
    } as unknown as Matrix4;
    for (const f of fields) {
      expect(typeof m[f]).toBe("number");
    }
    expect(m.c3.w).toBe(1);
  });

  test("Hash and Url are typed shells (compile-only)", () => {
    // Hash and Url are branded; these assignments only need to type-check.
    const useHash = (_: Hash) => 0;
    const useUrl = (_: Url) => 0;
    expect(typeof useHash).toBe("function");
    expect(typeof useUrl).toBe("function");
  });

  test("Opaque brands are mutually non-assignable (compile-only)", () => {
    const useTexture = (_: Opaque<"texture">) => 0;
    const node = {} as Opaque<"node">;
    // @ts-expect-error a node handle is not assignable to a texture handle
    useTexture(node);
    expect(typeof useTexture).toBe("function");
  });

  test("bufferstream handle is index-mutable yet still nominally branded (compile-only)", () => {
    const stream = {} as Opaque<"bufferstream"> & { [i: number]: number };
    const n: number | undefined = stream[0];
    stream[0] = 1;
    void n;
    const usesStream = (_: Opaque<"bufferstream"> & { [i: number]: number }) => 0;
    // @ts-expect-error a plain number array lacks the bufferstream brand symbol
    usesStream([1, 2, 3]);
    expect(typeof usesStream).toBe("function");
  });

  test("DEFOLD_TYPE_MAP maps the expected Defold tokens to the expected TS identifiers", () => {
    const rows: ReadonlyArray<readonly [string, string]> = [
      ["number", "number"],
      ["int", "number"],
      ["integer", "number"],
      ["string", "string"],
      ["boolean", "boolean"],
      ["table", "Record<string | number, unknown>"],
      ["function", "(...args: unknown[]) => unknown"],
      ["vector", "Vector"],
      ["vector3", "Vector3"],
      ["vector4", "Vector4"],
      ["quaternion", "Quaternion"],
      ["matrix4", "Matrix4"],
      ["matrix", "Matrix4"],
      ["hash", "Hash"],
      ["url", "Url"],
      ["node", 'Opaque<"node">'],
      ["texture", 'Opaque<"texture">'],
      ["render_target", 'Opaque<"render_target">'],
      ["constant", 'Opaque<"constant">'],
      ["constant_buffer", 'Opaque<"constant_buffer">'],
      ["buffer", 'Opaque<"buffer">'],
      ["bufferstream", 'Opaque<"bufferstream"> & { [index: number]: number }'],
      ["userdata", 'Opaque<"userdata">'],
      ["resource", 'Opaque<"resource">'],
      ["b2World", 'Opaque<"b2World">'],
      ["b2Body", 'Opaque<"b2Body">'],
      // socket handle types resolve to their method-bearing `interface <receiver>`,
      // not opaque brands.
      ["client", "client"],
      ["connected", "connected"],
      ["master", "master"],
      ["server", "server"],
      ["unconnected", "unconnected"],
      ["any", "unknown"],
    ];
    for (const [defoldToken, tsType] of rows) {
      expect(DEFOLD_TYPE_MAP[defoldToken]).toBe(tsType);
    }
  });

  // `matrix` is an authored-README shorthand; every engine ref-doc spells the
  // type `matrix4`. Mapping the shorthand globally is only safe while that stays
  // true, so a release import that introduces a bare `matrix` fails here. The
  // scan covers every type-bearing position, including the `brief` type span
  // that is a PROPERTY's only type carrier.
  test("no engine ref-doc fixture uses a bare `matrix` type token", () => {
    const offenders: string[] = [];
    for (const { file, doc } of fixtureDocs()) {
      offenders.push(...bareMatrixTokens(doc, file));
    }
    expect(offenders).toEqual([]);
  });

  test("the corpus walk observes tokens in both channels", () => {
    let typesTokens = 0;
    let briefTokens = 0;
    for (const { doc } of fixtureDocs()) {
      for (const token of typeTokens(doc)) {
        if (token.channel === "types") typesTokens++;
        else briefTokens++;
      }
    }
    expect(typesTokens).toBeGreaterThan(1000);
    expect(briefTokens).toBeGreaterThan(100);
  });

  const DETECTED: ReadonlyArray<readonly [string, unknown]> = [
    [
      "a FUNCTION parameter's `types`",
      {
        elements: [{ type: "FUNCTION", name: "f", parameters: [{ name: "m", types: ["matrix"] }] }],
      },
    ],
    [
      "a FUNCTION return value's `types`",
      {
        elements: [
          { type: "FUNCTION", name: "f", returnvalues: [{ name: "out", types: ["matrix"] }] },
        ],
      },
    ],
    [
      "a nested parameter `fields[].types`",
      {
        elements: [
          {
            type: "FUNCTION",
            name: "f",
            parameters: [
              {
                name: "opts",
                types: ["table"],
                fields: [{ name: "inner", fields: [{ name: "m", types: ["matrix"] }] }],
              },
            ],
          },
        ],
      },
    ],
    [
      "a MESSAGE parameter's `types`",
      {
        elements: [
          { type: "MESSAGE", name: "msg", parameters: [{ name: "m", types: ["matrix"] }] },
        ],
      },
    ],
    [
      "a TYPEDEF parameter's `types`",
      {
        elements: [{ type: "TYPEDEF", name: "td", parameters: [{ name: "m", types: ["matrix"] }] }],
      },
    ],
    [
      "an element-level `types` array",
      { elements: [{ type: "VARIABLE", name: "v", types: ["matrix"] }] },
    ],
    [
      "a PROPERTY `brief` span alone",
      {
        elements: [
          { type: "PROPERTY", name: "p", brief: '<span class="type">matrix</span> the thing' },
        ],
      },
    ],
    [
      "a PROPERTY `brief` span in a union",
      {
        elements: [
          { type: "PROPERTY", name: "p", brief: '<span class="type">matrix|nil</span> the thing' },
        ],
      },
    ],
    [
      "a PROPERTY `brief` span with irregular spacing",
      {
        elements: [
          {
            type: "PROPERTY",
            name: "p",
            brief: '<span class="type">nil |  matrix </span> the thing',
          },
        ],
      },
    ],
    [
      "a `types` array under `element.functions[].parameters[]`",
      {
        elements: [
          {
            type: "TYPEDEF",
            name: "td",
            functions: [{ name: "g", parameters: [{ name: "m", types: ["matrix"] }] }],
          },
        ],
      },
    ],
  ];

  for (const [position, doc] of DETECTED) {
    test(`a bare \`matrix\` is detected in ${position}`, () => {
      expect(bareMatrixTokens(doc)).toHaveLength(1);
    });
  }

  const NOT_DETECTED: ReadonlyArray<readonly [string, unknown]> = [
    [
      "`matrix4`",
      {
        elements: [
          { type: "FUNCTION", name: "f", parameters: [{ name: "m", types: ["matrix4"] }] },
        ],
      },
    ],
    [
      "`vmath.matrix4`",
      {
        elements: [
          {
            type: "FUNCTION",
            name: "f",
            returnvalues: [{ name: "out", types: ["vmath.matrix4"] }],
          },
        ],
      },
    ],
    [
      "the word `matrix` in `brief` prose outside a type span",
      {
        elements: [
          {
            type: "PROPERTY",
            name: "p",
            brief: '<span class="type">matrix4</span> the transformation matrix',
          },
        ],
      },
    ],
  ];

  for (const [subject, doc] of NOT_DETECTED) {
    test(`${subject} is not reported as a bare \`matrix\``, () => {
      expect(bareMatrixTokens(doc)).toEqual([]);
    });
  }
});

describe("core-types.ts canonical JSDoc", () => {
  for (const name of VALUE_TYPES) {
    test(`${name} is immediately preceded by a JSDoc block`, () => {
      const preceding = precedingNonBlank(declarationLine(name));
      expect(preceding).toBeDefined();
      expect((preceding as string).endsWith("*/")).toBe(true);
    });
  }

  for (const [name, marker] of Object.entries(SUMMARY_MARKERS)) {
    test(`${name} JSDoc summary carries its marker`, () => {
      expect(jsdocSummary(name).toLowerCase()).toContain(marker);
    });
  }
});
