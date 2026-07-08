import { readFileSync } from "node:fs";
import * as path from "node:path";
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

// Matches `component: "/path"` in a standalone `.go` and the escaped
// `component: \"/path\"` form inside a collection's `embedded_instances`
// `data:` string. The path holds no quote or backslash.
const COMPONENT_REF_RE = /component:\s*\\?"([^"\\]+)/g;

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
    for (const match of content.matchAll(COMPONENT_REF_RE)) {
      const refPath = match[1];
      if (refPath === undefined) {
        continue;
      }
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
