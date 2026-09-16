// Not published: this module imports the devDependency `typescript`, while
// `scripts/` otherwise ships and is loaded from the installed package.
import * as ts from "typescript";
import { loadSrcAugmentations, RESTRICTED_NAMESPACES, RESTRICTED_SRC_AUGMENTATIONS } from "./regen";

// The namespaces one `.d.ts` puts in global scope. Read by syntax rather than
// by text, so the spelling an augmentation uses — `declare global` at any
// indentation, or a top-level `declare namespace` in a script file — does not
// decide whether the scoping guard can see it.
export function globalNamespacesIn(path: string, contents: string): string[] {
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);
  const isModule = ts.isExternalModule(source);
  const names: string[] = [];

  const pushBlockMembers = (block: ts.ModuleBlock): void => {
    for (const statement of block.statements) {
      if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) {
        names.push(statement.name.text);
      }
    }
  };

  for (const statement of source.statements) {
    if (!ts.isModuleDeclaration(statement)) continue;
    // `declare module "some-package"` declares an external module; its members
    // live in that module, not in global scope.
    if (ts.isStringLiteral(statement.name)) continue;
    if ((statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
      if (statement.body !== undefined && ts.isModuleBlock(statement.body)) {
        pushBlockMembers(statement.body);
      }
      continue;
    }
    // A module file's own top-level namespace is module-local, not an
    // augmentation of the global one.
    if (!isModule) names.push(statement.name.text);
  }

  return [...new Set(names)];
}

// Cross-reference what each augmentation actually re-opens against the
// `restrictedTo` markers `UNIVERSAL_EXTRA_IMPORTS` declares, in both
// directions: a file re-opening a kind-restricted namespace must carry the
// marker, and a marker must name a namespace its file really re-opens.
//
// Scope: the `src/*` augmentations in `SRC_AUGMENTATION_MODULES` only. The
// generated modules are already filtered by `RESTRICTED_NAMESPACES` inside
// `generateKindIndex`, and an `only` kind's `extraModules` take no part in the
// universal set.
export function srcAugmentationScopingViolations(
  files: { path: string; contents: string }[] = loadSrcAugmentations(),
  restricted: Readonly<Record<string, string>> = RESTRICTED_SRC_AUGMENTATIONS,
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const name = file.path.replace(/\.d\.ts$/, "");
    const reopened = globalNamespacesIn(file.path, file.contents).filter((ns) =>
      Object.hasOwn(RESTRICTED_NAMESPACES, ns),
    );
    const declared = restricted[name];
    for (const ns of reopened) {
      if (declared !== ns) {
        violations.push(
          `src augmentation "${name}" re-opens restricted namespace "${ns}" but declares no matching restrictedTo`,
        );
      }
    }
    if (declared !== undefined && !reopened.includes(declared)) {
      violations.push(
        `src augmentation "${name}" declares restrictedTo "${declared}" but re-opens no such namespace`,
      );
    }
  }
  return violations;
}
