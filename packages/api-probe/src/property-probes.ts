import ts from "typescript";
import type { LuaKind } from "../../types/scripts/engine-binding-extract";
import {
  type DeclaredKinds,
  declaredKinds,
  surfaceProgram,
  UnmappedLuaKindError,
} from "../../types/scripts/lua-kind";
import type { ApiTarget } from "../../types/scripts/regen";
import { PROPERTY_OPTIONS, PROPERTY_TARGETS } from "./contexts";
import { PROPERTY_DENYLIST } from "./probe-denylist";
import { kindWitness, type ProbeCall, probeTarget } from "./witness";

export interface PropertyProbe {
  readonly catalog: string;
  readonly member: string;
  readonly kinds: DeclaredKinds;
  // The `PROBE_URLS` component the member is read from.
  readonly target: string;
  readonly readonly: boolean;
  readonly options?: string;
  // One value per kind a writable union member declares, each written on its own.
  readonly kindWrites?: readonly { readonly kind: LuaKind; readonly value: string }[];
}

export interface PropertyGeneration {
  readonly probes: readonly PropertyProbe[];
  readonly calls: readonly ProbeCall[];
  // `<ns>.<member>` keys the denylist skips.
  readonly denied: readonly string[];
  // Catalogs no probe component owns.
  readonly untargeted: readonly string[];
}

// Calls `visit` with each statement declared directly in a global namespace,
// under the namespace's dotted name, across every file the program loads.
export function forEachNamespaceStatement(
  program: ts.Program,
  visit: (namespace: string, statement: ts.Statement) => void,
): void {
  const walk = (statements: ts.NodeArray<ts.Statement>, prefix: string | undefined) => {
    for (const statement of statements) {
      if (!ts.isModuleDeclaration(statement)) continue;
      if (statement.flags & ts.NodeFlags.GlobalAugmentation) {
        if (statement.body && ts.isModuleBlock(statement.body))
          walk(statement.body.statements, prefix);
        continue;
      }
      if (!ts.isIdentifier(statement.name)) continue;
      let name = prefix === undefined ? statement.name.text : `${prefix}.${statement.name.text}`;
      let body = statement.body;
      while (body !== undefined && ts.isModuleDeclaration(body)) {
        name = `${name}.${body.name.text}`;
        body = body.body;
      }
      if (body === undefined || !ts.isModuleBlock(body)) continue;
      for (const inner of body.statements) visit(name, inner);
      walk(body.statements, name);
    }
  };
  for (const file of program.getSourceFiles()) {
    if (file.fileName.includes("/node_modules/")) continue;
    walk(file.statements, undefined);
  }
}

function kindsOf(type: ts.Type, checker: ts.TypeChecker): DeclaredKinds {
  try {
    return declaredKinds(type, checker);
  } catch (error) {
    if (error instanceof UnmappedLuaKindError) return "any";
    throw error;
  }
}

function isReadonly(property: ts.Symbol): boolean {
  return (property.declarations ?? []).some(
    (declaration) => (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) !== 0,
  );
}

function getter(probe: PropertyProbe): string {
  const options = probe.options === undefined ? "" : `, ${probe.options}`;
  return `go.get<${probe.catalog}.properties>()(${probe.target}, ${JSON.stringify(probe.member)}${options})`;
}

export function callsFor(probe: PropertyProbe): ProbeCall[] {
  const name = `${probe.catalog}.properties.${probe.member}`;
  const options = probe.options === undefined ? "" : `, ${probe.options}`;
  const setter = (value: string) =>
    `go.set<${probe.catalog}.properties>()(${probe.target}, ${JSON.stringify(probe.member)}, ${value}${options})`;
  const set = setter(getter(probe));
  const kindWrites: ProbeCall[] = probe.readonly
    ? []
    : (probe.kindWrites ?? []).map(({ kind, value }) => ({
        name,
        variant: `set-${kind}`,
        kind: "go",
        call: setter(value),
      }));
  return [
    {
      name,
      variant: "get",
      kind: "go",
      call: getter(probe),
      returns: { kinds: [probe.kinds], variadic: false },
    },
    {
      name,
      variant: "set",
      kind: "go",
      call: set,
      ...(probe.readonly ? { readonlySet: true } : {}),
    },
    ...kindWrites,
  ];
}

function kindWritesFor(
  key: string,
  type: ts.Type,
  kinds: DeclaredKinds,
  target: string,
  checker: ts.TypeChecker,
): PropertyProbe["kindWrites"] {
  if (kinds === "any" || kinds.length < 2) return undefined;
  return kinds.map((kind) => {
    const value = kindWitness(
      type,
      kind,
      key,
      { kind: "go", url: target },
      checker,
      new Set(),
      new Set(),
    );
    if (value === undefined) throw new Error(`no ${kind} witness for property ${key}`);
    return { kind, value };
  });
}

// Every member of every `<ns>.properties` catalog the surface declares, the
// hand-authored overlays merged in, read with `go.get` from its probe
// component and written back with `go.set`; a writable union member is also
// written once with a value of each kind it declares.
export function propertyProbes(
  target: ApiTarget = probeTarget(),
  program: ts.Program = surfaceProgram(target),
): PropertyGeneration {
  const checker = program.getTypeChecker();
  const catalogs = new Map<string, ts.Symbol>();
  forEachNamespaceStatement(program, (namespace, statement) => {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== "properties") return;
    const symbol = checker.getSymbolAtLocation(statement.name);
    if (symbol !== undefined && !catalogs.has(namespace)) catalogs.set(namespace, symbol);
  });
  const probes: PropertyProbe[] = [];
  const denied: string[] = [];
  const untargeted: string[] = [];
  for (const [catalog, symbol] of [...catalogs].sort(([a], [b]) => a.localeCompare(b))) {
    const target = PROPERTY_TARGETS[catalog];
    if (target === undefined) {
      untargeted.push(catalog);
      continue;
    }
    for (const property of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))) {
      const key = `${catalog}.${property.name}`;
      if (PROPERTY_DENYLIST[key] !== undefined) {
        denied.push(key);
        continue;
      }
      const options = PROPERTY_OPTIONS[key];
      const type = checker.getTypeOfSymbol(property);
      const kinds = kindsOf(type, checker);
      const readonly = isReadonly(property);
      const kindWrites = readonly ? undefined : kindWritesFor(key, type, kinds, target, checker);
      probes.push({
        catalog,
        member: property.name,
        kinds,
        target,
        readonly,
        ...(options === undefined ? {} : { options }),
        ...(kindWrites === undefined ? {} : { kindWrites }),
      });
    }
  }
  return { probes, calls: probes.flatMap(callsFor), denied, untargeted };
}
