import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type LibraryLane,
  readLibraryExpectations,
  readNativeExpectations,
} from "./target-expectations";

const VALID = {
  registry: { sourceId: "defold-a", manifestDir: "a" },
  resolve: {
    archiveUrl: "https://github.com/someone/defold-a/archive/refs/tags/v1.0.0.zip",
    confirmedManifest: "defold-a-1.0.0/a/ext.manifest",
    misplacedManifest: "defold-a-1.0.0/ext.manifest",
  },
  receiverEmit: { reason: "methods read self from slot 1", consumer: ["a.run();"] },
  pinKind: "commit" as const,
  page: { shapes: { Grid: ["Grid.find_path", "Grid.is_walkable"] }, symbols: ["a.CONSTANT"] },
};

function withFiles(files: Record<string, unknown>, run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "native-expectations-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withField(path: readonly string[], value: unknown, base: object = VALID): unknown {
  const copy = structuredClone(base) as Record<string, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1] as string;
  if (value === undefined) {
    delete node[last];
  } else {
    node[last] = value;
  }
  return copy;
}

describe("readNativeExpectations", () => {
  test("keys each expectation by its file name and returns its registry, resolve, receiverEmit, pinKind and page", () => {
    withFiles({ "a.json": VALID }, (dir) => {
      const expectations = readNativeExpectations(dir);
      expect([...expectations.keys()]).toEqual(["a"]);
      expect(expectations.get("a")).toEqual(VALID);
    });
  });

  test("an expectation without receiverEmit, pinKind or page carries none of them", () => {
    const bare = withField(
      ["page"],
      undefined,
      withField(["pinKind"], undefined, withField(["receiverEmit"], undefined) as object) as object,
    );
    withFiles({ "a.json": bare }, (dir) => {
      const expectation = readNativeExpectations(dir).get("a");
      expect(expectation?.registry).toEqual(VALID.registry);
      expect(Object.keys(expectation ?? {}).sort()).toEqual(["registry", "resolve"]);
    });
  });

  test("a page may record shapes alone or symbols alone", () => {
    for (const page of [{ shapes: VALID.page.shapes }, { symbols: VALID.page.symbols }]) {
      withFiles({ "a.json": withField(["page"], page) }, (dir) => {
        expect(readNativeExpectations(dir).get("a")?.page).toEqual(page);
      });
    }
  });

  test("a pinKind other than commit throws naming the file", () => {
    for (const value of ["release", "", 1]) {
      withFiles({ "a.json": withField(["pinKind"], value) }, (dir) => {
        expect(() => readNativeExpectations(dir)).toThrow(/a\.json.*pinKind/);
      });
    }
  });

  test("an empty or blank shape list, an empty shape map, symbol list or page throws naming the file", () => {
    for (const [path, value] of [
      [["page", "shapes", "Grid"], []],
      [["page", "shapes", "Grid"], [""]],
      [["page", "shapes"], {}],
      [["page", "symbols"], []],
      [["page"], {}],
    ] as const) {
      withFiles({ "a.json": withField(path, value) }, (dir) => {
        expect(() => readNativeExpectations(dir)).toThrow(/a\.json/);
        expect(() => readNativeExpectations(dir)).toThrow(path.join("."));
      });
    }
  });

  const requiredStrings = [
    ["registry", "sourceId"],
    ["registry", "manifestDir"],
    ["resolve", "archiveUrl"],
    ["resolve", "confirmedManifest"],
    ["resolve", "misplacedManifest"],
  ] as const;

  for (const path of requiredStrings) {
    test(`a missing or blank ${path.join(".")} throws naming the file`, () => {
      for (const value of [undefined, "", "  "]) {
        withFiles({ "a.json": withField(path, value) }, (dir) => {
          expect(() => readNativeExpectations(dir)).toThrow(/a\.json/);
          expect(() => readNativeExpectations(dir)).toThrow(path.join("."));
        });
      }
    });
  }

  test("a receiverEmit with an empty consumer throws naming the file", () => {
    withFiles({ "a.json": withField(["receiverEmit", "consumer"], []) }, (dir) => {
      expect(() => readNativeExpectations(dir)).toThrow(/a\.json.*receiverEmit\.consumer/);
    });
  });

  test("an unknown field at any level throws naming the file and the field", () => {
    for (const path of [
      ["recieverEmit"],
      ["registry", "namespace"],
      ["resolve", "archiveURL"],
      ["receiverEmit", "consumers"],
      ["page", "shape"],
    ]) {
      withFiles({ "a.json": withField(path, "x") }, (dir) => {
        expect(() => readNativeExpectations(dir)).toThrow(/a\.json/);
        expect(() => readNativeExpectations(dir)).toThrow(path.join("."));
      });
    }
  });

  test("a file that is not a JSON object throws naming the file", () => {
    withFiles({ "a.json": "[]" }, (dir) => {
      expect(() => readNativeExpectations(dir)).toThrow(/a\.json/);
    });
  });
});

const LIBRARY_VALID = {
  provenance: {
    authorUrl: "https://github.com/someone/defold-a",
    authoredHere: true,
    commit: "0123456789abcdef0123456789abcdef01234567",
    sourceUrl: "https://github.com/someone/defold-a/tree/0123456789abcdef0123456789abcdef01234567",
    license: "MIT",
    importString: 'import * as a from "a.a"',
    pinKind: "commit" as const,
  },
};

