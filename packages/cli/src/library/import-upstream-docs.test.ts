import { describe, expect, test } from "bun:test";
import { type ApiDocElement, markUpstreamDocs, summarizeLuaDoc } from "./import-upstream-docs";

function fn(name: string, over: Partial<ApiDocElement> = {}): ApiDocElement {
  return {
    type: "FUNCTION",
    name,
    brief: "",
    description: "",
    parameters: [],
    returnvalues: [],
    ...over,
  };
}

describe("summarizeLuaDoc", () => {
  test("keeps the lines before the first tag and drops the tag's continuation", () => {
    const doc = [
      "Register a module of commands",
      "@param name The name of the module,",
      "which is prefixed to every command",
      "it registers",
      "@return Nothing",
    ].join("\n");
    expect(summarizeLuaDoc(doc)).toBe("Register a module of commands");
  });

  test("returns nothing for a block that is only a tag", () => {
    expect(summarizeLuaDoc("@deprecated")).toBe("");
  });

  test("truncates at the first tag even when a later line is unmarked", () => {
    expect(summarizeLuaDoc("Do a thing\n@param a\nstill the param\nNot a summary")).toBe(
      "Do a thing",
    );
  });

  test("preserves the interior newlines and blank lines of the surviving summary", () => {
    expect(summarizeLuaDoc("First line\n\nSecond paragraph\n@param a Something")).toBe(
      "First line\n\nSecond paragraph",
    );
  });

  test("trims the block's leading and trailing whitespace", () => {
    expect(summarizeLuaDoc("\n  Start the console  \n\n@param port The port")).toBe(
      "Start the console",
    );
  });

  test("returns nothing for an absent block", () => {
    expect(summarizeLuaDoc("")).toBe("");
  });

  test("keeps a line whose tag marker is not the first non-space character", () => {
    expect(summarizeLuaDoc("Send an email to user@example.com\n@param to")).toBe(
      "Send an email to user@example.com",
    );
  });
});

describe("markUpstreamDocs", () => {
  test("places docSource immediately after description", () => {
    const [element] = markUpstreamDocs([fn("start")], ["start"]) as [ApiDocElement];
    expect(Object.keys(element)).toEqual([
      "type",
      "name",
      "brief",
      "description",
      "docSource",
      "parameters",
      "returnvalues",
    ]);
    expect(element.docSource).toBe("upstream");
  });

  test("marks a VARIABLE on the same terms as a FUNCTION", () => {
    const [element] = markUpstreamDocs(
      [{ type: "VARIABLE", name: "VERSION", brief: "", description: "", types: ["string"] }],
      ["VERSION"],
    ) as [ApiDocElement];
    expect(Object.keys(element)).toEqual([
      "type",
      "name",
      "brief",
      "description",
      "docSource",
      "types",
    ]);
  });

  test("marks only the named elements and keeps the list in order", () => {
    const elements = markUpstreamDocs([fn("start"), fn("stop"), fn("update")], ["update", "start"]);
    expect(elements.map((element) => element.docSource)).toEqual([
      "upstream",
      undefined,
      "upstream",
    ]);
  });

  test("never marks a global element", () => {
    const original = fn("pprint", { global: true });
    expect(markUpstreamDocs([original], ["pprint"])).toEqual([original]);
  });

  test("never marks a TYPEDEF element", () => {
    const original: ApiDocElement = { type: "TYPEDEF", name: "Console" };
    expect(markUpstreamDocs([original], ["Console"])).toEqual([original]);
  });

  test("does not mutate the elements it is given", () => {
    const original = fn("start");
    markUpstreamDocs([original], ["start"]);
    expect(original).toEqual(fn("start"));
  });
});
