import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  AVAILABILITY_JSON,
  generateRootReadme,
  ROOT_README,
  readSupportedVersions,
  SOURCE_README,
  supportedVersionsLine,
  withSupportedVersions,
} from "./sync-readme";

// Every markdown link target and `<img src>` in the generated root README, in
// authored order. GitHub resolves each of these from the repository root, so a
// rewrite rule that stops firing leaves a guide-relative path behind that
// resolves to nothing.
function readmeReferences(markdown: string): string[] {
  return [
    ...[...markdown.matchAll(/\]\(([^)\s]+)/g)].map((m) => m[1] as string),
    ...[...markdown.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1] as string),
  ];
}

function isRepoRelative(target: string): boolean {
  return !/^(?:https?:|mailto:)/.test(target) && !target.startsWith("#");
}

function withoutFragment(target: string): string {
  const hash = target.indexOf("#");
  return hash === -1 ? target : target.slice(0, hash);
}

describe("sync-readme", () => {
  test("generates the root README from the guide README", () => {
    const source = readFileSync(SOURCE_README, "utf8");
    const root = readFileSync(ROOT_README, "utf8");

    expect(root).toBe(generateRootReadme(source));
  });

  test("strips frontmatter, points the logo at the repo, and rewrites doc links to the site", () => {
    const source = `---\ntoc-title: Overview\n---\n# defold-typescript\n\n![defold-typescript logo](logo-ver-classic.png#max-width=200)\n\n- [Guide](./getting-started.md)\n- [Anchor](./agent-runbooks.md#add-a-script)\n- [API](/api)\n- [Lua](/api/base)\n- [map](/llms.txt)\n- [corpus](/llms-full.txt)\n`;

    expect(generateRootReadme(source)).toBe(
      `<!-- Generated from packages/docs/guide/README.md by \`bun run readme:sync\`. Do not edit directly. -->\n\n# defold-typescript\n\n<p align="center">\n  <img src="packages/docs/guide/logo-ver-classic.png" alt="defold-typescript logo" width="128" height="128">\n</p>\n\n- [Guide](https://defold-typescript.github.io/toolchain/getting-started)\n- [Anchor](https://defold-typescript.github.io/toolchain/agent-runbooks#add-a-script)\n- [API](https://defold-typescript.github.io/toolchain/api)\n- [Lua](https://defold-typescript.github.io/toolchain/api/base)\n- [map](https://defold-typescript.github.io/toolchain/llms.txt)\n- [corpus](https://defold-typescript.github.io/toolchain/llms-full.txt)\n`,
    );
  });

  test("every path the root README names resolves from the repository root", () => {
    const local = readmeReferences(readFileSync(ROOT_README, "utf8")).filter(isRepoRelative);
    const missing = local.filter((target) => !existsSync(withoutFragment(target)));

    expect(missing).toEqual([]);
  });

  test("the walk reaches at least one reference, and one of them into the guide", () => {
    const local = readmeReferences(readFileSync(ROOT_README, "utf8")).filter(isRepoRelative);

    expect(local.length).toBeGreaterThan(0);
    expect(local.some((target) => target.startsWith("packages/docs/guide/"))).toBe(true);
  });

  test("the guide README lists every Defold version with a complete API surface", () => {
    const source = readFileSync(SOURCE_README, "utf8");
    const versions = readSupportedVersions(readFileSync(AVAILABILITY_JSON, "utf8"));

    expect(versions.length).toBeGreaterThan(0);
    expect(source.split("\n")).toContain(supportedVersionsLine(versions));
  });

  test("orders the supported versions oldest first, numerically", () => {
    expect(
      readSupportedVersions(JSON.stringify({ versions: ["1.13.2", "1.9.10", "1.13.0"] })),
    ).toEqual(["1.9.10", "1.13.0", "1.13.2"]);
  });

  test("rewrites the supported-versions line in place", () => {
    const source = "intro\n\n> Defold versions supported: 1.0.0\n\n> [!NOTE]\n";

    expect(withSupportedVersions(source, ["1.12.4", "1.13.2"])).toBe(
      "intro\n\n> Defold versions supported: 1.12.4, 1.13.2\n\n> [!NOTE]\n",
    );
    expect(() => withSupportedVersions("intro\n", ["1.13.2"])).toThrow();
  });
});
