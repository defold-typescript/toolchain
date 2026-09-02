// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The judgment is read off the entry the
// slot lookup already resolved, and `url-cross-world-address.test.ts` binds that
// reading to `slotAcceptsForeignSocket` over the committed table so the two
// cannot drift.
import type { UrlParameterEntry, UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import { socketOfAddress } from "./scene-naming-context";
import { canonicalHashSymbols, isAmbient, staticAddressTextOf } from "./url-address-literals";
import { addressEntryOfArgument } from "./url-address-slots";

/** One address naming a world the script writing it cannot reach. */
export interface CrossWorldAddressFinding {
  readonly fileName: string;
  readonly start: number;
  readonly length: number;
  /** The statically-known address text, as written or as hashed. */
  readonly address: string;
  /** The foreign proxy socket that text names. */
  readonly socket: string;
  readonly message: string;
}

/**
 * Whether this slot refuses a socket-qualified address naming another world.
 *
 * The negation of `slotAcceptsForeignSocket` in `@defold-typescript/types`, and
 * deliberately fails open the same way: a slot carrying no judgment refuses
 * nothing, so nothing is reported on a slot nobody classified.
 */
export function slotRejectsForeignSocket(entry: UrlParameterEntry): boolean {
  return entry.socketScope === "same-world";
}

// How a caller's own world reads in a message. The bootstrap world has no
// socket, and naming it by its absence would produce `the world ""`.
function worldPhrase(sockets: readonly (string | undefined)[]): string {
  const named = [...new Set(sockets)].map((socket) =>
    socket === undefined ? "the bootstrap world" : `"${socket}"`,
  );
  return named.join(" and ");
}

/**
 * Report every address-slot expression whose statically-known text names a proxy
 * socket the script writing it does not run in, at a slot that resolves through
 * an instance or component handle rather than the message bus.
 *
 * Deliberately not folded into `checkUrlFragmentReachability`: that check
 * suppresses index-wide on an incomplete component universe, while this one's
 * honesty rule is per file — a script whose naming contexts could not be
 * resolved is reported on at all, because unknown is not wrong. Fusing them
 * would put one check's early return in front of the other's findings.
 *
 * `worldsOf` answers with the sockets of every naming context the file's script
 * runs in; an empty answer is the unknown case and yields nothing.
 */
export function checkCrossWorldAddresses(input: {
  program: ts.Program;
  table: UrlParameterTable;
  worldsOf: (fileName: string) => readonly (string | undefined)[];
  sourceFiles?: readonly ts.SourceFile[];
}): readonly CrossWorldAddressFinding[] {
  const { program, table, worldsOf, sourceFiles } = input;

  const checker = program.getTypeChecker();
  const canonical = canonicalHashSymbols(checker, program);
  const findings: CrossWorldAddressFinding[] = [];
  const targets = sourceFiles ?? program.getSourceFiles();

  for (const sourceFile of targets) {
    if (isAmbient(sourceFile.fileName)) continue;
    const worlds = worldsOf(sourceFile.fileName);
    if (worlds.length === 0) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isExpression(node)) {
        const entry = addressEntryOfArgument(checker, table, node);
        if (entry !== undefined && slotRejectsForeignSocket(entry)) {
          const address = staticAddressTextOf(checker, node, canonical);
          const socket = address === undefined ? undefined : socketOfAddress(address);
          if (
            address !== undefined &&
            socket !== undefined &&
            worlds.every((world) => world !== socket)
          ) {
            findings.push({
              fileName: sourceFile.fileName,
              start: node.getStart(sourceFile),
              length: node.getWidth(sourceFile),
              address,
              socket,
              message:
                `this address names the world "${socket}", but \`${entry.fqn}\` resolves it in ` +
                `the world the script runs in (${worldPhrase(worlds)}), so it cannot resolve at ` +
                `runtime — only \`msg.post\` and \`msg.url\` cross a collection proxy`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return findings;
}
