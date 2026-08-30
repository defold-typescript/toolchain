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

const DECLARATION_REL = path.join(MATERIALIZED_ROOT, "scene-addresses.d.ts");

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

function captureStdout(): {
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  out: () => string;
} {
  const chunks: Buffer[] = [];
  const sink = (collect: Buffer[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk, _enc, cb) {
        collect.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });
  const discarded: Buffer[] = [];
  return {
    io: { stdout: sink(chunks), stderr: sink(discarded) },
    out: () => Buffer.concat(chunks).toString("utf8"),
  };
}

async function run(...args: string[]): Promise<{ code: number; json: () => unknown }> {
  const { io, out } = captureStdout();
  const code = await dispatch([...args, cwd], io);
  return { code, json: () => JSON.parse(out().trim()) };
}

function scaffoldProject(): void {
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

describe("scene-types verb", () => {
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

  test("the build output bob writes is not read back as project scenes", async () => {
    scaffoldProject();
    write(
      "build/default/game/_generated_0.go",
      'components {\n  id: "ghost"\n  component: "/x.script"\n}\n',
    );

    await run("scene-types");

    expect(readFileSync(path.join(cwd, DECLARATION_REL), "utf8")).not.toContain('"#ghost"');
  });
});
