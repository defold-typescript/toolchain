// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type { UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import type { SceneComponentIndex } from "./scene-component-index";
import { socketOfAddress } from "./scene-naming-context";
import type { SceneObjectPathIndex } from "./scene-object-path-index";
import { canonicalHashSymbols, isAmbient, staticAddressTextOf } from "./url-address-literals";
import { addressClassOfArgument, isAddressClass } from "./url-address-slots";

export interface UrlFragmentFinding {
  readonly fileName: string;
  readonly start: number;
  readonly length: number;
  readonly fragment: string;
  readonly message: string;
}

/** The half of the joined index this check reads: which objects exist, and what each owns. */
export type SceneObjectComponents = Pick<SceneObjectPathIndex, "paths" | "componentsOf">;

// The path portion of an index key, with any proxy socket stripped: `/enemy` for
// both the bootstrap `/enemy` and the proxied `mylevel:/enemy`.
function pathOfKey(key: string): string {
  const socket = socketOfAddress(key);
  return socket === undefined ? key : key.slice(socket.length + 1);
}

// The components the object an address names declares, or `undefined` wherever
// the answer is not provable — no object index, a fragment with no path, a
// relative path, a path no world declares, or a path some world declares but
// whose prototype could not be read. Every one of those falls back to the
// project-wide id set, because withholding a finding is the only safe direction.
function declaredComponentsOf(
  objects: SceneObjectComponents | undefined,
  path: string,
): readonly string[] | undefined {
  if (objects === undefined || path === "") return undefined;

  if (socketOfAddress(path) !== undefined) {
    return objects.paths.has(path) ? objects.componentsOf.get(path) : undefined;
  }
  if (!path.startsWith("/")) return undefined;

  // A bare absolute path names one object per world, and the script writing it
  // could be running in any of them, so the union is the only claim that holds
  // whichever world it is. One withheld key withholds the whole union: a
  // readable sibling must not stand in for a prototype nobody could read.
  const declared = new Set<string>();
  let known = false;
  for (const key of objects.paths) {
    if (pathOfKey(key) !== path) continue;
    const owned = objects.componentsOf.get(key);
    if (owned === undefined) return undefined;
    known = true;
    for (const id of owned) declared.add(id);
  }
  return known ? [...declared].sort() : undefined;
}

function declaredPhrase(ids: readonly string[]): string {
  return ids.length === 0
    ? "it declares no components at all"
    : `it declares ${ids.map((id) => `"${id}"`).join(", ")}`;
}

export type UrlFragmentReport =
  | { readonly kind: "suppressed"; readonly reasons: readonly string[] }
  | { readonly kind: "checked"; readonly findings: readonly UrlFragmentFinding[] };

// Report every address-slot expression whose text is statically known — a
// quoted or backtick-quoted literal, or a value whose `Hash` type still carries
// the string it was hashed from — whose `#fragment` names a component no
// `.go`/`.collection` in the project declares. A substituted template is out
// because its fragment is only known at runtime, so no absence in the project's
// scene files can contradict it, and so is any value whose type carries no
// literal (a bare `Hash`, a `Url`, a `string`). A path is never reported:
// `factory.create` can produce a game object at any path, but it can never
// invent a component, which is what makes only the fragment decidable.
export function checkUrlFragmentReachability(input: {
  program: ts.Program;
  table: UrlParameterTable;
  index: SceneComponentIndex;
  objects?: SceneObjectComponents;
  sourceFiles?: readonly ts.SourceFile[];
}): UrlFragmentReport {
  const { program, table, index, objects, sourceFiles } = input;
  if (index.incomplete.length > 0) {
    return { kind: "suppressed", reasons: index.incomplete };
  }

  const checker = program.getTypeChecker();
  // Resolved once per call — measured at ~0.1 ms, so no laziness is warranted.
  // An empty set reports nothing from the type-directed branch and leaves inline
  // literals untouched, which is the answer for a program carrying no ambient
  // `hash` and the module's existing fail-closed posture.
  const canonical = canonicalHashSymbols(checker, program);
  const findings: UrlFragmentFinding[] = [];
  const targets = sourceFiles ?? program.getSourceFiles();

  for (const sourceFile of targets) {
    if (isAmbient(sourceFile.fileName)) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isExpression(node) && isAddressClass(addressClassOfArgument(checker, table, node))) {
        const text = staticAddressTextOf(checker, node, canonical);
        if (text !== undefined) {
          const hash = text.indexOf("#");
          const fragment = hash === -1 ? "" : text.slice(hash + 1);
          const declared =
            fragment === "" ? undefined : declaredComponentsOf(objects, text.slice(0, hash));
          const reachable =
            declared === undefined ? index.ids.has(fragment) : declared.includes(fragment);
          if (fragment !== "" && !reachable) {
            const path = text.slice(0, hash);
            findings.push({
              fileName: sourceFile.fileName,
              start: node.getStart(sourceFile),
              length: node.getWidth(sourceFile),
              fragment,
              message:
                declared === undefined
                  ? `no \`.go\` or \`.collection\` in this project declares a component with the id ` +
                    `"${fragment}", so this address cannot resolve at runtime`
                  : `the game object "${path}" declares no component with the id "${fragment}" ` +
                    `(${declaredPhrase(declared)}), so this address cannot resolve at runtime`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return { kind: "checked", findings };
}
