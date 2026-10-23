import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNativeExpectations } from "./target-expectations";

const VALID = {
  registry: { sourceId: "defold-a", manifestDir: "a" },
  resolve: {
    archiveUrl: "https://github.com/someone/defold-a/archive/refs/tags/v1.0.0.zip",
    confirmedManifest: "defold-a-1.0.0/a/ext.manifest",
    misplacedManifest: "defold-a-1.0.0/ext.manifest",
  },
  receiverEmit: { reason: "methods read self from slot 1", consumer: ["a.run();"] },
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

function withField(path: readonly string[], value: unknown): unknown {
  const copy = structuredClone(VALID) as Record<string, unknown>;
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
  test("keys each expectation by its file name and returns its registry, resolve and receiverEmit", () => {
    withFiles({ "a.json": VALID }, (dir) => {
      const expectations = readNativeExpectations(dir);
      expect([...expectations.keys()]).toEqual(["a"]);
      expect(expectations.get("a")).toEqual(VALID);
    });
  });

  test("an expectation without receiverEmit carries none", () => {
    withFiles({ "a.json": withField(["receiverEmit"], undefined) }, (dir) => {
      const expectation = readNativeExpectations(dir).get("a");
      expect(expectation?.registry).toEqual(VALID.registry);
      expect(expectation && "receiverEmit" in expectation).toBe(false);
    });
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