const LANES: readonly LibraryLane[] = ["luals", "authored", "script-api"];

function withLaneFiles(
  lanes: Partial<Record<LibraryLane, Record<string, unknown>>>,
  run: (root: string) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), "library-expectations-"));
  try {
    for (const [lane, files] of Object.entries(lanes)) {
      const dir = join(root, "expectations", lane);
      mkdirSync(dir, { recursive: true });
      for (const [name, body] of Object.entries(files ?? {})) {
        writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
      }
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("readLibraryExpectations", () => {
  test("reads only its own lane's files, keyed by file name", () => {
    for (const lane of LANES) {
      const others = Object.fromEntries(
        LANES.filter((other) => other !== lane).map((other) => [
          other,
          { [`${other}-only.json`]: LIBRARY_VALID },
        ]),
      );
      withLaneFiles({ ...others, [lane]: { "b.json": LIBRARY_VALID } }, (root) => {
        const expectations = readLibraryExpectations(root, lane);
        expect([...expectations.keys()]).toEqual(["b"]);
        expect(expectations.get("b")).toEqual(LIBRARY_VALID);
      });
    }
  });

  test("a provenance recording only authorUrl carries no other field", () => {
    const authorOnly = { provenance: { authorUrl: LIBRARY_VALID.provenance.authorUrl } };
    withLaneFiles({ luals: { "b.json": authorOnly } }, (root) => {
      expect(readLibraryExpectations(root, "luals").get("b")).toEqual(authorOnly);
    });
  });

  test("a missing or blank authorUrl throws naming the file", () => {
    for (const value of [undefined, "", "  "]) {
      const body = withField(["provenance", "authorUrl"], value, LIBRARY_VALID);
      withLaneFiles({ authored: { "b.json": body } }, (root) => {
        expect(() => readLibraryExpectations(root, "authored")).toThrow(/b\.json/);
        expect(() => readLibraryExpectations(root, "authored")).toThrow("provenance.authorUrl");
      });
    }
  });

  test("an unknown field at any level throws naming the file and the field", () => {
    for (const path of [["source"], ["provenance", "author"]]) {
      const body = withField(path, "x", LIBRARY_VALID);
      withLaneFiles({ "script-api": { "b.json": body } }, (root) => {
        expect(() => readLibraryExpectations(root, "script-api")).toThrow(/b\.json/);
        expect(() => readLibraryExpectations(root, "script-api")).toThrow(path.join("."));
      });
    }
  });

  test("a mistyped recorded field throws naming the file and the field", () => {
    for (const [field, value] of [
      ["authoredHere", "true"],
      ["commit", ""],
      ["sourceUrl", 1],
      ["license", " "],
      ["importString", ""],
      ["pinKind", "release"],
    ] as const) {
      const body = withField(["provenance", field], value, LIBRARY_VALID);
      withLaneFiles({ luals: { "b.json": body } }, (root) => {
        expect(() => readLibraryExpectations(root, "luals")).toThrow(/b\.json/);
        expect(() => readLibraryExpectations(root, "luals")).toThrow(`provenance.${field}`);
      });
    }
  });

  test("a file without a provenance object throws naming the file", () => {
    for (const body of ["[]", {}, { provenance: [] }]) {
      withLaneFiles({ luals: { "b.json": body } }, (root) => {
        expect(() => readLibraryExpectations(root, "luals")).toThrow(/b\.json/);
      });
    }
  });

  const receiverEmit = {
    reason: "instance methods take `:`, a module-table function `.`",
    consumer: ['import * as a from "a.a";', "", "a.f();"],
  };

  test("an authored expectation returns its receiverEmit reason and consumer lines", () => {
    withLaneFiles({ authored: { "b.json": { ...LIBRARY_VALID, receiverEmit } } }, (root) => {
      expect(readLibraryExpectations(root, "authored").get("b")?.receiverEmit).toEqual(
        receiverEmit,
      );
    });
  });

  test("an authored expectation without receiverEmit carries none", () => {
    withLaneFiles({ authored: { "b.json": LIBRARY_VALID } }, (root) => {
      expect(readLibraryExpectations(root, "authored").get("b")).not.toHaveProperty("receiverEmit");
    });
  });

  test("a receiverEmit on a lane no receiver loop reads throws naming the file", () => {
    for (const lane of ["luals", "script-api"] as const) {
      withLaneFiles({ [lane]: { "b.json": { ...LIBRARY_VALID, receiverEmit } } }, (root) => {
        expect(() => readLibraryExpectations(root, lane)).toThrow(/b\.json/);
        expect(() => readLibraryExpectations(root, lane)).toThrow(
          "receiverEmit is read only on the authored lane",
        );
      });
    }
  });

  test("a receiverEmit with an empty consumer or a blank reason throws naming the file", () => {
    for (const bad of [
      { ...receiverEmit, consumer: [] },
      { ...receiverEmit, reason: " " },
    ]) {
      withLaneFiles({ authored: { "b.json": { ...LIBRARY_VALID, receiverEmit: bad } } }, (root) => {
        expect(() => readLibraryExpectations(root, "authored")).toThrow(/b\.json/);
        expect(() => readLibraryExpectations(root, "authored")).toThrow("receiverEmit");
      });
    }
  });
});
