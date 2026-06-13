import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { emitExtensionDeclaration, emitExtensionDeclarationFromDoc } from "./extension-emit";

async function parseScriptApiDoc(scriptApiYaml: string): Promise<{ info: { namespace: string } }> {
  const root = resolveTypesPackageRoot();
  if (root === null) throw new Error("@defold-typescript/types must resolve in the monorepo");
  const { scriptApiToFixtureJson } = (await import(join(root, "scripts", "sync-api-docs.ts"))) as {
    scriptApiToFixtureJson: (text: string) => string;
  };
  return JSON.parse(scriptApiToFixtureJson(scriptApiYaml));
}

const PRIMARY = `
- name: myext
  type: table
  desc: A sample native extension.
  members:
  - name: do_thing
    type: function
    desc: Does a thing.
    parameters:
      - name: self
        type: object
        desc: the script self
      - name: count
        type: number
        desc: how many times
    returns:
      - name: ok
        type: boolean
        desc: whether it worked
  - name: MAX
    type: number
    desc: a module constant
`;

const SECOND = `
- name: other
  type: table
  desc: A different extension.
  members:
  - name: ping
    type: function
    desc: Ping the service.
    parameters:
      - name: self
        type: object
        desc: the script self
`;

const CONSTANTS_ONLY = `
- name: consts
  type: table
  desc: Constants only.
  members:
  - name: ALPHA
    type: number
    desc: the alpha constant
  - name: BETA
    type: number
    desc: the beta constant
`;

const HANDLES = `
- name: handles
  type: table
  desc: An extension exposing engine handle types.
  members:
  - name: get_node
    type: function
    desc: Returns a gui node handle.
    parameters:
      - name: self
        type: object
        desc: the script self
    returns:
      - name: n
        type: node
        desc: a gui node
  - name: fill
    type: function
    desc: Fills a buffer handle.
    parameters:
      - name: self
        type: object
        desc: the script self
      - name: buf
        type: buffer
        desc: the buffer to fill
  - name: get_texture
    type: function
    desc: Returns a texture handle.
    parameters:
      - name: self
        type: object
        desc: the script self
    returns:
      - name: t
        type: texture
        desc: a texture
  - name: get_custom
    type: function
    desc: Returns a non-engine token.
    parameters:
      - name: self
        type: object
        desc: the script self
    returns:
      - name: c
        type: somecustomhandle
        desc: a token no brand maps
`;

describe("extension handle-type brands", () => {
  test('a function returning type: node emits Opaque<"node">', async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain(': Opaque<"node">');
  });

  test('a function parameter of type: buffer emits Opaque<"buffer">', async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain('Opaque<"buffer">');
  });

  test("a type: texture token emits a third distinct brand from the shared map", async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain('Opaque<"texture">');
  });

  test("imports the Opaque brand exactly once", async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    const occurrences =
      contents.split('import type { Opaque } from "../src/core-types";').length - 1;
    expect(occurrences).toBe(1);
  });

  test("a genuinely non-engine token degrades to unknown, not a fabricated brand", async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain("function get_custom(): unknown;");
    expect(contents).not.toContain("somecustomhandle");
    expect(contents).not.toContain('Opaque<"somecustomhandle">');
  });
});

describe("emitExtensionDeclaration", () => {
  test("reads the namespace from the doc and emits an ambient namespace declaration", async () => {
    const result = await emitExtensionDeclaration(PRIMARY);
    expect(result.namespace).toBe("myext");
    expect(result.contents).toMatchSnapshot();
  });

  test("drops the implicit self parameter from the emitted signature", async () => {
    const { contents } = await emitExtensionDeclaration(PRIMARY);
    expect(contents).toContain("function do_thing(count: number): boolean;");
    expect(contents).not.toContain("self");
  });

  test("derives the namespace from the doc, never a caller argument", async () => {
    const result = await emitExtensionDeclaration(SECOND);
    expect(result.namespace).toBe("other");
    expect(result.contents).toContain("namespace other {");
  });

  test("emits a valid empty-bodied namespace for a constants-only doc", async () => {
    const result = await emitExtensionDeclaration(CONSTANTS_ONLY);
    expect(result.namespace).toBe("consts");
    expect(result.contents).toContain("namespace consts {");
    expect(result.contents).not.toContain("function");
    expect(result.dropped).toEqual([]);
  });

  test("the YAML wrapper adds only the scriptApiToFixtureJson parse over the doc core", async () => {
    const doc = await parseScriptApiDoc(PRIMARY);
    expect(await emitExtensionDeclarationFromDoc(doc)).toEqual(
      await emitExtensionDeclaration(PRIMARY),
    );
  });
});
