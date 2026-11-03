import { describe, expect, test } from "bun:test";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import type { ApiModule } from "@defold-typescript/types";
import { CombinedIndex } from "./api-index";

function enginePage(namespace: string, brief = ""): ApiPage {
  const module: ApiModule = {
    namespace,
    brief,
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  return {
    namespace,
    route: `/api/${namespace}`,
    brief,
    module,
    translations: {},
    signatures: {},
    category: "engine",
  };
}

// The disclosure is read back out of the rendered element rather than matched
// against a sentence: `data-tracked-versions` is the key the assertions hold, so
// the wording stays free to change while the derived facts stay pinned.
function disclosure(html: string): { versions: string; text: string } {
  const match = html.match(/<span[^>]*\sdata-tracked-versions="([^"]*)"[^>]*>([\s\S]*?)<\/span>/);
  if (!match) throw new Error("no tracked-versions disclosure in the rendered index");
  return { versions: match[1] ?? "", text: (match[2] ?? "").replace(/<[^>]+>/g, "") };
}

describe("CombinedIndex — tracked-versions disclosure", () => {
  const render = (versions: string[]) =>
    String(CombinedIndex({ pages: [enginePage("go")], versions }));

  test("lists the tracked versions from the projection it is handed, not from a literal", () => {
    expect(disclosure(render(["1.13.1", "1.13.0", "1.12.4"])).versions).toBe(
      "1.13.1, 1.13.0, 1.12.4",
    );
    // A second, disjoint axis: a hardcoded list survives one of these, never both.
    expect(disclosure(render(["9.9.9", "2.0.0", "1.0.0"])).versions).toBe("9.9.9, 2.0.0, 1.0.0");
  });

  test("names the oldest tracked release as the limit of what an unmarked symbol can claim", () => {
    const { text } = disclosure(render(["9.9.9", "2.0.0", "1.0.0"]));
    // The bare list carries no `Defold ` prefix, so only the limit clause matches.
    expect(text).toContain("Defold 1.0.0");
    expect(text).not.toContain("Defold 9.9.9");
    expect(text).not.toContain("Defold 2.0.0");
  });

  test("a single tracked release is its own limit", () => {
    const { versions, text } = disclosure(render(["1.13.1"]));
    expect(versions).toBe("1.13.1");
    expect(text).toContain("Defold 1.13.1");
  });
});

describe("CombinedIndex — platform markers", () => {
  test("a card description reads as prose with no bracket markers", () => {
    const html = String(
      CombinedIndex({
        pages: [enginePage("go", "Gets the status. [icon:ios] [icon:android] Mobile only.")],
        versions: ["1.0.0"],
      }),
    );
    expect(html).toContain("Gets the status. Mobile only.");
    expect(html).not.toContain("[icon:");
  });
});
