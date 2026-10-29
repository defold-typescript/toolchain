import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { LIBRARY_TYPES_ROOT } from "./package-root";

export const NATIVE_EXPECTATIONS_DIR = join(LIBRARY_TYPES_ROOT, "expectations", "native");

/** A consumer whose transpiled Lua is snapshotted beside the shipped declaration, so
 * each call's `.` or `:` receiver is the one upstream defines. */
export interface ReceiverEmit {
  reason: string;
  consumer: string[];
}

export interface NativeExpectation {
  registry: { sourceId: string; manifestDir: string };
  resolve: { archiveUrl: string; confirmedManifest: string; misplacedManifest: string };
  receiverEmit?: ReceiverEmit;
  pinKind?: "commit";
  page?: { shapes?: Record<string, string[]>; symbols?: string[] };
}

export type LibraryLane = "luals" | "authored" | "script-api";

export interface LibraryExpectation {
  provenance: {
    authorUrl: string;
    authoredHere?: boolean;
    commit?: string;
    sourceUrl?: string;
    license?: string;
    importString?: string;
    pinKind?: "commit";
  };
  /** Read only on the authored lane, the one lane with a receiver loop
   * (`authored-receiver-emit.test.ts`). */
  receiverEmit?: ReceiverEmit;
}

type JsonObject = Record<string, unknown>;

export function readNativeExpectations(
  dir: string = NATIVE_EXPECTATIONS_DIR,
): ReadonlyMap<string, NativeExpectation> {
  return readExpectationDir(dir, parseNativeExpectation);
}

export function readLibraryExpectations(
  libraryTypesDir: string,
  lane: LibraryLane,
): ReadonlyMap<string, LibraryExpectation> {
  return readExpectationDir(join(libraryTypesDir, "expectations", lane), (file, raw) =>
    parseLibraryExpectation(file, raw, lane),
  );
}

function readExpectationDir<T>(
  dir: string,
  parse: (file: string, raw: unknown) => T,
): ReadonlyMap<string, T> {
  const expectations = new Map<string, T>();
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    expectations.set(
      basename(file, ".json"),
      parse(file, JSON.parse(readFileSync(join(dir, file), "utf8"))),
    );
  }
  return expectations;
}

function fieldReader(file: string) {
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`);
  };
  const object = (value: unknown, path: string, keys?: readonly string[]): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(`${path || "the file"} must be a JSON object`);
    }
    if (keys) {
      for (const key of Object.keys(value)) {
        if (!keys.includes(key)) fail(`unknown field ${path ? `${path}.${key}` : key}`);
      }
    }
    return value as JsonObject;
  };
  const text = (parent: JsonObject, path: string, key: string): string => {
    const value = parent[key];
    if (typeof value !== "string" || value.trim() === "") {
      return fail(`${path}.${key} must be a non-blank string`);
    }
    return value;
  };
  const texts = (value: unknown, path: string, { blankLines = false } = {}): string[] => {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((line) => typeof line === "string" && (blankLines || line.trim() !== ""))
    ) {
      fail(`${path} must be a non-empty array of ${blankLines ? "" : "non-blank "}strings`);
    }
    return value as string[];
  };
  const commitPin = (parent: JsonObject, path: string): "commit" => {
    if (parent.pinKind !== "commit") fail(`${path ? `${path}.` : ""}pinKind must be "commit"`);
    return "commit";
  };
  const receiverEmit = (value: unknown): ReceiverEmit => {
    const parent = object(value, "receiverEmit", ["reason", "consumer"]);
    return {
      reason: text(parent, "receiverEmit", "reason"),
      consumer: texts(parent.consumer, "receiverEmit.consumer", { blankLines: true }),
    };
  };
  return { fail, object, text, texts, commitPin, receiverEmit };
}

function parseNativeExpectation(file: string, raw: unknown): NativeExpectation {
  const { object, text, commitPin, receiverEmit } = fieldReader(file);
  const root = object(raw, "", ["registry", "resolve", "receiverEmit", "pinKind", "page"]);
  const registry = object(root.registry, "registry", ["sourceId", "manifestDir"]);
  const resolve = object(root.resolve, "resolve", [
    "archiveUrl",
    "confirmedManifest",
    "misplacedManifest",
  ]);
  const expectation: NativeExpectation = {
    registry: {
      sourceId: text(registry, "registry", "sourceId"),
      manifestDir: text(registry, "registry", "manifestDir"),
    },
    resolve: {
      archiveUrl: text(resolve, "resolve", "archiveUrl"),
      confirmedManifest: text(resolve, "resolve", "confirmedManifest"),
      misplacedManifest: text(resolve, "resolve", "misplacedManifest"),
    },
  };
  if (root.receiverEmit !== undefined) expectation.receiverEmit = receiverEmit(root.receiverEmit);
  if (root.pinKind !== undefined) expectation.pinKind = commitPin(root, "");
  if (root.page !== undefined) expectation.page = parseNativePage(file, root.page);
  return expectation;
}

function parseNativePage(file: string, raw: unknown): NonNullable<NativeExpectation["page"]> {
  const { fail, object, texts } = fieldReader(file);
  const page = object(raw, "page", ["shapes", "symbols"]);
  if (page.shapes === undefined && page.symbols === undefined) {
    fail("page must record shapes or symbols");
  }
  const parsed: NonNullable<NativeExpectation["page"]> = {};
  if (page.shapes !== undefined) {
    const shapes = object(page.shapes, "page.shapes");
    if (Object.keys(shapes).length === 0) fail("page.shapes must name at least one shape");
    parsed.shapes = Object.fromEntries(
      Object.entries(shapes).map(([label, names]) => [label, texts(names, `page.shapes.${label}`)]),
    );
  }
  if (page.symbols !== undefined) parsed.symbols = texts(page.symbols, "page.symbols");
  return parsed;
}

function parseLibraryExpectation(
  file: string,
  raw: unknown,
  lane: LibraryLane,
): LibraryExpectation {
  const { fail, object, text, commitPin, receiverEmit } = fieldReader(file);
  const root = object(raw, "", ["provenance", "receiverEmit"]);
  const provenance = object(root.provenance, "provenance", [
    "authorUrl",
    "authoredHere",
    "commit",
    "sourceUrl",
    "license",
    "importString",
    "pinKind",
  ]);
  const expectation: LibraryExpectation = {
    provenance: { authorUrl: text(provenance, "provenance", "authorUrl") },
  };
  if (provenance.authoredHere !== undefined) {
    if (typeof provenance.authoredHere !== "boolean") {
      fail("provenance.authoredHere must be a boolean");
    }
    expectation.provenance.authoredHere = provenance.authoredHere as boolean;
  }
  for (const key of ["commit", "sourceUrl", "license", "importString"] as const) {
    if (provenance[key] !== undefined) {
      expectation.provenance[key] = text(provenance, "provenance", key);
    }
  }
  if (provenance.pinKind !== undefined) {
    expectation.provenance.pinKind = commitPin(provenance, "provenance");
  }
  if (root.receiverEmit !== undefined) {
    if (lane !== "authored") fail("receiverEmit is read only on the authored lane");
    expectation.receiverEmit = receiverEmit(root.receiverEmit);
  }
  return expectation;
}
