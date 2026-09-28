import ts from "typescript";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import {
  type DeclaredKinds,
  declaredKinds,
  declaredMembers,
  surfaceProgram,
  UnmappedLuaKindError,
} from "../../types/scripts/lua-kind";
import type { ApiTarget } from "../../types/scripts/regen";
import { type Box2DBackend, constantAbsence, contextFor, isBox2D } from "./contexts";
import { PROBE_DENYLIST } from "./probe-denylist";
import { forEachNamespaceStatement } from "./property-probes";
import { type ProbeCall, probeTarget } from "./witness";

export interface ConstantGeneration {
  readonly calls: readonly ProbeCall[];
}

function kindsOf(type: ts.Type, checker: ts.TypeChecker): DeclaredKinds {
  try {
    return declaredKinds(type, checker);
  } catch (error) {
    if (error instanceof UnmappedLuaKindError) return "any";
    throw error;
  }
}

function deniedNamespace(namespace: string): boolean {
  return PROBE_DENYLIST[`${namespace}.*`] !== undefined;
}

// `type Easing = typeof gui.EASING_INBACK | ...`: the constants an alias
// unions, when every member is a `typeof` of one.
function aliasMembers(statement: ts.Statement): string[] | undefined {
  if (!ts.isTypeAliasDeclaration(statement) || !ts.isUnionTypeNode(statement.type)) return;
  const members = statement.type.types;
  if (!members.every(ts.isTypeQueryNode)) return;
  return members.map((member) => (member as ts.TypeQueryNode).exprName.getText());
}

// Every declared constant, read in the script its namespace runs in, and every
// numeric constant alias, whose members must hold pairwise-distinct values. A
// Box2D backend registers its own constants, so the v3 pass reads the `b2d`
// namespaces again. A constant declared as nil is read bare and must stay nil.
export function constantProbes(
  target: ApiTarget = probeTarget(),
  program: ts.Program = surfaceProgram(target),
  backend: Box2DBackend = "v2",
): ConstantGeneration {
  const checker = program.getTypeChecker();
  const namespaces = comparedNamespaces(target).filter(
    (namespace) => !deniedNamespace(namespace) && (backend === "v2" || isBox2D(namespace)),
  );
  const constants = declaredMembers(program, namespaces).constants;
  const calls: ProbeCall[] = [];
  const numeric = new Set<string>();
  for (const [fqn, symbol] of constants) {
    const namespace = fqn.slice(0, fqn.lastIndexOf("."));
    const kinds = kindsOf(checker.getTypeOfSymbol(symbol), checker);
    if (kinds !== "any" && kinds.join() === "number") numeric.add(fqn);
    const conditional = constantAbsence(fqn) === "adapter";
    const nil = kinds !== "any" && kinds.join() === "nil";
    calls.push({
      name: fqn,
      variant: "constant",
      kind: contextFor(namespace).kind,
      call: conditional || nil ? fqn : `defined(${fqn})`,
      returns: {
        kinds: [conditional && kinds !== "any" ? [...kinds, "nil" as const].sort() : kinds],
        variadic: false,
      },
    });
  }
  const seen = new Set<string>();
  forEachNamespaceStatement(program, (namespace, statement) => {
    if (!namespaces.includes(namespace)) return;
    const members = aliasMembers(statement);
    if (members === undefined || members.length < 2) return;
    if (!members.every((member) => numeric.has(member))) return;
    const name = `${namespace}.${(statement as ts.TypeAliasDeclaration).name.text}`;
    if (seen.has(name)) return;
    seen.add(name);
    const pairs = members.map((member) => `[${JSON.stringify(member)}, ${member}]`);
    calls.push({
      name,
      variant: "distinct",
      kind: contextFor(namespace).kind,
      call: `distinct([${pairs.join(", ")}])`,
    });
  });
  return { calls };
}
