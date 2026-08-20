import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  EDITOR_MODULE_MANIFEST,
  EDITOR_SKIP_FUNCTIONS,
  EDITOR_VM_MODULE_MANIFEST,
  generateBuiltinMessagesDeclaration,
  generateKindIndex,
  generateModuleDeclaration,
  generateVersionIndex,
  KIND_MODULE_MANIFEST,
  type KindManifestEntry,
  loadApiTargets,
  MESSAGES_MANIFEST,
  MODULE_MANIFEST,
  RUNTIME_KIND_MANIFEST,
  targetKindManifest,
  VERSIONED_MODULE_MANIFEST,
  versionedModuleManifest,
} from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { unexpressedFixtureNames } from "./declared-fqns";

const GENERATED = resolve(import.meta.dir, "..", "generated");

// Every entry `regen` writes into `generated/` as a namespace declaration. The
// editor sets ride the same emit pipeline as the runtime modules while staying
// out of MODULE_MANIFEST, so the drift/syntax/JSDoc guards must span all three.
const COMMITTED_MODULES = [
  ...MODULE_MANIFEST,
  ...EDITOR_MODULE_MANIFEST,
  ...EDITOR_VM_MODULE_MANIFEST,
];

describe("regen drift guard", () => {
  test.each(
    COMMITTED_MODULES.map((entry) => [entry.namespace, entry] as const),
  )("%s: committed generated file matches a fresh pipeline run byte-for-byte", async (_namespace, entry) => {
    const { contents: fresh } = generateModuleDeclaration(entry);
    const committed = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    if (committed !== fresh) {
      throw new Error(`${entry.outFile} is stale — run \`bun run regen\` in \`packages/types/\``);
    }
    expect(committed).toBe(fresh);
  });

  test.each(
    COMMITTED_MODULES.map((entry) => [entry.outFile, entry] as const),
  )("%s: committed generated file is syntactically-valid TypeScript", async (_outFile, entry) => {
    const content = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test.each(
    COMMITTED_MODULES.map((entry) => [entry.outFile, entry] as const),
  )("%s: committed generated namespace has a JSDoc block", async (_outFile, entry) => {
    const content = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    expect(content).toContain(`  namespace ${entry.namespace} {`);
    expect(content).toMatch(
      new RegExp(
        `declare global \\{\\n(?:[\\s\\S]*?\\n)?  /\\*\\*[\\s\\S]*?\\n  namespace ${entry.namespace} \\{`,
      ),
    );
  });

  test("every MODULE_MANIFEST entry has a committed generated file", () => {
    for (const entry of COMMITTED_MODULES) {
      const path = resolve(GENERATED, entry.outFile);
      const exists = Bun.file(path).size > 0;
      if (!exists) {
        throw new Error(
          `MODULE_MANIFEST entry "${entry.namespace}" references missing file ${entry.outFile}`,
        );
      }
      expect(exists).toBe(true);
    }
  });

  test("every committed generated/*.d.ts is referenced by exactly one manifest entry", () => {
    const onDisk = readdirSync(GENERATED).filter((f) => f.endsWith(".d.ts"));
    for (const file of onDisk) {
      const moduleMatches = COMMITTED_MODULES.filter((e) => e.outFile === file).length;
      const messagesMatches = MESSAGES_MANIFEST.outFile === file ? 1 : 0;
      const total = moduleMatches + messagesMatches;
      if (total !== 1) {
        throw new Error(
          `generated/${file} is referenced by ${total} manifest entries (expected exactly 1)`,
        );
      }
      expect(total).toBe(1);
    }
  });
});

describe("go facade skip", () => {
  test("generated go.d.ts declares neither facade-owned get/set/property nor drops animate/properties", () => {
    const go = MODULE_MANIFEST.find((e) => e.namespace === "go");
    if (!go) throw new Error("go manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(go);
    expect(contents).not.toContain("function get(");
    expect(contents).not.toContain("function set(");
    expect(contents).not.toContain("function property(");
    expect(contents).toContain("function animate(");
    expect(contents).toContain("interface properties {");
    expect(dropped).toContain("go.get");
    expect(dropped).toContain("go.set");
    expect(dropped).toContain("go.property");
  });
});

describe("reserved-name member recovery", () => {
  test("go no longer drops go.delete (recovered via alias) but still drops the skip-functions", () => {
    const go = MODULE_MANIFEST.find((e) => e.namespace === "go");
    if (!go) throw new Error("go manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(go);
    expect(dropped).not.toContain("go.delete");
    expect(dropped).toContain("go.get");
    expect(dropped).toContain("go.set");
    expect(dropped).toContain("go.property");
    expect(contents).toContain("function _delete(");
    expect(contents).toContain("export { _delete as delete };");
  });

  test("json drops nothing — its only reserved member json.null is recovered", () => {
    const json = MODULE_MANIFEST.find((e) => e.namespace === "json");
    if (!json) throw new Error("json manifest entry missing");
    const { contents, dropped } = generateModuleDeclaration(json);
    expect(dropped).toEqual([]);
    expect(contents).toContain("export { _null as null };");
  });
});

describe("manifest member skips", () => {
  // A skip rule withholds a member whatever its element type: a constant table
  // the hand-authored lane owns is a VARIABLE, and leaving the filter on
  // functions alone would emit an `unknown`-typed duplicate beside it.
  const element = (type: string, name: string) => ({
    type,
    name,
    brief: "",
    description: "",
    parameters: [],
    returnvalues: [],
    types: ["string"],
  });
  const entry = {
    namespace: "demo",
    outFile: "demo.d.ts",
    doc: {
      info: { namespace: "demo", brief: "d", description: "d" },
      elements: [
        element("FUNCTION", "demo.kept"),
        element("FUNCTION", "demo.gone"),
        element("VARIABLE", "demo.KEPT"),
        element("VARIABLE", "demo.GONE"),
        element("VARIABLE", "demo.TABLE.MEMBER"),
        element("VARIABLE", "demo.OTHER.MEMBER"),
      ],
    },
    skipFunctions: ["gone", "GONE", "TABLE."],
  };

  test("an exact or segment-prefix rule withholds a VARIABLE and reports it through dropped", () => {
    const { contents, dropped } = generateModuleDeclaration(entry);
    expect(dropped.sort()).toEqual(["demo.GONE", "demo.TABLE.MEMBER", "demo.gone"]);
    expect(contents).toContain("function kept(");
    expect(contents).toContain("const KEPT:");
    expect(contents).toContain("namespace OTHER {");
    expect(contents).not.toContain("function gone(");
    expect(contents).not.toContain("const GONE:");
    expect(contents).not.toContain("namespace TABLE {");
  });
});

describe("editor namespace emit", () => {
  const editorEntry = () => {
    const entry = EDITOR_MODULE_MANIFEST.find((e) => e.namespace === "editor");
    if (!entry) throw new Error("editor manifest entry missing");
    return entry;
  };

  test("emits the in-scope command/transaction surface including a nested tx namespace", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain("function get(");
    expect(contents).toContain("function transact(");
    expect(contents).toContain("namespace tx {");
    expect(contents).toContain("function set(");
  });

  test("hands editor.command to the hand-authored overload file instead of emitting it", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    expect(dropped).toContain("editor.command");
    expect(contents).not.toContain("function command(");
    const overloads = readFileSync(
      resolve(import.meta.dir, "..", "src", "editor-overloads.d.ts"),
      "utf8",
    );
    expect(overloads).toMatch(/function command<const Q extends EditorCommandQuery/);
  });

  test("emits the ui toolkit and the prefs surface, schema group included", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain("  namespace ui {");
    expect(contents).toContain("  namespace prefs {");
    expect(contents).toContain("    namespace schema {");
    expect(contents).toContain("    namespace COLOR {");
    expect(contents).toContain("    namespace SCOPE {");
    expect(dropped).not.toContain("editor.ui.label");
    expect(dropped).not.toContain("editor.prefs.get");
  });

  test("brands the component handle so a builder and show_dialog share one type", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain(
      'function button(props: Record<string | number, unknown>): Opaque<"component">;',
    );
    expect(contents).toContain('function show_dialog(dialog: Opaque<"component">)');
  });

  test("recovers the reserved-name prefs.schema.enum through an export alias", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain("      function _enum(");
    expect(contents).toContain("      export { _enum as enum };");
  });

  // The expectation is production's own skip list, not a second copy of the
  // fixture: every element the emit leaves behind must be one a rule withholds.
  // Dropping a prefix from the list while the emitter still cannot express its
  // members would leave them silently missing, and reds here.
  test("every fixture element reaches the emit except the ones a skip rule withholds", () => {
    const entry = editorEntry();
    const { contents } = generateModuleDeclaration(entry);
    const withheld = (name: string): boolean => {
      const local = name.startsWith("editor.") ? name.slice("editor.".length) : name;
      return EDITOR_SKIP_FUNCTIONS.some((rule) =>
        rule.endsWith(".") ? local.startsWith(rule) : local === rule,
      );
    };
    const unexpressed = unexpressedFixtureNames(entry.doc, contents);
    expect(unexpressed.filter((name) => !withheld(name))).toEqual([]);
    expect(unexpressed.length).toBeGreaterThan(0);
    for (const reached of [
      "editor.ui.button",
      "editor.ui.show_dialog",
      "editor.ui.COLOR.TEXT",
      "editor.prefs.get",
      "editor.prefs.SCOPE.PROJECT",
      "editor.prefs.schema.integer",
      "editor.prefs.schema.enum",
    ]) {
      expect(unexpressed).not.toContain(reached);
    }
  });

  test("leaves the editor-VM libraries that share the fixture to their own manifest", () => {
    const { contents, dropped } = generateModuleDeclaration(editorEntry());
    for (const name of ["function pprint(", "namespace http", "namespace json", "namespace zip"]) {
      expect(contents).not.toContain(name);
    }
    expect(dropped).toContain("pprint");
    expect(dropped).toContain("http.request");
    expect(dropped).toContain("json.decode");
  });

  test("maps the editor handle tokens to opaque types and repairs the mangled array token", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toMatch(/function set\([^)]*\): Opaque<"transaction_step">;/);
    expect(contents).toContain('function transact(txs: Opaque<"transaction_step">[]): void;');
    expect(contents).not.toContain('"transaction_step["');
    expect(contents).not.toContain("transaction_step[;");
  });

  test("emits a documented vararg as a rest parameter under its own name", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain(
      "function bob(options?: Record<string | number, unknown>, ...commands: string[]): void;",
    );
    expect(contents).not.toContain("arg1");
  });

  // TS1266 forbids a positional parameter after a rest, so `editor.execute`'s
  // trailing options table has to fold into the rest's element union.
  test("folds a parameter trailing a vararg into the rest element union", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    expect(contents).toContain(
      "function execute(command: string, " +
        "...args: (string | { reload_resources?: boolean; out?: string; err?: string })[]" +
        "): undefined | string;",
    );
  });

  test("every editor.tx.* builder returns a transaction step", () => {
    const { contents } = generateModuleDeclaration(editorEntry());
    const opened = contents.slice(contents.indexOf("namespace tx {"));
    const body = opened.slice(0, opened.indexOf("\n    }"));
    const returns = [...body.matchAll(/^ *function (\w+)\([^\n]*\): ([^;\n]+);$/gm)].map(
      ([, name, type]) => [name, type] as const,
    );
    expect(returns.length).toBeGreaterThan(1);
    expect(returns.map(([, type]) => type)).toEqual(
      returns.map(() => 'Opaque<"transaction_step">'),
    );
    expect(returns.map(([name]) => name)).toContain("add");
  });

  // The rest-parameter rule only fires on a `...`-prefixed ref-doc parameter
  // name, and no committed runtime doc declares one — so it provably cannot move
  // any runtime namespace's emitted surface. Read from the shipped manifests, so
  // a future runtime doc introducing a vararg reds this instead of silently
  // reshaping a signature.
  test("no committed runtime module doc declares a vararg parameter", () => {
    const offenders: string[] = [];
    for (const entry of [...MODULE_MANIFEST, ...VERSIONED_MODULE_MANIFEST]) {
      for (const fn of parseDefoldApiDoc(entry.doc).functions) {
        for (const param of fn.parameters) {
          if (param.name.startsWith("...")) offenders.push(`${fn.name}(${param.name})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test.each(
    KIND_MODULE_MANIFEST.filter((e) => e.kind !== "editor-script").map((e) => [e.kind]),
  )("%s: the runtime kind index never imports the editor namespace", (kind) => {
    expect(generateKindIndex(kind)).not.toContain('import "../editor";');
  });
});

describe("editor manifests derived from the declaring target", () => {
  const defaultTarget = () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default target");
    return target;
  };
  const declared = (predicate: (outFile: string) => boolean) =>
    (defaultTarget().editorModules ?? []).filter((m) => predicate(m.outFile));

  test("the editor entry reproduces the declaring target's own declaration", () => {
    const registry = declared((outFile) => !outFile.startsWith("editor-vm/"));
    expect(
      EDITOR_MODULE_MANIFEST.map((entry) => ({
        namespace: entry.namespace,
        outFile: entry.outFile,
        skipFunctions: entry.skipFunctions,
      })),
    ).toEqual(
      registry.map((module) => ({
        namespace: module.namespace,
        outFile: module.outFile,
        skipFunctions: module.skipFunctions,
      })),
    );
    expect(EDITOR_MODULE_MANIFEST.map((entry) => entry.namespace)).toEqual(["editor"]);
    // The named `mapType` selector survives the derivation: without it every
    // editor handle token falls back to `unknown` and the branded chain breaks.
    for (const entry of EDITOR_MODULE_MANIFEST) {
      expect(entry.mapType?.("command")).toBe('Opaque<"command">');
      expect(entry.mapType?.("transaction_step[")).toBe('Opaque<"transaction_step">[]');
    }
  });

  test("each editor VM entry keeps its own imports-from and skip rules", () => {
    const registry = declared((outFile) => outFile.startsWith("editor-vm/"));
    expect(
      EDITOR_VM_MODULE_MANIFEST.map((entry) => ({
        namespace: entry.namespace,
        outFile: entry.outFile,
        importsFrom: entry.importsFrom,
        skipFunctions: entry.skipFunctions,
      })),
    ).toEqual(
      registry.map((module) => ({
        namespace: module.namespace,
        outFile: module.outFile,
        // A VM module sits one directory deeper than the runtime surface, so it
        // cannot ride the target's own `coreTypesImport`.
        importsFrom: "../../src/core-types",
        skipFunctions: module.skipFunctions,
      })),
    );
    for (const entry of EDITOR_VM_MODULE_MANIFEST) {
      expect(entry.mapType?.("any[")).toBe("unknown[]");
    }
  });

  test("EDITOR_SKIP_FUNCTIONS is the declaring target's own editor skip list", () => {
    const [module] = declared((outFile) => !outFile.startsWith("editor-vm/"));
    expect([...EDITOR_SKIP_FUNCTIONS]).toEqual([...(module?.skipFunctions ?? [])]);
    expect(EDITOR_SKIP_FUNCTIONS).toContain("command");
  });
});

describe("per-target editor surface", () => {
  const element = (name: string) => ({
    type: "FUNCTION",
    name,
    brief: "",
    description: "",
    parameters: [],
    returnvalues: [],
  });

  // Two non-default targets that differ only in whether they declare an editor
  // document, so every assertion below turns on the declaration alone.
  const syntheticRegistry = (): { registryPath: string; root: string } => {
    const root = mkdtempSync(resolve(tmpdir(), "editor-targets-"));
    const doc = (namespace: string) =>
      JSON.stringify({
        info: { namespace, brief: "b", description: "d" },
        elements: [element(`${namespace}.ping`)],
      });
    writeFileSync(resolve(root, "label_doc.json"), doc("label"));
    writeFileSync(resolve(root, "editor_doc.json"), doc("editor"));
    writeFileSync(resolve(root, "editor_zip_doc.json"), doc("zip"));
    const base = (id: string) => ({
      id,
      default: false,
      fixturesDir: ".",
      generatedDir: `generated/versions/${id}`,
      coreTypesImport: "../../../src/core-types",
      source: null,
      modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
    });
    const registryPath = resolve(root, "api-targets.json");
    writeFileSync(
      registryPath,
      JSON.stringify({
        targets: [
          {
            ...base("current"),
            default: true,
            generatedDir: "generated",
            coreTypesImport: "../src/core-types",
          },
          {
            ...base("declaring"),
            editorModules: [
              {
                namespace: "editor",
                fixture: "editor_doc.json",
                outFile: "editor.d.ts",
                mapType: "editor",
              },
              {
                namespace: "zip",
                fixture: "editor_zip_doc.json",
                outFile: "editor-vm/zip.d.ts",
                mapType: "editor",
              },
            ],
          },
          base("silent"),
        ],
      }),
    );
    return { registryPath, root };
  };

  const targetsOf = () => {
    const { registryPath, root } = syntheticRegistry();
    const targets = loadApiTargets(registryPath, root);
    const byId = (id: string) => {
      const target = targets.find((t) => t.id === id);
      if (!target) throw new Error(`no ${id} target`);
      return target;
    };
    return { targets, root, byId };
  };

  test("a declaring target contributes its editor entries to the versioned manifest", () => {
    const { targets, root } = targetsOf();
    const versioned = versionedModuleManifest(targets, root);
    expect(
      versioned
        .filter((entry) => entry.versionId === "declaring")
        .map((entry) => [entry.outFile, entry.editor === true] as const),
    ).toEqual([
      ["label.d.ts", false],
      ["editor.d.ts", true],
      ["editor-vm/zip.d.ts", true],
    ]);
  });

  test("a target declaring no editor document contributes no editor entry", () => {
    const { targets, root } = targetsOf();
    const versioned = versionedModuleManifest(targets, root);
    expect(versioned.filter((entry) => entry.versionId === "silent").map((e) => e.outFile)).toEqual(
      ["label.d.ts"],
    );
    expect(versioned.some((entry) => entry.versionId === "current")).toBe(false);
  });

  test("the editor surface stays out of a version's runtime aggregate index", () => {
    const { targets, root } = targetsOf();
    const versioned = versionedModuleManifest(targets, root);
    expect(generateVersionIndex("declaring", versioned)).toBe('import "./label";\n\nexport {};\n');
  });

  test("the editor-script kind index names the declaring target's own editor modules", () => {
    const { byId } = targetsOf();
    const index = generateKindIndex("editor-script", byId("declaring"));
    expect([...index.matchAll(/^import "([^"]+)";$/gm)].map((m) => m[1])).toEqual([
      "../editor",
      "../editor-vm/zip",
      // Four levels out of `generated/versions/<id>/kinds/`, where the default
      // target's own index needs two — the pin is a real retarget, not a copy.
      "../../../../src/editor-overloads",
      "../../../../src/editor-vm-globals",
    ]);
    expect(index).not.toContain("../editor-vm/http");
  });

  test("a target declaring no editor document cannot produce an editor-script index", () => {
    const { byId } = targetsOf();
    expect(() => generateKindIndex("editor-script", byId("silent"))).toThrow(
      /silent.*no editor document/,
    );
  });

  test("only a declaring target's kind manifest carries the editor kind", () => {
    const { byId } = targetsOf();
    expect(targetKindManifest(byId("declaring")).map((entry) => entry.kind)).toEqual([
      ...RUNTIME_KIND_MANIFEST.map((entry) => entry.kind),
      "editor-script",
    ]);
    expect(targetKindManifest(byId("silent")).map((entry) => entry.kind)).toEqual(
      RUNTIME_KIND_MANIFEST.map((entry) => entry.kind),
    );
  });
});

describe("versioned regen drift guard", () => {
  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.namespace}`, entry] as const,
    ),
  )("%s: committed versioned file matches a fresh pipeline run byte-for-byte", async (_label, entry) => {
    const { contents: fresh } = generateModuleDeclaration(entry);
    const path = resolve(GENERATED, "versions", entry.versionId, entry.outFile);
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(
        `versions/${entry.versionId}/${entry.outFile} is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });

  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.outFile}`, entry] as const,
    ),
  )("%s: committed versioned file is syntactically-valid TypeScript", async (_label, entry) => {
    const path = resolve(GENERATED, "versions", entry.versionId, entry.outFile);
    const content = await Bun.file(path).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test.each([
    ...new Set(VERSIONED_MODULE_MANIFEST.map((entry) => entry.versionId)),
  ])("%s: committed per-version index.d.ts matches a fresh generateVersionIndex", async (versionId) => {
    const fresh = generateVersionIndex(versionId);
    const path = resolve(GENERATED, "versions", versionId, "index.d.ts");
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(
        `versions/${versionId}/index.d.ts is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });
});

describe("per-kind regen drift guard", () => {
  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: committed generated/kinds file matches a fresh generateKindIndex", async (kind, _entry) => {
    const fresh = generateKindIndex(kind);
    const path = resolve(GENERATED, "kinds", `${kind}.d.ts`);
    const committed = await Bun.file(path).text();
    if (committed !== fresh) {
      throw new Error(`kinds/${kind}.d.ts is stale — run \`bun run regen\` in \`packages/types/\``);
    }
    expect(committed).toBe(fresh);
  });
});

describe("per-kind factory re-export", () => {
  // The manifest entry is the single source of truth for which factory a kind
  // ships and where it comes from; a test-local table would let the two drift.
  const factoryModule = (entry: KindManifestEntry): string =>
    entry.factoryFrom ?? "../../src/lifecycle";
  const ALL_FACTORIES = KIND_MODULE_MANIFEST.map((entry) => entry.factory);

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: generateKindIndex re-exports its factory exactly once, from its own module", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    const names = [entry.factory, ...(entry.extraExports ?? [])].join(", ");
    const reexport = `export { ${names} } from "${factoryModule(entry)}";`;
    expect(fresh).toContain(reexport);
    expect(fresh.split(reexport).length - 1).toBe(1);
    expect(fresh).not.toContain("export {};");
  });

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: script-property helper types ride only the kinds that have script properties", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    if (entry.propertyTypes === false) {
      expect(fresh).not.toContain("ScriptProperty");
      return;
    }
    expect(fresh).toContain(
      `export { ${entry.factory} } from "${factoryModule(entry)}";\n` +
        `export type { ScriptProperties, ScriptProperty } from "${factoryModule(entry)}";`,
    );
  });

  test.each(
    KIND_MODULE_MANIFEST.map((entry) => [entry.kind, entry] as const),
  )("%s: generateKindIndex re-exports no other kind's factory", (_kind, entry) => {
    const fresh = generateKindIndex(entry.kind);
    for (const other of ALL_FACTORIES) {
      if (other === entry.factory) continue;
      expect(fresh).not.toContain(other);
    }
  });
});

