import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

// Build-time only: lives under `scripts/` (never reachable from the shipped
// `src/index.ts` graph) so its `typescript`/`node:fs` imports cannot leak into a
// consumer's typecheck, exactly like `signature-store-fs.ts`.

// One indexed declaration: how many overloads the source carries for the FQN
// and, per overload, the parameter names (so a future check can compare optional
// params). A `const`/`var`/property value is recorded as a single entry with an
// empty parameter list.
export interface SignatureIndexEntry {
  overloadCount: number;
  params: string[][];
}

// FQN (`string.byte`, `file:read`, `socket.dns.toip`, bare `pcall`) -> entry.
export type SignatureIndex = Map<string, SignatureIndexEntry>;

export const LUA_TYPES_DIR = resolve(import.meta.dir, "..", "node_modules", "lua-types");

export function luaTypesFile(...segments: string[]): string {
  return resolve(LUA_TYPES_DIR, ...segments);
}

function recordEntry(index: SignatureIndex, key: string, params: string[]): void {
  const existing = index.get(key);
  if (existing) {
    existing.overloadCount += 1;
    existing.params.push(params);
    return;
  }
  index.set(key, { overloadCount: 1, params: [params] });
}

function parameterNames(parameters: ts.NodeArray<ts.ParameterDeclaration>): string[] {
  return parameters.map((parameter) =>
    ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText(),
  );
}

// `declare global { ... }` is a transparent wrapper (the repo's `generated/*.d.ts`
// nest their namespace under it); its members keep the surrounding prefix.
function isGlobalAugmentation(node: ts.ModuleDeclaration): boolean {
  if ((node.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true;
  return ts.isIdentifier(node.name) && node.name.text === "global";
}

function qualify(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name;
}

function visit(
  node: ts.Node,
  prefix: string,
  handleByInterface: Map<string, string>,
  index: SignatureIndex,
): void {
  if (ts.isFunctionDeclaration(node) && node.name) {
    recordEntry(index, qualify(prefix, node.name.text), parameterNames(node.parameters));
    return;
  }

  if (ts.isModuleDeclaration(node)) {
    const childPrefix = isGlobalAugmentation(node)
      ? prefix
      : ts.isIdentifier(node.name)
        ? qualify(prefix, node.name.text)
        : prefix;
    if (node.body) {
      if (ts.isModuleBlock(node.body)) {
        for (const statement of node.body.statements) {
          visit(statement, childPrefix, handleByInterface, index);
        }
      } else if (ts.isModuleDeclaration(node.body)) {
        visit(node.body, childPrefix, handleByInterface, index);
      }
    }
    return;
  }

  // Handle interfaces are re-keyed by their handle name (`LuaFile` -> `file:read`,
  // socket's `client` -> `client:close`); non-handle interfaces are ignored. This
  // fires for both top-level interfaces (io's `LuaFile`) and interfaces nested in
  // a namespace (socket's handle interfaces), so the surrounding prefix is dropped.
  if (ts.isInterfaceDeclaration(node)) {
    const handle = handleByInterface.get(node.name.text);
    if (!handle) return;
    for (const member of node.members) {
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      if (ts.isMethodSignature(member)) {
        recordEntry(index, `${handle}:${member.name.text}`, parameterNames(member.parameters));
      } else if (ts.isPropertySignature(member)) {
        recordEntry(index, `${handle}:${member.name.text}`, []);
      }
    }
    return;
  }

  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        recordEntry(index, qualify(prefix, declaration.name.text), []);
      }
    }
  }
}

function reverseHandles(handleInterfaces: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(handleInterfaces).map(([handle, iface]) => [iface, handle]));
}

function indexSourceFile(
  index: SignatureIndex,
  fileName: string,
  source: string,
  handleByInterface: Map<string, string>,
): void {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  for (const statement of sourceFile.statements) {
    visit(statement, "", handleByInterface, index);
  }
}

// Parse one in-memory `.d.ts` source into an index (or fold into `into`). Used by
// the drift guard's synthetic-source cases; the file-reading path delegates here.
export function indexDeclarationSource(
  fileName: string,
  source: string,
  handleInterfaces: Record<string, string> = {},
  into?: SignatureIndex,
): SignatureIndex {
  const index = into ?? new Map<string, SignatureIndexEntry>();
  indexSourceFile(index, fileName, source, reverseHandles(handleInterfaces));
  return index;
}

// Parse each `.d.ts` file and fold every declaration into one FQN -> entry index.
// When an FQN appears in more than one file its overloads accumulate.
export function buildSignatureIndex(
  filePaths: string[],
  handleInterfaces: Record<string, string> = {},
): SignatureIndex {
  const index = new Map<string, SignatureIndexEntry>();
  const handleByInterface = reverseHandles(handleInterfaces);
  for (const filePath of filePaths) {
    indexSourceFile(index, filePath, readFileSync(filePath, "utf8"), handleByInterface);
  }
  return index;
}
