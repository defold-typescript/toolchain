import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slotAcceptsForeignSocket, type UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { createTranspileSession } from "./session";
import { checkCrossWorldAddresses, slotRejectsForeignSocket } from "./url-cross-world-address";
import { checkUrlFragmentReachability } from "./url-fragment-reachability";

// The committed classification table, exactly as `@defold-typescript/types`
// ships it — a table written into the test would prove nothing about the slots
// the project actually classifies.
const TABLE: UrlParameterTable = JSON.parse(
  readFileSync(join(import.meta.dir, "../../types/url-parameters.json"), "utf8"),
);

function programFor(source: string): ts.Program {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return program;
}

function worlds(...sockets: readonly (string | undefined)[]) {
  return () => sockets;
}

function findingsOf(source: string, worldsOf: () => readonly (string | undefined)[]) {
  return checkCrossWorldAddresses({ program: programFor(source), table: TABLE, worldsOf });
}

describe("checkCrossWorldAddresses", () => {
  test("a bare same-world slot addressing a foreign socket is reported", () => {
    const source = 'go.get_position("mylevel:/enemy");\n';
    const findings = findingsOf(source, worlds(undefined));
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.address).toBe("mylevel:/enemy");
    expect(finding?.socket).toBe("mylevel");
    expect(finding?.fileName).toBe("main.ts");
    expect(finding?.start).toBe(source.indexOf('"mylevel:/enemy"'));
    expect(finding?.length).toBe('"mylevel:/enemy"'.length);
    expect(finding?.message).toContain("mylevel");
    expect(finding?.message).toContain("bootstrap world");
  });

  test("the same literal at a cross-world slot is not reported", () => {
    expect(findingsOf('msg.post("mylevel:/enemy", "hello");\n', worlds(undefined))).toEqual([]);
    expect(findingsOf('msg.url("mylevel:/enemy");\n', worlds(undefined))).toEqual([]);
  });

  test("a socket matching the caller's own world is not reported", () => {
    expect(findingsOf('go.get_position("mylevel:/enemy");\n', worlds("mylevel"))).toEqual([]);
  });

  test("a bare or relative literal is never reported", () => {
    for (const address of ["/enemy", "buddy#controller", "#sprite"]) {
      expect(findingsOf(`go.get_position("${address}");\n`, worlds("mylevel"))).toEqual([]);
    }
  });

  test("a foreign socket with a relative path is reported", () => {
    const source = 'go.get_position("mylevel:enemy");\n';
    const findings = findingsOf(source, worlds(undefined));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.address).toBe("mylevel:enemy");
    expect(findings[0]?.socket).toBe("mylevel");
  });

  test("a socket with no path at all is reported", () => {
    const findings = findingsOf('go.get_position("mylevel:");\n', worlds(undefined));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.address).toBe("mylevel:");
    expect(findings[0]?.socket).toBe("mylevel");
  });

  test("a socket carrying only a fragment is reported", () => {
    const findings = findingsOf('go.get_position("mylevel:#body");\n', worlds(undefined));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.address).toBe("mylevel:#body");
    expect(findings[0]?.socket).toBe("mylevel");
  });

  test("the no-slash forms are not reported at a cross-world slot", () => {
    expect(findingsOf('msg.post("mylevel:enemy", "hello");\n', worlds(undefined))).toEqual([]);
    expect(findingsOf('msg.url("mylevel:");\n', worlds(undefined))).toEqual([]);
  });

  test("a no-slash socket matching the caller's own world is not reported", () => {
    expect(findingsOf('go.get_position("mylevel:enemy");\n', worlds("mylevel"))).toEqual([]);
  });

  test("a relative path whose segment carries a colon is not reported", () => {
    expect(findingsOf('go.get_position("/level:1/enemy");\n', worlds(undefined))).toEqual([]);
  });

  test("a fragment carrying a colon is not read as a socket", () => {
    expect(findingsOf('go.get_position("enemy#a:b");\n', worlds(undefined))).toEqual([]);
  });

  test("a hashed no-slash constant is reported like the written literal", () => {
    const source = 'const e = hash("mylevel:enemy");\ngo.get_position(e);\n';
    const findings = findingsOf(source, worlds(undefined));
    expect(findings.map((finding) => finding.address)).toEqual(["mylevel:enemy"]);
    expect(findings[0]?.socket).toBe("mylevel");
  });

  test("a file with no naming context is not reported", () => {
    expect(findingsOf('go.get_position("mylevel:/enemy");\n', worlds())).toEqual([]);
  });

  test("a file hosted in two worlds is reported only when every context disagrees", () => {
    expect(
      findingsOf('go.get_position("mylevel:/enemy");\n', worlds(undefined, "mylevel")),
    ).toEqual([]);

    const findings = findingsOf('go.get_position("other:/enemy");\n', worlds("mylevel", "hud"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("mylevel");
    expect(findings[0]?.message).toContain("hud");
  });

  test("a hashed constant is reported like the written literal", () => {
    const source = 'const enemy = hash("mylevel:/enemy");\ngo.get_position(enemy);\n';
    const findings = findingsOf(source, worlds(undefined));
    expect(findings.map((finding) => finding.address)).toEqual(["mylevel:/enemy"]);
    expect(findings[0]?.start).toBe(source.indexOf("enemy);"));
  });

  test("both checks recover the same hashed literal", () => {
    const source = 'const enemy = hash("mylevel:/enemy#body");\ngo.get_position(enemy);\n';
    const program = programFor(source);
    const cross = checkCrossWorldAddresses({
      program,
      table: TABLE,
      worldsOf: worlds(undefined),
    });
    const fragment = checkUrlFragmentReachability({
      program,
      table: TABLE,
      index: { ids: new Set(["sprite"]), incomplete: [] },
    });
    expect(cross.map((finding) => finding.address)).toEqual(["mylevel:/enemy#body"]);
    expect(fragment.kind === "checked" ? fragment.findings.map((f) => f.fragment) : []).toEqual([
      "body",
    ]);
  });

  test("an unclassified slot is not reported", () => {
    const source = 'function move(id: string) {\n  return id;\n}\nmove("mylevel:/enemy");\n';
    expect(findingsOf(source, worlds(undefined))).toEqual([]);
  });

  test("the check admits exactly what slotAcceptsForeignSocket admits", () => {
    expect(TABLE.length).toBeGreaterThan(0);
    for (const entry of TABLE) {
      const slot = `${entry.fqn}/${entry.parameter}`;
      expect({ slot, rejects: slotRejectsForeignSocket(entry) }).toEqual({
        slot,
        rejects: !slotAcceptsForeignSocket(TABLE, entry.fqn, entry.parameter),
      });
    }
  });
});
