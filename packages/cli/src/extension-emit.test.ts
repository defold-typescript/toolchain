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

const DOTTED = `
- name: rive.cmd
  type: table
  desc: Rive commands.
  members:
  - name: run
    type: function
    desc: Runs a command.
`;

const ENGINE_EXTENDING = `
- name: gui
  type: table
  desc: Spine gui nodes.
  members:
  - name: new_spine_node
    type: function
    desc: Creates a spine node.
    parameters:
      - name: pos
        type: vector3
        desc: the node position
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
    type: string
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

  test("the module reads the Opaque brand ambient and imports nothing", async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain("Opaque<");
    expect(contents).not.toContain("import type");
  });

  test("a genuinely non-engine token degrades to unknown, not a fabricated brand", async () => {
    const { contents } = await emitExtensionDeclaration(HANDLES);
    expect(contents).toContain("function get_custom(): unknown;");
    expect(contents).not.toContain("somecustomhandle");
    expect(contents).not.toContain('Opaque<"somecustomhandle">');
  });
});

describe("emitExtensionDeclaration", () => {
  test("reads the namespace from the doc and emits a @globalTable module with no ambient global", async () => {
    const result = await emitExtensionDeclaration(PRIMARY);
    expect(result.namespace).toBe("myext");
    expect(result.contents).toMatchSnapshot();
    expect(result).not.toHaveProperty("deprecatedGlobal");
  });

  test("a dotted namespace emits the dotted module id", async () => {
    const result = await emitExtensionDeclaration(DOTTED);
    expect(result.namespace).toBe("rive.cmd");
    expect(result.contents).toMatchSnapshot();
  });

  test("a namespace the engine declares emits its ambient form alone", async () => {
    const result = await emitExtensionDeclaration(ENGINE_EXTENDING);
    expect(result.namespace).toBe("gui");
    expect(result.contents).toMatchSnapshot();
    expect(result).not.toHaveProperty("deprecatedGlobal");
  });

  test("drops the implicit self parameter from the emitted signature", async () => {
    const { contents } = await emitExtensionDeclaration(PRIMARY);
    expect(contents).toContain("function do_thing(count: number): boolean;");
    expect(contents).not.toContain("self");
  });

  test("derives the namespace from the doc, never a caller argument", async () => {
    const result = await emitExtensionDeclaration(SECOND);
    expect(result.namespace).toBe("other");
    expect(result.contents).toContain('declare module "other" {');
  });

  test("emits the constants of a constants-only doc and no function", async () => {
    const result = await emitExtensionDeclaration(CONSTANTS_ONLY);
    expect(result.namespace).toBe("consts");
    expect(result.contents).toContain('declare module "consts" {');
    expect(result.contents).toContain(
      'const ALPHA: number & { readonly __brand: "consts.ALPHA" };',
    );
    expect(result.contents).toContain('const BETA: string & { readonly __brand: "consts.BETA" };');
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

const COMPLETE = `
- name: ads
  type: table
  desc: An extension with a constant, an optional parameter and a callback.
  members:
  - name: MSG_LOADED
    type: number
    desc: the loaded message
  - name: load
    type: function
    desc: Load an ad.
    parameters:
      - name: self
        type: object
        desc: the script self
      - name: callback
        type: function
        desc: called when the ad resolves
        parameters:
          - name: self
            type: object
            desc: the calling script
          - name: message_id
            type: number
            desc: the message id
          - name: message
            type: table
            desc: the message payload
            fields:
              - name: code
                type: number
                desc: the error code
              - name: error
                type: string
                desc: the error text
                optional: true
      - name: tag
        type: string
        desc: an optional tag
        optional: true
`;

describe("emitExtensionDeclaration complete surface", () => {
  test("emits the constant, the optional parameter and the typed callback, dropping nothing", async () => {
    const result = await emitExtensionDeclaration(COMPLETE);
    expect(result.contents).toMatch(/const MSG_LOADED: /);
    expect(result.contents).toContain(
      "function load(callback: (self: unknown, message_id: number, message: { code: number; error?: string }) => void, tag?: string): void;",
    );
    expect(result.dropped).toEqual([]);
  });
});
