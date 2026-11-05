/**
 * The JSDoc a hover shows, read from a declaration file. Every exported declaration and member
 * needs a summary; every function, method and call signature a `@param` per parameter but `this`
 * and a `@returns` unless it returns `void`; and every exported function signature an `@example`
 * holding a non-empty `ts` fence, which a gate compiles the way it compiles a guide page's.
 */
import * as path from "node:path";
import * as ts from "typescript";
import { collapseWhitespace, type Fence, moduleExports, REPO_ROOT } from "./guide-fence-gate";
import { tsFences } from "./hsm-guide-steps";

type SignatureNode = ts.FunctionDeclaration | ts.MethodSignature | ts.CallSignatureDeclaration;

interface Owner {
  /** `<name>[#<n>][.<member>]`: a function or member with several signatures numbers them. */
  readonly label: string;
  readonly node: ts.Node;
  /** What the owner must document beyond its summary. */
  readonly needs: "summary" | "signature" | "function";
}

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function numbered(name: string, index: number, count: number): string {
  return count > 1 ? `${name}#${index + 1}` : name;
}

function memberOwners(
  owner: string,
  members: ts.NodeArray<ts.TypeElement>,
  file: ts.SourceFile,
): Owner[] {
  const calls = members.filter(ts.isCallSignatureDeclaration);
  const methodCounts = new Map<string, number>();
  for (const member of members.filter(ts.isMethodSignature)) {
    const name = member.name.getText(file);
    methodCounts.set(name, (methodCounts.get(name) ?? 0) + 1);
  }
  const methodSeen = new Map<string, number>();
  const owners: Owner[] = [];
  for (const member of members) {
    if (ts.isPropertySignature(member)) {
      owners.push({
        label: `${owner}.${member.name.getText(file)}`,
        node: member,
        needs: "summary",
      });
    } else if (ts.isMethodSignature(member)) {
      const name = member.name.getText(file);
      const index = methodSeen.get(name) ?? 0;
      methodSeen.set(name, index + 1);
      owners.push({
        label: `${owner}.${numbered(name, index, methodCounts.get(name) ?? 1)}`,
        node: member,
        needs: "signature",
      });
    } else if (ts.isCallSignatureDeclaration(member)) {
      // A call signature has no name of its own, so it is always numbered.
      owners.push({
        label: `${owner}#${calls.indexOf(member) + 1}`,
        node: member,
        needs: "signature",
      });
    }
  }
  return owners;
}

function owners(file: ts.SourceFile): Owner[] {
  const exported = file.statements.filter(isExported);
  const signatureCounts = new Map<string, number>();
  for (const statement of exported) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      const name = statement.name.text;
      signatureCounts.set(name, (signatureCounts.get(name) ?? 0) + 1);
    }
  }
  const seen = new Map<string, number>();
  const found: Owner[] = [];
  for (const statement of exported) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      const name = statement.name.text;
      const index = seen.get(name) ?? 0;
      seen.set(name, index + 1);
      found.push({
        label: numbered(name, index, signatureCounts.get(name) ?? 1),
        node: statement,
        needs: "function",
      });
    } else if (ts.isInterfaceDeclaration(statement)) {
      const name = statement.name.text;
      found.push({ label: name, node: statement, needs: "summary" });
      found.push(...memberOwners(name, statement.members, file));
    } else if (ts.isTypeAliasDeclaration(statement)) {
      const name = statement.name.text;
      found.push({ label: name, node: statement, needs: "summary" });
      if (ts.isTypeLiteralNode(statement.type)) {
        found.push(...memberOwners(name, statement.type.members, file));
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        found.push({ label: declaration.name.getText(file), node: statement, needs: "summary" });
      }
    }
  }
  return found;
}

/** The text before the first tag of the comment closest to `node`, up to its first blank line. */
function summaryOf(node: ts.Node): string {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const closest = docs[docs.length - 1];
  const text = closest === undefined ? "" : (ts.getTextOfJSDocComment(closest.comment) ?? "");
  return collapseWhitespace(text.split(/\n\s*\n/)[0] ?? "");
}

function rootName(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : rootName(name.left);
}

