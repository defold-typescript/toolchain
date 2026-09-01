import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import * as ts from "typescript";
import { dispatch } from "./dispatch";
import { MATERIALIZED_ROOT } from "./materialize";
import {
  createIncompleteReporter,
  runSceneTypes,
  SCENE_ADDRESSES_DECLARATION,
  sceneIndexForBuild,
} from "./scene-types-command";
import {
  scaffoldUnresolvedDependency,
  scaffoldUnresolvedDependencyManifest,
  UNRESOLVED_DEPENDENCY_URL,
} from "./unresolved-dependency-fixture";

// The value production reports, not a re-derivation of it: `path.join` here
// would yield a backslash on Windows and disagree with the POSIX path the
// command actually emits.
const DECLARATION_REL = SCENE_ADDRESSES_DECLARATION;

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-scene-types-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function write(rel: string, contents: string): void {
  const target = path.join(cwd, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function captureStreams(): {
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  out: () => string;
  err: () => string;
} {
  const chunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  const sink = (collect: Buffer[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk, _enc, cb) {
        collect.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });
  return {
    io: { stdout: sink(chunks), stderr: sink(errChunks) },
    out: () => Buffer.concat(chunks).toString("utf8"),
    err: () => Buffer.concat(errChunks).toString("utf8"),
  };
}

async function run(
  ...args: string[]
): Promise<{ code: number; out: string; err: string; json: () => unknown }> {
  const { io, out, err } = captureStreams();
  const code = await dispatch([...args, cwd], io);
  return { code, out: out(), err: err(), json: () => JSON.parse(out().trim()) };
}

function scaffoldProject(): void {
  // A real `game.project` names the *compiled* boot collection, which is what
  // decides whose paths are offered bare.
  write(
    "game.project",
    "[project]\ntitle = demo\n\n[bootstrap]\nmain_collection = /game/game.collectionc\n",
  );
  write(
    "game/game.collection",
    'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
  );
  write(
    "game/player.collection",
    'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n',
  );
  write(
    "game/player.go",
    'components {\n  id: "controller"\n  component: "/game/player.script"\n}\n',
  );
}

// The generated declaration compiled beside the interfaces it augments, plus a
// probe that names an id. `keyof` is the assertion: the aliases end in
// `(string & {})`, so assignability to them proves nothing.
function probeDiagnostics(probe: string): readonly ts.Diagnostic[] {
  const files: Record<string, string> = {
    "scene-addresses.d.ts": readFileSync(
      path.join(import.meta.dir, "../../types/src/scene-addresses.d.ts"),
      "utf8",
    ),
    "generated.d.ts": readFileSync(path.join(cwd, DECLARATION_REL), "utf8"),
    "probe.ts": probe,
  };
  const host: ts.CompilerHost = {
    fileExists: (fileName) => files[fileName] !== undefined,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (fileName) => {
      const content = files[fileName];
      return content === undefined
        ? undefined
        : ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false);
    },
    readFile: (fileName) => files[fileName],
    useCaseSensitiveFileNames: () => true,
    writeFile() {},
  };
  const program = ts.createProgram(Object.keys(files), { noLib: true, strict: true }, host);
  return [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()];
}

// What this suite proves: the declaration's content (through the checker), that
// an unchanged re-run leaves the file's mtime alone, that a scene edit rewrites
// it, the `--json` envelope, the empty-project case, and that `build/` output is
// not read back as project scenes.
//
// Atomic replacement is not among them. Every assertion below reads the
// destination after the verb returns, so swapping `writeIfChanged`'s staged
// write + `renameSync` for a direct `writeFileSync(target, contents)` leaves all
// of it green. That the write lands through a temp file is checked by reading
// the writer, not by this suite.
describe("scene-types verb", () => {
  // The declaration path is reported verbatim in `--json` and on stdout, so it
  // has to be the same string on every OS. `path.join` would make it
  // `.defold-types\scene-addresses.d.ts` on Windows.
  test("reports the declaration path POSIX-style on every platform", () => {
    expect(SCENE_ADDRESSES_DECLARATION).not.toContain("\\");
    expect(SCENE_ADDRESSES_DECLARATION.split("/")).toEqual([
      MATERIALIZED_ROOT,
      "scene-addresses.d.ts",
    ]);
  });

  test("writes the declaration where the project's types live, and the ids reach keyof", async () => {
    scaffoldProject();

    const { code } = await run("scene-types");

    expect(code).toBe(0);
    expect(existsSync(path.join(cwd, DECLARATION_REL))).toBe(true);
    expect(
      probeDiagnostics(
        'const object: keyof SceneGameObjectAddresses = "/player/player";\n' +
          'const component: keyof SceneComponentAddresses = "#controller";\n' +
          "export { object, component };\n",
      ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    ).toEqual([]);
  });

  test("a re-run over unchanged scenes leaves the file untouched", async () => {
    scaffoldProject();
    await run("scene-types");
    const first = statSync(path.join(cwd, DECLARATION_REL)).mtimeMs;

    await run("scene-types");

    expect(statSync(path.join(cwd, DECLARATION_REL)).mtimeMs).toBe(first);
  });

  test("editing a scene rewrites the declaration", async () => {
    scaffoldProject();
    await run("scene-types");
    write(
      "game/player.collection",
      'instances {\n  id: "hero"\n  prototype: "/game/player.go"\n}\n',
    );

    const { json } = await run("scene-types", "--json");

    expect(json()).toMatchObject({ ok: true, written: [DECLARATION_REL] });
    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).toContain('"/player/hero"');
  });

  test("--json reports the declaration path and whether a write happened", async () => {
    scaffoldProject();

    const first = await run("scene-types", "--json");
    expect(first.json()).toMatchObject({
      command: "scene-types",
      ok: true,
      declaration: DECLARATION_REL,
      written: [DECLARATION_REL],
    });

    const second = await run("scene-types", "--json");
    expect(second.json()).toMatchObject({
      command: "scene-types",
      ok: true,
      declaration: DECLARATION_REL,
      written: [],
    });
  });

  test("a project with no scenes still succeeds, and both interfaces stay empty", async () => {
    const { code } = await run("scene-types");

    expect(code).toBe(0);
    expect(
      probeDiagnostics(
        "type AssertNever<T extends never> = T;\n" +
          "type Objects = AssertNever<keyof SceneGameObjectAddresses>;\n" +
          "type Components = AssertNever<keyof SceneComponentAddresses>;\n" +
          "export type { Objects, Components };\n",
      ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    ).toEqual([]);
  });

  test("a resolved dependency's scenes reach the declaration at their merged path", async () => {
    const url = "https://github.com/Insality/druid/archive/refs/tags/16.zip";
    scaffoldProject();
    write(
      "game.project",
      `[project]\ntitle = demo\ndependencies#0 = ${url}\n\n[bootstrap]\nmain_collection = /game/game.collectionc\n`,
    );
    write(
      "game/game.collection",
      'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n' +
        'collection_instances {\n  id: "ui"\n  collection: "/druid/druid.collection"\n}\n',
    );
    write(
      `${MATERIALIZED_ROOT}/dependencies/dependencies.json`,
      JSON.stringify({ dependencies: [{ key: "druid-16", url }] }),
    );
    write(
      `${MATERIALIZED_ROOT}/dependencies/druid-16/druid/druid.collection`,
      'instances {\n  id: "root"\n  prototype: "/druid/druid.go"\n}\n',
    );

    const { code, err } = await run("scene-types");

    expect(code).toBe(0);
    // A whole universe reports nothing: the warning has to fire on a real hole
    // rather than on every project that declares a dependency at all.
    expect(err).toBe("");
    expect(
      probeDiagnostics(
        'const object: keyof SceneGameObjectAddresses = "/ui/root";\nexport { object };\n',
      ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    ).toEqual([]);
  });

  test("an unresolved dependency is named on stderr, and the declaration is still written", async () => {
    scaffoldUnresolvedDependency(cwd);

    const { code, err } = await run("scene-types");

    expect(code).toBe(0);
    expect(err).toContain("defold-typescript scene-types:");
    expect(err).toContain(UNRESOLVED_DEPENDENCY_URL);
    // The project's own scenes still reach the declaration: a partial universe
    // is a warning, never a refusal to write.
    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).toContain('"/player/player"');
  });

  test("--json carries the same reasons on the warnings channel", async () => {
    scaffoldUnresolvedDependency(cwd);

    const { code, json, err } = await run("scene-types", "--json");

    expect(code).toBe(0);
    expect(err).toBe("");
    const parsed = json() as { ok: boolean; warnings?: readonly string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings?.some((warning) => warning.includes(UNRESOLVED_DEPENDENCY_URL))).toBe(
      true,
    );
  });

  test("build reports the holes beside its own warnings", async () => {
    scaffoldUnresolvedDependency(cwd);
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");

    const { code, err } = await run("build");

    expect(code).toBe(0);
    expect(err).toContain("defold-typescript build:");
    expect(err).toContain(UNRESOLVED_DEPENDENCY_URL);
  });

  test("the build output bob writes is not read back as project scenes", async () => {
    scaffoldProject();
    write(
      "build/default/game/_generated_0.go",
      'components {\n  id: "ghost"\n  component: "/x.script"\n}\n',
    );

    await run("scene-types");

    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).not.toContain('"#ghost"');
  });

  test("a proxied collection's objects are offered under its socket, never bare", async () => {
    scaffoldProject();
    write(
      "game/loader.go",
      'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
        '  data: "collection: \\"/levels/level1.collection\\"\\n"\n}\n',
    );
    write(
      "game/game.collection",
      'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n' +
        'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n',
    );
    write(
      "levels/level1.collection",
      'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/game/player.go"\n}\n',
    );

    const { code } = await run("scene-types");

    expect(code).toBe(0);
    const declaration = readFileSync(path.join(cwd, DECLARATION_REL), "utf8");
    expect(declaration).toContain('"mylevel:/enemy"');
    expect(declaration).not.toContain('"/enemy"');
    expect(
      probeDiagnostics(
        'const qualified: keyof SceneGameObjectAddresses = "mylevel:/enemy";\nexport { qualified };\n',
      ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    ).toEqual([]);
  });

  test("a standalone .collectionproxy is read as its own document", async () => {
    scaffoldProject();
    write(
      "game/loader.go",
      'components {\n  id: "loader"\n  component: "/levels/level1.collectionproxy"\n}\n',
    );
    write(
      "game/game.collection",
      'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n' +
        'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n',
    );
    write("levels/level1.collectionproxy", 'collection: "/levels/level1.collection"\n');
    write(
      "levels/level1.collection",
      'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/game/player.go"\n}\n',
    );

    await run("scene-types");

    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).toContain('"mylevel:/enemy"');
  });

  test("a project with no game.project offers no bare address and names the hole", async () => {
    scaffoldProject();
    rmSync(path.join(cwd, "game.project"));

    const { err } = await run("scene-types");

    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).not.toContain('"/player/player"');
    expect(err).toContain("game.project");
  });
});