describe("editor VM module emit", () => {
  // The upstream elements no lane can express, per module. Every list is empty
  // today: the nested pass reaches variables and two-level segments, so nothing
  // falls out of the emit for want of a shape. Growing one means a new upstream
  // shape started falling out unnoticed — that, not a shrink, is the signal now.
  const EMITTER_GAP: Readonly<Record<string, readonly string[]>> = {
    http: [],
    image: [],
    json: [],
    localization: [],
    zip: [],
    zlib: [],
    "tilemap.tiles": [],
  };

  // The members withheld from the emit on purpose. Two causes. The functions are
  // ones the fixture's positional parameter model describes in a way TypeScript
  // cannot render soundly: optionals sitting before a required argument, and
  // returns upstream records as empty while its own prose names a value. The
  // constant tables are ones whose emitted form would be `unknown` — a VARIABLE
  // carries no `types`, and its brief is an unreliable literal (upstream's
  // `zip.ON_CONFLICT.OVERWRITE` reads `"skip"`) — so the hand-authored form in
  // `src/editor-vm-globals.d.ts`, which `ZipPackOptions` actually types against,
  // stays authoritative. Kept apart from EMITTER_GAP so the two causes stay
  // distinguishable: a deliberate skip going missing is a different defect from
  // a new upstream shape falling out.
  const DELIBERATE_SKIP: Readonly<Record<string, readonly string[]>> = {
    http: ["http.server.local_url", "http.server.port", "http.server.route", "http.server.url"],
    image: [],
    json: ["json.decode", "json.encode"],
    localization: [],
    zip: [
      "zip.METHOD.DEFLATED",
      "zip.METHOD.STORED",
      "zip.ON_CONFLICT.ERROR",
      "zip.ON_CONFLICT.OVERWRITE",
      "zip.ON_CONFLICT.SKIP",
      "zip.pack",
      "zip.unpack",
    ],
    zlib: [],
    "tilemap.tiles": [],
  };

  test("the manifest covers exactly the namespace-shaped editor VM libraries", () => {
    expect(EDITOR_VM_MODULE_MANIFEST.map((entry) => entry.namespace).sort()).toEqual(
      Object.keys(EMITTER_GAP).sort(),
    );
    expect(Object.keys(DELIBERATE_SKIP).sort()).toEqual(Object.keys(EMITTER_GAP).sort());
  });

  test.each(
    EDITOR_VM_MODULE_MANIFEST.map((entry) => [entry.namespace, entry] as const),
  )("%s: exactly the pinned functions are withheld from the emit", (namespace, entry) => {
    expect(generateModuleDeclaration(entry).dropped.sort()).toEqual([
      ...(DELIBERATE_SKIP[namespace] ?? []),
    ]);
  });

  test.each(
    EDITOR_VM_MODULE_MANIFEST.map((entry) => [entry.namespace, entry] as const),
  )("%s: every fixture element reaches the emit except the pinned unexpressible ones", (namespace, entry) => {
    const { contents } = generateModuleDeclaration(entry);
    expect(unexpressedFixtureNames(entry.doc, contents)).toEqual(
      [...(EMITTER_GAP[namespace] ?? []), ...(DELIBERATE_SKIP[namespace] ?? [])].sort(),
    );
  });

  test("each module lands under its own subdirectory path, dots flattened", () => {
    for (const entry of EDITOR_VM_MODULE_MANIFEST) {
      expect(entry.outFile).toBe(`editor-vm/${entry.namespace.replace(/\./g, "_")}.d.ts`);
    }
  });

  test("tilemap.tiles emits as a dotted namespace and recovers its reserved-name member", () => {
    const entry = EDITOR_VM_MODULE_MANIFEST.find((e) => e.namespace === "tilemap.tiles");
    if (!entry) throw new Error("tilemap.tiles editor VM manifest entry missing");
    const { contents } = generateModuleDeclaration(entry);
    expect(contents).toContain("namespace tilemap.tiles {");
    expect(contents).toContain("export { _new as new };");
  });

  test("no editor VM module rides the runtime or universal surface", () => {
    const outFiles = new Set(EDITOR_VM_MODULE_MANIFEST.map((entry) => entry.outFile));
    for (const entry of MODULE_MANIFEST) expect(outFiles.has(entry.outFile)).toBe(false);
    const namespaces = new Set(EDITOR_VM_MODULE_MANIFEST.map((entry) => entry.namespace));
    for (const entry of MODULE_MANIFEST) {
      // `http` and `json` exist on both surfaces; the editor VM copies must not
      // be the ones a runtime kind resolves.
      if (!namespaces.has(entry.namespace)) continue;
      expect(entry.outFile).not.toContain("editor-vm/");
    }
  });
});

