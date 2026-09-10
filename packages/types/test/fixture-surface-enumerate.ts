import * as ts from "typescript";

export type DeclaredKind = "function" | "value" | "type" | "interface" | "enum";

export interface DeclaredSymbol {
  kind: DeclaredKind;
}

/**
 * AST-based enumeration of every declared symbol in a `.d.ts` surface, keyed by
 * its full dotted namespace path. Unlike the regex line-walker in
 * `doc-surface-extract.ts`, this tracks namespace frames through the real AST, so
 * interface/type bodies never corrupt the frame stack and type aliases,
 * interfaces, and enums are captured alongside functions and values. The
 * `declare global { ... }` augmentation wrapper contributes no name segment.
 */
export function enumerateDeclaredSymbols(
  source: string,
  fileName = "surface.d.ts",
): Map<string, DeclaredSymbol> {
  const out = new Map<string, DeclaredSymbol>();
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const stack: string[] = [];

  const record = (name: string, kind: DeclaredKind): void => {
    const key = [...stack, name].join(".");
    if (!out.has(key)) out.set(key, { kind });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node)) {
      const isGlobalAugmentation = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
      const named = ts.isIdentifier(node.name) && !isGlobalAugmentation;
      if (named) stack.push(node.name.text);
      if (node.body) visit(node.body);
      if (named) stack.pop();
      return;
    }
    if (ts.isModuleBlock(node)) {
      for (const stmt of node.statements) visit(stmt);
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      if (node.name) record(node.name.text, "function");
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) record(decl.name.text, "value");
      }
      return;
    }
    if (ts.isTypeAliasDeclaration(node)) {
      record(node.name.text, "type");
      return;
    }
    if (ts.isInterfaceDeclaration(node)) {
      record(node.name.text, "interface");
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      record(node.name.text, "enum");
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return out;
}

/**
 * The parameter names the lifecycle hook `hookName` declares, unioned across
 * every interface that declares a method of that name. Unlike
 * {@link enumerateDeclaredParameters} this reaches method signatures rather than
 * `declare function`s, because the script hooks are members of an interface
 * rather than free functions.
 */
