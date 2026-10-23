import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const NATIVE_EXPECTATIONS_DIR = join(import.meta.dir, "..", "expectations", "native");

export interface NativeExpectation {
  registry: { sourceId: string; manifestDir: string };
  resolve: { archiveUrl: string; confirmedManifest: string; misplacedManifest: string };
  receiverEmit?: { reason: string; consumer: string[] };
}

type JsonObject = Record<string, unknown>;

export function readNativeExpectations(
  dir: string = NATIVE_EXPECTATIONS_DIR,
): ReadonlyMap<string, NativeExpectation> {
  const expectations = new Map<string, NativeExpectation>();
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    expectations.set(
      basename(file, ".json"),
      parseNativeExpectation(file, JSON.parse(readFileSync(join(dir, file), "utf8"))),
    );
  }
  return expectations;
}

function parseNativeExpectation(file: string, raw: unknown): NativeExpectation {
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`);
  };
  const object = (value: unknown, path: string, keys: readonly string[]): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(`${path || "the file"} must be a JSON object`);
    }
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) fail(`unknown field ${path ? `${path}.${key}` : key}`);
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

  const root = object(raw, "", ["registry", "resolve", "receiverEmit"]);
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
  if (root.receiverEmit !== undefined) {
    const receiverEmit = object(root.receiverEmit, "receiverEmit", ["reason", "consumer"]);
    const consumer = receiverEmit.consumer;
    if (
      !Array.isArray(consumer) ||
      consumer.length === 0 ||
      !consumer.every((line) => typeof line === "string")
    ) {
      fail("receiverEmit.consumer must be a non-empty array of strings");
    }
    expectation.receiverEmit = {
      reason: text(receiverEmit, "receiverEmit", "reason"),
      consumer: consumer as string[],
    };
  }
  return expectation;
}