describe("editor-script kind index", () => {
  const importPaths = (index: string): string[] =>
    [...index.matchAll(/^import "([^"]+)";$/gm)].map((match) => match[1] as string);

  test("imports the editor namespace and nothing any runtime kind index imports", () => {
    const runtime = new Set(
      KIND_MODULE_MANIFEST.filter((entry) => entry.only === undefined).flatMap((entry) =>
        importPaths(generateKindIndex(entry.kind)),
      ),
    );
    expect(runtime.size).toBeGreaterThan(0);
    expect(runtime.has("../editor")).toBe(false);

    // The overload and hand-authored global files ride alongside the emitted
    // namespaces: they are what make `editor.command`, `pprint` and the `zip`
    // constant tables resolve at all, since an `only` kind takes none of
    // UNIVERSAL_EXTRA_IMPORTS.
    const editor = importPaths(generateKindIndex("editor-script"));
    expect(editor).toEqual([
      "../editor",
      ...EDITOR_VM_MODULE_MANIFEST.map((entry) => `../${entry.outFile.replace(/\.d\.ts$/, "")}`),
      "../../src/editor-overloads",
      "../../src/editor-vm-globals",
    ]);
    for (const path of editor) expect(runtime.has(path)).toBe(false);
  });

  test("every editor VM module is reachable from the editor-script index and no other kind", () => {
    const editor = new Set(importPaths(generateKindIndex("editor-script")));
    for (const entry of EDITOR_VM_MODULE_MANIFEST) {
      const path = `../${entry.outFile.replace(/\.d\.ts$/, "")}`;
      expect(editor.has(path)).toBe(true);
      for (const other of KIND_MODULE_MANIFEST) {
        if (other.kind === "editor-script") continue;
        expect(importPaths(generateKindIndex(other.kind))).not.toContain(path);
      }
    }
  });

  test("re-exports both editor factories and none of the runtime lifecycle surface", () => {
    const fresh = generateKindIndex("editor-script");
    expect(fresh).toContain(
      'export { defineEditorScript, defineEditorCommand } from "../../src/editor";',
    );
    expect(fresh).toContain(
      'export type { EditorCommandQuery, EditorNode } from "../../src/editor";',
    );
    for (const name of [
      "ScriptProperty",
      "defineScript",
      "defineGuiScript",
      "defineRenderScript",
    ]) {
      expect(fresh).not.toContain(name);
    }
  });

  test("references the Lua 5.1 stdlib without the LuaJIT-only surface", () => {
    const fresh = generateKindIndex("editor-script");
    expect(fresh).toContain('/// <reference types="lua-types/5.1" />');
    expect(fresh).not.toContain("jit-only");
  });
});

