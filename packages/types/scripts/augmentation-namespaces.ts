// Not published: this module imports the devDependency `typescript`, while
// `scripts/` otherwise ships and is loaded from the installed package. It takes
// every value it classifies against as a parameter, so it needs no runtime name
// from `./regen` and a test can vary the restriction it checks.
import * as ts from "typescript";

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

// The functions a namespace body declares, qualified the way a script calls
// them. An `export { _delete as delete }` alias adds the name it exports.
function pushNamespaceFunctions(
  statements: readonly ts.Statement[],
  prefix: string,
  names: string[],
): void {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      names.push(`${prefix}${statement.name.text}`);
    } else if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) {
      pushModuleFunctions(statement, prefix, names);
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.propertyName !== undefined) names.push(`${prefix}${element.name.text}`);
      }
    }
  }
}

function pushModuleFunctions(
  declaration: ts.ModuleDeclaration,
  prefix: string,
  names: string[],
): void {
  const qualified = `${prefix}${declaration.name.text}.`;
  const body = declaration.body;
  if (body === undefined) return;
  // `namespace a.b {}` parses as `a` holding `b`.
  if (ts.isModuleDeclaration(body)) {
    pushModuleFunctions(body, qualified, names);
  } else if (ts.isModuleBlock(body)) {
    pushNamespaceFunctions(body.statements, qualified, names);
  }
}

// The functions one `.d.ts` puts in global scope, as `<namespace>.<name>` (bare
// for a global function), read from the same global scope `globalNamespacesIn`
// reads.
export function globalFunctionsIn(path: string, contents: string): string[] {
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);
  const isModule = ts.isExternalModule(source);
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isModuleDeclaration(statement) || ts.isStringLiteral(statement.name)) continue;
    if ((statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
      if (statement.body !== undefined && ts.isModuleBlock(statement.body)) {
        pushNamespaceFunctions(statement.body.statements, "", names);
      }
      continue;
    }
    if (!isModule) pushModuleFunctions(statement, "", names);
  }
  return [...new Set(names)];
}

// Cross-reference the functions each augmentation declares against the
// functions that need a game-object instance. A file declaring one must carry
// the `requiresGoInstance` marker, so it rides no render-script index. A marked
// file must declare exactly the functions its marker lists, one of them at
// least in the manifest, so dropping the file strips only those functions and a
// marker never strips a file the render script could use.
export function goInstanceMarkerViolations(
  files: { path: string; contents: string }[],
  marked: Readonly<Record<string, readonly string[]>>,
  needsGoInstance: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const name = file.path.replace(/\.d\.ts$/, "");
    const declared = globalFunctionsIn(file.path, file.contents);
    const needing = declared.filter((fn) => needsGoInstance.has(fn));
    const listed = Object.hasOwn(marked, name) ? marked[name] : undefined;
    if (listed === undefined) {
      for (const fn of needing) {
        violations.push(
          `src augmentation "${name}" declares ${fn}, which needs a game object, but carries no requiresGoInstance`,
        );
      }
      continue;
    }
    if (needing.length === 0) {
      violations.push(
        `src augmentation "${name}" carries requiresGoInstance but declares no function that needs a game object`,
      );
    }
    for (const fn of declared.filter((fn) => !listed.includes(fn))) {
      violations.push(
        `src augmentation "${name}" declares ${fn}, which its requiresGoInstance does not list, so render scripts would lose it`,
      );
    }
    for (const fn of listed.filter((fn) => !declared.includes(fn))) {
      violations.push(
        `src augmentation "${name}" lists ${fn} in requiresGoInstance but does not declare it`,
      );
    }
  }
  return violations;
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
  files: { path: string; contents: string }[],
  restricted: Readonly<Record<string, string>>,
  namespaces: Readonly<Record<string, string>>,
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const name = file.path.replace(/\.d\.ts$/, "");
    const reopened = globalNamespacesIn(file.path, file.contents).filter((ns) =>
      Object.hasOwn(namespaces, ns),
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