function signatureProblems(node: SignatureNode, tags: readonly ts.JSDocTag[]): string[] {
  const problems: string[] = [];
  const parameters = node.parameters
    .map((parameter) => parameter.name)
    .filter(ts.isIdentifier)
    .map((name) => name.text);
  const paramTags = tags.filter(ts.isJSDocParameterTag);
  const documented = new Set(
    paramTags.filter((tag) => ts.isIdentifier(tag.name)).map((tag) => rootName(tag.name)),
  );
  for (const parameter of parameters) {
    if (parameter !== "this" && !documented.has(parameter)) {
      problems.push(`no @param ${parameter}`);
    }
  }
  for (const tag of paramTags) {
    if (!parameters.includes(rootName(tag.name))) {
      problems.push(`@param ${tag.name.getText()} names no parameter`);
    }
  }
  if (node.type?.kind !== ts.SyntaxKind.VoidKeyword && !tags.some(ts.isJSDocReturnTag)) {
    problems.push("no @returns");
  }
  return problems;
}

function isExampleTag(tag: ts.JSDocTag): boolean {
  return tag.tagName.text === "example";
}

/** The non-blank bodies of the closed `ts` fences in the `@example` tags among `tags`. */
function exampleBodies(tags: readonly ts.JSDocTag[]): string[] {
  return tags
    .filter(isExampleTag)
    .flatMap((tag) => tsFences(ts.getTextOfJSDocComment(tag.comment) ?? ""))
    .map((fence) => fence.body)
    .filter((body) => body.trim() !== "");
}

function parse(module: string, text: string): ts.SourceFile {
  return ts.createSourceFile(`${module}.d.ts`, text, ts.ScriptTarget.Latest, true);
}

/**
 * The JSDoc a hover would miss in the declaration file `text`, each as
 * `<module>:<name>[#<n>][.<member>]: <problem>`, in declaration order.
 */
export function jsdocGaps(module: string, text: string): string[] {
  const gaps: string[] = [];
  for (const owner of owners(parse(module, text))) {
    const problems: string[] = [];
    if (summaryOf(owner.node) === "") problems.push("no summary");
    if (owner.needs !== "summary") {
      const tags = ts.getJSDocTags(owner.node);
      problems.push(...signatureProblems(owner.node as SignatureNode, tags));
      if (owner.needs === "function") {
        if (!tags.some(isExampleTag)) problems.push("no @example");
        else if (exampleBodies(tags).length === 0) problems.push("no ts code in @example");
      }
    }
    gaps.push(...problems.map((problem) => `${module}:${owner.label}: ${problem}`));
  }
  return gaps;
}

/**
 * The `ts` fences of every `@example` in the declaration file `text`, labelled
 * `<module>:<owner> @example <n>` and written under a file name unique to the module.
 */
export function jsdocExamples(module: string, text: string): Fence[] {
  const prefix = module.replace(/[^\w]+/g, "-");
  const fences: Fence[] = [];
  for (const owner of owners(parse(module, text))) {
    exampleBodies(ts.getJSDocTags(owner.node)).forEach((body, index) => {
      fences.push({
        label: `${module}:${owner.label} @example ${index + 1}`,
        rel: `${prefix}-example-${fences.length + 1}.ts`,
        body,
      });
    });
  }
  return fences;
}

/**
 * The first paragraph of the comment a hover shows for `name`, or for its `member`, as the module
 * at `sourcePath` exports it, whitespace collapsed. A member comes from the interface that declares
 * it, so a callback a callback interface inherits reads from its base. An overloaded function reads
 * its first signature.
 */
export function jsdocSummary(
  program: ts.Program,
  sourcePath: string,
  name: string,
  member?: string,
): string {
  const checker = program.getTypeChecker();
  const symbol = moduleExports(program, sourcePath).find((entry) => entry.name === name);
  const where = path.relative(REPO_ROOT, sourcePath).split(path.sep).join("/");
  if (symbol === undefined) {
    throw new Error(`${where} exports no ${name}`);
  }
  let parts: ts.SymbolDisplayPart[];
  if (member !== undefined) {
    const property = checker
      .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
      .find((entry) => entry.name === member);
    if (property === undefined) {
      throw new Error(`${where}: ${name} has no member ${member}`);
    }
    parts = property.getDocumentationComment(checker);
  } else {
    const firstSignature = (symbol.declarations ?? []).find(ts.isFunctionDeclaration);
    parts =
      firstSignature === undefined
        ? symbol.getDocumentationComment(checker)
        : (checker.getSignatureFromDeclaration(firstSignature)?.getDocumentationComment(checker) ??
          []);
  }
  return collapseWhitespace(ts.displayPartsToString(parts).split(/\n\s*\n/)[0] ?? "");
}
