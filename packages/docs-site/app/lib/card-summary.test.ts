import { describe, expect, test } from "bun:test";
import { renderCardSummary } from "./card-summary";

describe("renderCardSummary", () => {
  test("flattens a link to its text — no nested anchor inside the card link", () => {
    expect(renderCardSummary("Install the editor from [defold.com](https://defold.com/).")).toBe(
      "Install the editor from defold.com.",
    );
  });

  test("renders code spans and emphasis", () => {
    expect(renderCardSummary("Run `init` to **scaffold** a project.")).toBe(
      "Run <code>init</code> to <strong>scaffold</strong> a project.",
    );
  });

  test("flattens multiple links while keeping surrounding prose", () => {
    expect(
      renderCardSummary(
        "Build your [Defold](https://defold.com/) game in [TypeScript](https://ts).",
      ),
    ).toBe("Build your Defold game in TypeScript.");
  });

  test("escapes raw HTML in the source", () => {
    expect(renderCardSummary("a <script>x</script> b")).not.toContain("<script>");
  });
});
