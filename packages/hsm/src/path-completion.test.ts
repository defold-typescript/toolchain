import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const PACKAGE_DIR = resolve(import.meta.dir, "..");
const TSCONFIG = resolve(PACKAGE_DIR, "tsconfig.json");
// TypeScript hands the host forward-slash paths on every platform, so the virtual key must match.
const CONSUMER = resolve(PACKAGE_DIR, "src", "__completion__.ts").replaceAll("\\", "/");
const CURSOR = "<cursor>";

const EVENTS = ["GO", "BACK", "STEP"];
const PLAY_CHILDREN = ["idle", "run"];
const PLAY_PATHS = PLAY_CHILDREN.map((name) => `/play/${name}`);
const ALL_PATHS = ["/menu", "/play", ...PLAY_PATHS];

interface Slots {
  readonly onTarget: string;
  readonly to: string;
  readonly after: string;
  readonly always: string;
  readonly initial: string;
  readonly onEntry: string;
  readonly matches: string;
}

const VALID: Slots = {
  onTarget: '"/play"',
  to: '"/play/run"',
  after: '"/play"',
  always: '{ to: "/play", when: (ctx) => ctx.count > 99 }',
  initial: '"/play/idle"',
  onEntry: 'BACK: "/menu"',
  matches: '"/menu"',
};

function fixture(slots: Slots): string {
  return `import { defineMachine } from "./index";

interface Ctx {
  count: number;
}

type Ev = ${EVENTS.map((type) => `{ type: "${type}" }`).join(" | ")};

const machine = defineMachine<Ctx, Ev>()({
  initial: "/menu",
  states: {
    menu: {
      on: {
        GO: ${slots.onTarget},
        STEP: { when: (ctx) => ctx.count > 0, to: ${slots.to} },
      },
      after: { 1: ${slots.after} },
      always: ${slots.always},
    },
    play: {
      initial: ${slots.initial},
      states: {
        ${PLAY_CHILDREN[0]}: {
          enter: (ctx) => {
            ctx.count += 1;
          },
          on: { ${slots.onEntry} },
        },
        ${PLAY_CHILDREN[1]}: {
          update: (ctx) => {
            ctx.count += 1;
          },
        },
      },
    },
  },
});

machine.start({ count: 0 }).matches(${slots.matches});
`;
}

function compilerOptions(): ts.CompilerOptions {
  const { config, error } = ts.readConfigFile(TSCONFIG, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const { include: _include, ...rest } = config;
  return ts.parseJsonConfigFileContent(rest, ts.sys, dirname(TSCONFIG)).options;
}

let source = "";
let version = 0;
const options = compilerOptions();
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => [CONSUMER],
  getScriptVersion: (fileName) => (fileName === CONSUMER ? String(version) : "0"),
  getScriptSnapshot: (fileName) => {
    const text = fileName === CONSUMER ? source : ts.sys.readFile(fileName);
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
  },
  getCurrentDirectory: () => PACKAGE_DIR,
  getCompilationSettings: () => options,
  getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
  fileExists: (fileName) => fileName === CONSUMER || ts.sys.fileExists(fileName),
  readFile: (fileName) => (fileName === CONSUMER ? source : ts.sys.readFile(fileName)),
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

function offered(slot: keyof Slots, withCursor: string): string[] {
  const marked = fixture({ ...VALID, [slot]: withCursor });
  const position = marked.indexOf(CURSOR);
  source = marked.replace(CURSOR, "");
  version++;
  const completions = service.getCompletionsAtPosition(CONSUMER, position, {});
  return (completions?.entries ?? []).map((entry) => entry.name).sort();
}

const sorted = (names: readonly string[]) => [...names].sort();

describe("hsm path completion", () => {
  test("the fixture compiles with every slot filled", () => {
    source = fixture(VALID);
    version++;
    const diagnostics = service.getSemanticDiagnostics(CONSUMER);
    expect(
      diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")),
    ).toEqual([]);
  });

  test("a string target under on offers the machine's paths", () => {
    expect(offered("onTarget", `"${CURSOR}"`)).toEqual(sorted(ALL_PATHS));
  });

  test("to in the object form, beside a when callback, offers the machine's paths", () => {
    expect(offered("to", `"${CURSOR}"`)).toEqual(sorted(ALL_PATHS));
  });

  test("an after target offers the machine's paths", () => {
    expect(offered("after", `"${CURSOR}"`)).toEqual(sorted(ALL_PATHS));
  });

  test("an always target offers the machine's paths", () => {
    expect(offered("always", `"${CURSOR}"`)).toEqual(sorted(ALL_PATHS));
  });

  test("a nested initial offers only that state's children", () => {
    expect(offered("initial", `"${CURSOR}"`)).toEqual(sorted(PLAY_PATHS));
  });

  test("an on key offers the event types", () => {
    expect(offered("onEntry", CURSOR)).toEqual(sorted(EVENTS));
  });

  test("matches on the started instance offers the machine's paths", () => {
    expect(offered("matches", `"${CURSOR}"`)).toEqual(sorted(ALL_PATHS));
  });
});
