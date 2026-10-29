import { describe, expect, test } from "bun:test";
import { type ApiDocElement, importUpstreamDocs, summarizeLuaDoc } from "./import-upstream-docs";
import type { LuaMember } from "./parse-lua-surface";

function callable(name: string, doc: string): LuaMember {
  return { name, params: [], varargs: false, doc, refusedDoc: false };
}

function field(name: string, doc: string): LuaMember {
  return { name, varargs: false, doc, refusedDoc: false };
}

function members(...entries: LuaMember[]): Map<string, LuaMember> {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

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

describe("importUpstreamDocs", () => {
  test("fills description with the summary and brief with its first line", () => {
    const [element] = importUpstreamDocs(
      [fn("start")],
      members(callable("start", "Start the console\n@param port The port")),
    ) as [ApiDocElement];
    expect(element.description).toBe("Start the console");
    expect(element.brief).toBe("Start the console");
    expect(element.docSource).toBe("upstream");
  });

  test("takes only the first line of a multi-line summary as the brief", () => {
    const [element] = importUpstreamDocs(
      [fn("start")],
      members(callable("start", "Start the console\n\nBinds a socket.")),
    ) as [ApiDocElement];
    expect(element.description).toBe("Start the console\n\nBinds a socket.");
    expect(element.brief).toBe("Start the console");
  });

  test("places docSource immediately after description", () => {
    const [element] = importUpstreamDocs(
      [fn("start")],
      members(callable("start", "Start the console")),
    ) as [ApiDocElement];
    expect(Object.keys(element)).toEqual([
      "type",
      "name",
      "brief",
      "description",
      "docSource",
      "parameters",
      "returnvalues",
    ]);
  });

  test("leaves an element the fork gave a brief untouched", () => {
    const original = fn("get_zoom", { brief: "Get the current zoom level of the camera." });
    const [element] = importUpstreamDocs(
      [original],
      members(callable("get_zoom", "Get the zoom level of a camera")),
    ) as [ApiDocElement];
    expect(element.brief).toBe("Get the current zoom level of the camera.");
    expect(element.description).toBe("");
    expect(element).not.toHaveProperty("docSource");
  });

  test("leaves an element the fork gave a description untouched", () => {
    const [element] = importUpstreamDocs(
      [fn("get_zoom", { description: "Get the current zoom level of the camera." })],
      members(callable("get_zoom", "Get the zoom level of a camera")),
    ) as [ApiDocElement];
    expect(element.description).toBe("Get the current zoom level of the camera.");
    expect(element.brief).toBe("");
    expect(element).not.toHaveProperty("docSource");
  });

  test("leaves an element whose upstream block is only tags untouched", () => {
    const [element] = importUpstreamDocs(
      [fn("TRANSITION")],
      members(callable("TRANSITION", "@deprecated")),
    ) as [ApiDocElement];
    expect(element).toEqual(fn("TRANSITION"));
  });

  test("never touches a global element", () => {
    const original = fn("pprint", { global: true });
    const [element] = importUpstreamDocs(
      [original],
      members(callable("pprint", "Pretty-print a value")),
    ) as [ApiDocElement];
    expect(element).toEqual(original);
  });

  test("never touches a TYPEDEF element", () => {
    const original: ApiDocElement = {
      type: "TYPEDEF",
      name: "Console",
      brief: "",
      description: "",
    };
    const [element] = importUpstreamDocs(
      [original],
      members(callable("Console", "The console handle")),
    ) as [ApiDocElement];
    expect(element).toEqual(original);
  });

  test("leaves an element with no upstream member of that name untouched", () => {
    const original = fn("bridge.bridge");
    const [element] = importUpstreamDocs(
      [original],
      members(callable("bridge", "The bridge module")),
    ) as [ApiDocElement];
    expect(element).toEqual(original);
  });

  test("imports a VARIABLE on the same terms as a FUNCTION", () => {
    const [element] = importUpstreamDocs(
      [{ type: "VARIABLE", name: "VERSION", brief: "", description: "" }],
      members(field("VERSION", "The library version\n@field string")),
    ) as [ApiDocElement];
    expect(element.description).toBe("The library version");
    expect(element.brief).toBe("The library version");
    expect(element.docSource).toBe("upstream");
  });

  test("imports each matching element and returns the list in order", () => {
    const elements = importUpstreamDocs(
      [fn("start"), fn("stop"), fn("update")],
      members(callable("start", "Start it"), callable("update", "Update it")),
    );
    expect(elements.map((element) => element.docSource)).toEqual([
      "upstream",
      undefined,
      "upstream",
    ]);
  });

  test("drops a leading line that is only the member's own name", () => {
    const [element] = importUpstreamDocs(
      [fn("update_account")],
      members(
        callable(
          "update_account",
          "update_account\nUpdate fields in the current user's account.\n@param client",
        ),
      ),
    ) as [ApiDocElement];
    expect(element.brief).toBe("Update fields in the current user's account.");
    expect(element.description).toBe("Update fields in the current user's account.");
  });

  test("imports nothing from a block that is only the member's own name", () => {
    const original = fn("create_api_account");
    const [element] = importUpstreamDocs(
      [original],
      members(callable("create_api_account", "create_api_account\n@param avatar_url")),
    ) as [ApiDocElement];
    expect(element).toEqual(original);
    expect(element).not.toHaveProperty("docSource");
  });

  test("keeps a first line that merely contains the name", () => {
    const [element] = importUpstreamDocs(
      [fn("start")],
      members(callable("start", "start the console\n@param port The port")),
    ) as [ApiDocElement];
    expect(element.brief).toBe("start the console");
  });

  test("the name comparison is exact, so a qualified element name strips nothing", () => {
    const [element] = importUpstreamDocs(
      [fn("orthographic.camera")],
      members(callable("orthographic.camera", "camera\nControl a camera.")),
    ) as [ApiDocElement];
    expect(element.brief).toBe("camera");
    expect(element.description).toBe("camera\nControl a camera.");
  });

  test("does not mutate the elements it is given", () => {
    const original = fn("start");
    importUpstreamDocs([original], members(callable("start", "Start the console")));
    expect(original).toEqual(fn("start"));
  });
});
