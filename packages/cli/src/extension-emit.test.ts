import { describe, expect, test } from "bun:test";
import { emitExtensionDeclaration } from "./extension-emit";

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
});
