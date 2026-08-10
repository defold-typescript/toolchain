import { readFileSync } from "node:fs";
import * as path from "node:path";
// `bun build --packages=external` leaves this specifier for `node` to resolve at
// runtime, out of an installed `node_modules` tree, so it must resolve to
// *compiled JavaScript*: node refuses to strip types from any file under
// `node_modules`, however self-contained that file is. `transpiler` ships built
// JS; the typings-only `types` package does not.
import {
  parseSceneTextFormat,
  type SceneMessage,
  SceneTextFormatError,
} from "@defold-typescript/transpiler";
import { scanFilesSync } from "./scan";

// A `component:` entry in a `.go`/`.collection` must reference a Defold
// *component* file. Mesh source assets (glTF/Collada) are imported *into* a
// `.model` component and referenced through it, never added as a component
// directly. The editor rejects the direct form ("Only components are allowed
// for Path"), but Bob's headless build accepts it silently and the game object
// fails at runtime — so editor and CLI disagree. Flag the mismatch at build
// time. The value is the wrapper component each source asset belongs in.
const SOURCE_ASSET_WRAPPERS = new Map<string, string>([
  [".gltf", ".model"],
  [".glb", ".model"],
  [".dae", ".model"],
]);

// `.go`/`.collection` sources live in the project tree; `build` holds Bob's
// extracted `_generated_*.go` copies, so scanning it would double-report the
// same mistake against a generated file.
const SCAN_SKIP_SEGMENTS = new Set(["node_modules", ".defold-types", ".git", "build"]);

function isSkipped(rel: string): boolean {
  return rel.split(/[/\\]/).some((segment) => SCAN_SKIP_SEGMENTS.has(segment));
}

// Every `component:` the document declares, at any message depth, plus those
// inside each `data:` payload — an `embedded_instances` `data:` is a whole
// escaped `.go`, and its own `embedded_components` escape again, so each level
// is re-parsed rather than unescaped in one greedy pass. A payload that does
// not parse contributes nothing, matching how an unreadable file is skipped.
function collectComponentRefs(message: SceneMessage, into: string[]): void {
  for (const value of message.fields.get("component") ?? []) {
    into.push(value);
  }
  for (const payload of message.fields.get("data") ?? []) {
    try {
      collectComponentRefs(parseSceneTextFormat(payload), into);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
    }
  }
  for (const nested of message.messages.values()) {
    for (const child of nested) {
      collectComponentRefs(child, into);
    }
  }
}

// Scan every `.go`/`.collection` for a `component:` that points at a mesh source
// asset instead of a wrapping component. Warn-only: this cannot be auto-fixed
// (the `.model` wrapper and its material must be authored), and the return
// shape matches `scanOrphanOutputs` so the build can merge both.
export function scanSceneResourceRefs(cwd: string): string[] {
  const warnings: string[] = [];
  const files = new Set<string>();
  for (const pattern of ["**/*.go", "**/*.collection"]) {
    try {
      for (const rel of scanFilesSync(cwd, pattern)) {
        files.add(rel);
      }
    } catch {
      // A missing/unreadable root yields no scene files, not a build failure.
    }
  }

  for (const rel of [...files].sort()) {
    if (isSkipped(rel)) {
      continue;
    }
    let content: string;
    try {
      content = readFileSync(path.join(cwd, rel), "utf8");
    } catch {
      continue;
    }
    const refs: string[] = [];
    try {
      collectComponentRefs(parseSceneTextFormat(content), refs);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      continue;
    }
    for (const refPath of refs) {
      const wrapper = SOURCE_ASSET_WRAPPERS.get(path.extname(refPath).toLowerCase());
      if (wrapper !== undefined) {
        warnings.push(
          `${rel} references source asset "${refPath}" as a component; ` +
            `wrap it in a ${wrapper} component (with a materials block) and reference that instead ` +
            `(Bob builds this silently, but the game object fails at runtime)`,
        );
      }
    }
  }

  return warnings;
}
