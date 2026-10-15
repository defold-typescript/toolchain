import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type BindingExtraction,
  type InstanceCheck,
  readBindingsForTarget,
} from "./engine-binding-extract";
import type { ApiTarget } from "./regen";
import { vendoredTargets } from "./sync-engine-bindings";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

export const GO_INSTANCE_FUNCTIONS_FILE = "go-instance-functions.json";

export type GoInstanceFunctions = Record<string, InstanceCheck[]>;

export function goInstanceFunctionsPath(
  target: ApiTarget,
  packageRoot: string = PACKAGE_ROOT,
): string {
  return resolve(packageRoot, target.fixturesDir, GO_INSTANCE_FUNCTIONS_FILE);
}

// Keyed `<namespace>.<name>`. A name bound in several files (one per physics
// backend) lists only the checks every binding reaches, so no build that
// accepts the call has it walled.
export function goInstanceFunctions(extraction: BindingExtraction): GoInstanceFunctions {
  const byName = new Map<string, InstanceCheck[][]>();
  for (const fn of extraction.functions) {
    const key = `${fn.namespace}.${fn.name}`;
    byName.set(key, [...(byName.get(key) ?? []), fn.instanceChecks ?? []]);
  }
  const manifest: GoInstanceFunctions = {};
  for (const key of [...byName.keys()].sort()) {
    const [first = [], ...rest] = byName.get(key) as InstanceCheck[][];
    const shared = first.filter((check) => rest.every((checks) => checks.includes(check)));
    if (shared.length > 0) manifest[key] = shared;
  }
  return manifest;
}

// Biome's layout: one entry per line, each short check list inline.
export function serializeGoInstanceFunctions(manifest: GoInstanceFunctions): string {
  const entries = Object.entries(manifest).map(
    ([key, checks]) =>
      `  ${JSON.stringify(key)}: [${checks.map((check) => JSON.stringify(check)).join(", ")}]`,
  );
  return entries.length === 0 ? "{}\n" : `{\n${entries.join(",\n")}\n}\n`;
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  for (const target of vendoredTargets()) {
    const manifest = goInstanceFunctions(readBindingsForTarget(target.id));
    const text = serializeGoInstanceFunctions(manifest);
    if (write) {
      const path = goInstanceFunctionsPath(target);
      writeFileSync(path, text);
      console.log(`wrote ${path} (${Object.keys(manifest).length} functions)`);
    } else {
      process.stdout.write(`${target.id}\n${text}`);
    }
  }
}