export function scriptHookParameters(
  source: string,
  hookName: string,
  fileName = "lifecycle.ts",
): string[] {
  const names: string[] = [];
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const visit = (node: ts.Node): void => {
    if (
      (ts.isMethodSignature(node) || ts.isMethodDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === hookName
    ) {
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name) && !names.includes(parameter.name.text)) {
          names.push(parameter.name.text);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

/**
 * The parameter names each declared function accepts, keyed by full dotted
 * namespace path. Same namespace-frame walk as {@link enumerateDeclaredSymbols},
 * but overloads **merge** rather than first-wins: a slot declared on only one
 * signature of an overload set still counts as declared.
 */
export function enumerateDeclaredParameters(
  source: string,
  fileName = "surface.d.ts",
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const stack: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node)) {
      const isGlobalAugmentation = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
      const named = ts.isIdentifier(node.name) && !isGlobalAugmentation;
      if (named) stack.push(node.name.text);
      if (node.body) visit(node.body);
      if (named) stack.pop();
      return;
    }
    if (ts.isModuleBlock(node)) {
      for (const stmt of node.statements) visit(stmt);
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      if (node.name) {
        const key = [...stack, node.name.text].join(".");
        const names = out.get(key) ?? new Set<string>();
        for (const parameter of node.parameters) {
          if (ts.isIdentifier(parameter.name)) names.add(parameter.name.text);
        }
        out.set(key, names);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return out;
}

export interface DeclaredParameterSlot {
  /** The slot is omissible at every declaration that names it. */
  readonly optional: boolean;
  /** The slot's emitted type annotation, without the `?`. */
  readonly typeText: string;
  /** The sorted, deduplicated file names of the declaration copies that make the slot required. */
  readonly requiredIn: readonly string[];
}

/**
 * Every declared function parameter with the emitted optionality a caller sees,
 * keyed by full dotted namespace path. Where
 * {@link enumerateDeclaredParameters} answers only whether a slot is declared,
 * this answers whether it can be omitted — the `?` form and an `| undefined`
 * member of the annotation are both omissible, and they are the two shapes the
 * emitter writes.
 *
 * Overloads merge conservatively: a slot counts omissible only when *every*
 * signature that names it makes it so, so one widened overload cannot vouch for
 * a sibling that stayed required. The same rule merges declaration copies across
 * files in {@link mergeDeclaredParameterSlots}. A reserved-name recovery
 * (`function _new(); export { _new as new }`) is recorded under both the
 * emitted and the aliased name.
 */
export function enumerateDeclaredParameterSlots(
  source: string,
  fileName = "surface.d.ts",
): Map<string, Map<string, DeclaredParameterSlot>> {
  const out = new Map<string, Map<string, DeclaredParameterSlot>>();
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const stack: string[] = [];
  const aliases: { readonly prefix: string; readonly from: string; readonly to: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node)) {
      const isGlobalAugmentation = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
      const named = ts.isIdentifier(node.name) && !isGlobalAugmentation;
      if (named) stack.push(node.name.text);
      if (node.body) visit(node.body);
      if (named) stack.pop();
      return;
    }
    if (ts.isModuleBlock(node)) {
      for (const stmt of node.statements) visit(stmt);
      return;
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        if (element.propertyName) {
          aliases.push({
            prefix: stack.join("."),
            from: element.propertyName.text,
            to: element.name.text,
          });
        }
      }
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      if (!node.name) return;
      const key = [...stack, node.name.text].join(".");
      const slots = out.get(key) ?? new Map<string, DeclaredParameterSlot>();
      for (const parameter of node.parameters) {
        if (!ts.isIdentifier(parameter.name)) continue;
        const typeText = parameter.type ? parameter.type.getText() : "any";
        const optional =
          parameter.questionToken !== undefined ||
          (parameter.type !== undefined && annotationAdmitsUndefined(parameter.type));
        const slot: DeclaredParameterSlot = {
          optional,
          typeText,
          requiredIn: optional ? [] : [fileName],
        };
        const previous = slots.get(parameter.name.text);
        slots.set(parameter.name.text, previous ? mergeParameterSlot(previous, slot) : slot);
      }
      out.set(key, slots);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const alias of aliases) {
    const from = alias.prefix ? `${alias.prefix}.${alias.from}` : alias.from;
    const to = alias.prefix ? `${alias.prefix}.${alias.to}` : alias.to;
    const slots = out.get(from);
    if (slots && !out.has(to)) out.set(to, slots);
  }

  return out;
}

/**
 * Folds the slot maps of several declaration copies into one, keyed by fqn and
 * parameter name, under the rule {@link enumerateDeclaredParameterSlots} applies
 * to overloads: a slot counts omissible only when every copy that names it does,
 * whatever order the copies arrive in. A name only one copy declares is kept.
 * The inputs are never mutated, because the alias pass shares one slot map
 * between two fqns.
 */
export function mergeDeclaredParameterSlots(
  surfaces: Iterable<Map<string, Map<string, DeclaredParameterSlot>>>,
): Map<string, Map<string, DeclaredParameterSlot>> {
  const out = new Map<string, Map<string, DeclaredParameterSlot>>();
  for (const surface of surfaces) {
    for (const [fqn, slots] of surface) {
      const merged = out.get(fqn) ?? new Map<string, DeclaredParameterSlot>();
      for (const [name, slot] of slots) {
        const previous = merged.get(name);
        merged.set(name, previous ? mergeParameterSlot(previous, slot) : slot);
      }
      out.set(fqn, merged);
    }
  }
  return out;
}

function mergeParameterSlot(
  previous: DeclaredParameterSlot,
  next: DeclaredParameterSlot,
): DeclaredParameterSlot {
  return {
    optional: previous.optional && next.optional,
    typeText:
      previous.typeText === next.typeText
        ? previous.typeText
        : `${previous.typeText} | ${next.typeText}`,
    requiredIn: [...new Set([...previous.requiredIn, ...next.requiredIn])].sort(),
  };
}

// A top-level `undefined` member of the annotation. Nested inside a table type
// or a generic argument it says nothing about the slot itself, so only union
// members at depth zero count.
function annotationAdmitsUndefined(type: ts.TypeNode): boolean {
  if (type.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isUnionTypeNode(type)) return type.types.some(annotationAdmitsUndefined);
  if (ts.isParenthesizedTypeNode(type)) return annotationAdmitsUndefined(type.type);
  return false;
}
