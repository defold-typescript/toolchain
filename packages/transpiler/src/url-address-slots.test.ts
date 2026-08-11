import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { createTranspileSession } from "./session";
import { resolveAddressSlotAtPosition } from "./url-address-slots";

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

function slotAt(source: string, position: number) {
  return resolveAddressSlotAtPosition({
    program: programFor(source),
    table: TABLE,
    fileName: "main.ts",
    position,
  });
}

// The offset just inside the opening quote of `literal` as it appears in
// `source` — the cursor position an editor reports for a caret at the start of
// the literal's text.
function insideOf(source: string, literal: string): number {
  const start = source.indexOf(literal);
  if (start === -1) {
    throw new Error(`${literal} is not in the source`);
  }
  return start + 1;
}

describe("resolveAddressSlotAtPosition", () => {
  test("resolves an address slot, reporting the span strictly inside the quotes", () => {
    const source = 'msg.post("#sprite", "hello");\n';
    const slot = slotAt(source, insideOf(source, '"#sprite"'));
    expect(slot?.class).not.toBe("none");
    expect(slot?.text).toBe("#sprite");
    expect(slot?.textStart).toBe(source.indexOf("#sprite"));
    expect(slot?.fragmentStart).toBe(source.indexOf("#sprite") + 1);
  });

  test("the table decides which slot addresses, not the parameter's type", () => {
    // `mesh_id` carries the same `string | Hash | Url` triple as an address slot
    // but names a mesh inside the model asset, so it is absent from the table.
    const source = 'const url = msg.url();\nmodel.get_mesh_enabled(url, "#torso");\n';
    expect(slotAt(source, insideOf(source, '"#torso"'))).toBeUndefined();
  });

  test("a quote and anything beyond the literal is not a slot position", () => {
    const source = 'msg.post("#sprite", "hello");\n';
    const start = source.indexOf('"#sprite"');
    expect(slotAt(source, start)).toBeUndefined();
    expect(slotAt(source, start + '"#sprite"'.length)).toBeUndefined();
    expect(slotAt(source, 0)).toBeUndefined();
  });

  test("the end of the inside-quotes text resolves — that is the append position", () => {
    const source = 'msg.post("#", "hello");\n';
    const slot = slotAt(source, source.indexOf('"#"') + 2);
    expect(slot?.text).toBe("#");
    expect(slot?.fragmentStart).toBe(source.indexOf('"#"') + 2);
  });

  test("an address slot with no `#` resolves with `fragmentStart` -1", () => {
    const source = 'go.get("/enemy", "position");\n';
    const slot = slotAt(source, insideOf(source, '"/enemy"'));
    expect(slot?.class).not.toBe("none");
    expect(slot?.text).toBe("/enemy");
    expect(slot?.fragmentStart).toBe(-1);
  });

  test("a backtick literal resolves exactly as its quoted twin", () => {
    const quoted = 'msg.post("#sprite", "hello");\n';
    const backtick = 'msg.post(`#sprite`, "hello");\n';
    expect(slotAt(backtick, insideOf(backtick, "`#sprite`"))).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: the quoted twin resolves or the first test already failed
      slotAt(quoted, insideOf(quoted, '"#sprite"'))!,
    );
  });

  test("a substituted template is never a slot — its text is not statically known", () => {
    const source = `const id = "x";\nmsg.post(\`#\${id}\`, "hello");\n`;
    expect(slotAt(source, source.indexOf("`") + 1)).toBeUndefined();
  });

  test("a literal carrying an escape is refused — cooked offsets would lie", () => {
    const source = 'msg.post("a\\tb", "hello");\n';
    expect(slotAt(source, insideOf(source, '"a\\tb"'))).toBeUndefined();
  });

  test("an unresolvable call is not a slot", () => {
    const source = '(undefined as any)("#x");\n';
    expect(slotAt(source, insideOf(source, '"#x"'))).toBeUndefined();
  });
});
