import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { generateRootReadme, ROOT_README, SOURCE_README } from "./sync-readme";

describe("sync-readme", () => {
  test("generates the root README from the guide README", () => {
    const source = readFileSync(SOURCE_README, "utf8");
    const root = readFileSync(ROOT_README, "utf8");

    expect(root).toBe(generateRootReadme(source));
  });

  test("strips frontmatter and rewrites guide-local paths for GitHub", () => {
    const source = `---\ntoc-title: Overview\n---\n# defold-typescript\n\n![defold-typescript logo](logo-ver-classic.png#max-width=200)\n\n- [Guide](./getting-started.md)\n- [Anchor](./agent-runbooks.md#add-a-script)\n- [API](/api)\n- [Lua](/api/base)\n`;

    expect(generateRootReadme(source)).toBe(
      `<!-- Generated from packages/docs/guide/README.md by \`bun run readme:sync\`. Do not edit directly. -->\n\n# defold-typescript\n\n<p align="center">\n  <img src="packages/docs/guide/logo-ver-classic.png" alt="defold-typescript logo" width="128" height="128">\n</p>\n\n- [Guide](packages/docs/guide/getting-started.md)\n- [Anchor](packages/docs/guide/agent-runbooks.md#add-a-script)\n- [API](https://defold-typescript.github.io/toolchain/api)\n- [Lua](https://defold-typescript.github.io/toolchain/api/base)\n`,
    );
  });
});