describe("sceneIndexForBuild", () => {
  test("a scene-less project whose walk failed still yields an index", () => {
    scaffoldUnresolvedDependencyManifest(cwd);

    const index = sceneIndexForBuild(runSceneTypes({ cwd }));

    expect(index).toBeDefined();
    expect(index?.incomplete.some((reason) => reason.includes(UNRESOLVED_DEPENDENCY_URL))).toBe(
      true,
    );
  });
});

// `watch` regenerates on every scene save, so a project that never resolves its
// dependencies would otherwise repeat the same reason on every keystroke.
describe("createIncompleteReporter", () => {
  test("reports a reason once and stays quiet while it persists", () => {
    const report = createIncompleteReporter();
    const reasons = ["druid.zip: is declared by game.project but was not materialized"];

    expect(report(reasons)).toEqual(reasons);
    expect(report(reasons)).toEqual([]);
  });

  test("a newly-appearing reason is reported beside the ones already seen", () => {
    const report = createIncompleteReporter();
    report(["first"]);

    expect(report(["first", "second"])).toEqual(["second"]);
  });

  test("a reason that goes away and comes back is reported again", () => {
    const report = createIncompleteReporter();
    report(["first"]);
    report([]);

    expect(report(["first"])).toEqual(["first"]);
  });
});
