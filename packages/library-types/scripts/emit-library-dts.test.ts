import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emitLibraryDeclarations } from "./emit-library-dts";
import type { LibraryModel } from "./parse-luals";
import { buildTargetModel, readLualsTargets } from "./sync-luals-types";

test("emits a declare module block with an interface, its field and method, and a module function", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "widget",
        generics: [],
        fields: [{ name: "count", types: ["integer"], doc: "", isOptional: false }],
        methods: [
          {
            name: "resize",
            brief: "Resize the widget.",
            generics: [],
            params: [
              { name: "size", types: ["number"], doc: "", isOptional: false, isVararg: false },
            ],
            returns: [
              { name: "ok", types: ["boolean"], doc: "", isOptional: false, isVararg: false },
            ],
          },
        ],
        brief: "A widget.",
      },
    ],
    aliases: [],
    moduleFunctions: [
      {
        name: "create",
        brief: "Create a widget.",
        generics: [],
        params: [],
        returns: [
          { name: "widget", types: ["widget"], doc: "", isOptional: false, isVararg: false },
        ],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "demo.demo" });

  expect(out).toMatchSnapshot();
  expect(out).toContain("declare module 'demo.demo' {");
  expect(out).toContain("interface widget {");
  expect(out).toContain("count: number;");
  expect(out).toContain("resize(size: number): boolean;");
  expect(out).toContain("export function create(this: void): widget;");
});

test("emits a reserved-word member through the reserved-name path, not raw", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "opts",
        generics: [],
        fields: [{ name: "default", types: ["boolean"], doc: "", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain('"default"');
  expect(out).not.toMatch(/default\s*:/);
});

test("ignores interface generics, interface extends, and method generics (deferred scope)", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "box",
        extends: "container",
        generics: [{ name: "T", constraint: "base" }],
        fields: [],
        methods: [{ name: "map", brief: "", generics: [{ name: "U" }], params: [], returns: [] }],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface box {");
  expect(out).not.toContain("extends");
  expect(out).not.toContain("<T");
  expect(out).not.toContain("<U");
});

test("regenerating druid from the committed fixtures matches the committed golden byte-for-byte", () => {
  const packageRoot = join(import.meta.dir, "..");
  const druid = readLualsTargets(packageRoot).find((t) => t.namespace === "druid");
  if (!druid) throw new Error("druid target missing from luals-targets.json");

  const model = buildTargetModel(packageRoot, druid);
  const emitted = emitLibraryDeclarations(model, {
    moduleId: druid.moduleId,
    typeRenames: druid.typeRenames,
  });
  const golden = readFileSync(join(packageRoot, "generated", `${druid.namespace}.d.ts`), "utf8");

  expect(emitted).toBe(golden);
});