describe("regen drift guard — builtin messages", () => {
  test("committed builtin-messages.d.ts matches a fresh pipeline run byte-for-byte", async () => {
    const fresh = generateBuiltinMessagesDeclaration(MESSAGES_MANIFEST);
    const committed = await Bun.file(resolve(GENERATED, MESSAGES_MANIFEST.outFile)).text();
    if (committed !== fresh) {
      throw new Error(
        `${MESSAGES_MANIFEST.outFile} is stale — run \`bun run regen\` in \`packages/types/\``,
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed builtin-messages.d.ts is syntactically-valid TypeScript", async () => {
    const content = await Bun.file(resolve(GENERATED, MESSAGES_MANIFEST.outFile)).text();
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(content)).not.toThrow();
  });

  test("MESSAGES_MANIFEST entry has a committed generated file", () => {
    const path = resolve(GENERATED, MESSAGES_MANIFEST.outFile);
    expect(Bun.file(path).size > 0).toBe(true);
  });
});

describe("nil-return union absorption guard", () => {
  // A ref-doc `nil` return alternative that once fell through to the generic
  // `unknown` fallback produced the absorbing `T | unknown` union, erasing `T`.
  // Any callable signature line (it carries the `): ` return separator) must be
  // free of that fragment. Standalone `unknown` and the `Record<string | number,
  // unknown>` opaque-table shape carry no ` | unknown` substring, so they stay
  // allowed without an allowlist.
  const absorbingUnionLines = (contents: string): string[] =>
    contents.split("\n").filter((line) => line.includes("): ") && line.includes(" | unknown"));

  test.each(
    MODULE_MANIFEST.map((entry) => [entry.namespace, entry] as const),
  )("%s: current generated signatures carry no nil-absorbing ` | unknown` fragment", (_namespace, entry) => {
    const { contents } = generateModuleDeclaration(entry);
    expect(absorbingUnionLines(contents)).toEqual([]);
  });

  test.each(
    VERSIONED_MODULE_MANIFEST.map(
      (entry) => [`${entry.versionId}/${entry.namespace}`, entry] as const,
    ),
  )("%s: committed-version generated signatures carry no nil-absorbing ` | unknown` fragment", (_label, entry) => {
    const { contents } = generateModuleDeclaration(entry);
    expect(absorbingUnionLines(contents)).toEqual([]);
  });

  test("the guard predicate leaves standalone unknown and Record<..., unknown> untouched", () => {
    expect(absorbingUnionLines("  function f(): unknown;")).toEqual([]);
    expect(absorbingUnionLines("  function g(): Record<string | number, unknown>;")).toEqual([]);
    expect(absorbingUnionLines("  function h(): number | unknown;")).toEqual([
      "  function h(): number | unknown;",
    ]);
  });
});
