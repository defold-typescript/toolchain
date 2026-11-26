// Type-only for the same bug-88 reason `url-cross-world-address.ts` gives: a
// value import from `@defold-typescript/types` would survive into the packed CLI
// and fail under plain node.
import type { UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import { isAmbient } from "./url-address-literals";
import { addressEntryOfArgument } from "./url-address-slots";

/** One literal at a component slot that names no component. */
export interface MissingFragmentFinding {
  readonly fileName: string;
  readonly start: number;
  readonly length: number;
  /** The literal's text, as written. */
  readonly address: string;
  /** The function whose component slot the literal fills. */
  readonly call: string;
  readonly message: string;
}

// The engine's string `ResolveURL` gives `""` and `"#"` the caller's own
// component, and every other literal with nothing after its `#` an empty
// fragment, which no component lookup accepts.
function namesNoComponent(text: string): boolean {
  const hash = text.indexOf("#");
  const path = hash === -1 ? text : text.slice(0, hash);
  const fragment = hash === -1 ? "" : text.slice(hash + 1);
  return path !== "" && fragment === "";
}

/**
 * Report every string literal at a component slot whose text names a game
 * object but no `#fragment`, which the engine's component lookup raises on.
 *
 * Only a literal is judged: the rule is the engine's string resolution, and a
 * hashed address takes another path through it.
 */
export function checkMissingComponentFragments(input: {
  program: ts.Program;
  table: UrlParameterTable;
  sourceFiles?: readonly ts.SourceFile[];
}): readonly MissingFragmentFinding[] {
  const { program, table, sourceFiles } = input;

  const checker = program.getTypeChecker();
  const findings: MissingFragmentFinding[] = [];
  const targets = sourceFiles ?? program.getSourceFiles();

  for (const sourceFile of targets) {
    if (isAmbient(sourceFile.fileName)) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) && namesNoComponent(node.text)) {
        const entry = addressEntryOfArgument(checker, table, node);
        if (entry?.class === "component") {
          findings.push({
            fileName: sourceFile.fileName,
            start: node.getStart(sourceFile),
            length: node.getWidth(sourceFile),
            address: node.text,
            call: entry.fqn,
            message:
              `\`${entry.fqn}\` resolves "${node.text}" to a component, but the address names ` +
              `no #fragment, so the call raises at runtime — add the component's #fragment`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return findings;
}
