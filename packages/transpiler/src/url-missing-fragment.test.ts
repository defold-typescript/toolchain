import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { createTranspileSession } from "./session";
import { checkMissingComponentFragments } from "./url-missing-fragment";

// The committed classification table, exactly as `@defold-typescript/types`
// ships it, so the component slots are the ones the project classifies.
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

function findingsOf(source: string) {
  return checkMissingComponentFragments({ program: programFor(source), table: TABLE });
}

describe("checkMissingComponentFragments", () => {
  test("a component slot literal naming no fragment is reported", () => {
    const source = 'factory.create("/spawner");\n';
    const findings = findingsOf(source);
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.fileName).toBe("main.ts");
    expect(finding?.call).toBe("factory.create");
    expect(finding?.address).toBe("/spawner");
    expect(finding?.start).toBe(source.indexOf('"/spawner"'));
    expect(finding?.length).toBe('"/spawner"'.length);
    expect(finding?.message).toContain("`factory.create`");
    expect(finding?.message).toContain('"/spawner"');
    expect(finding?.message).toContain("#fragment");
    expect(finding?.message).toContain("raises at runtime");
  });

  test("the current object, an empty fragment and a socket-qualified path are each reported", () => {
    for (const address of [".", "/spawner#", "main:/spawner"]) {
      const findings = findingsOf(`factory.create("${address}");\n`);
      expect(findings.map((finding) => finding.address)).toEqual([address]);
    }
  });

  test("an empty literal, a bare '#' and a named fragment are not reported", () => {
    for (const address of ["", "#", "/spawner#factory"]) {
      expect(findingsOf(`factory.create("${address}");\n`)).toEqual([]);
    }
  });

  test("each component slot of one call is judged on its own", () => {
    const source = [
      "physics.create_joint(",
      '  physics.JOINT_TYPE_FIXED, "/a#collisionobject", "joint", vmath.vector3(),',
      '  "/b", vmath.vector3(),',
      ");",
      "",
    ].join("\n");
    const findings = findingsOf(source);
    expect(findings.map((finding) => [finding.call, finding.address])).toEqual([
      ["physics.create_joint", "/b"],
    ]);
    expect(findings[0]?.start).toBe(source.indexOf('"/b"'));
  });

  test("a game-object slot and an either slot are not reported", () => {
    expect(findingsOf('go.get_position("/player");\n')).toEqual([]);
    expect(findingsOf('msg.post("/player", "hi");\n')).toEqual([]);
  });

  test("an address settled only at runtime is not reported", () => {
    expect(findingsOf("declare const where: string;\nfactory.create(where);\n")).toEqual([]);
    expect(findingsOf(`declare const name: string;\nfactory.create(\`/\${name}\`);\n`)).toEqual([]);
    expect(findingsOf('factory.create(msg.url("/spawner"));\n')).toEqual([]);
  });

  test("a backtick literal with no substitution is reported like a quoted one", () => {
    expect(findingsOf("factory.create(`/spawner`);\n").map((finding) => finding.address)).toEqual([
      "/spawner",
    ]);
  });
});
