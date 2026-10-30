import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A library-types root whose only targets are authored forks, one per module, so a
// `resolve` test names the modules a fake dependency confirms and the exact bytes
// each one prints, without the real corpus.
export function writeAuthoredLibraryData(forks: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "defold-typescript-library-data-"));
  const targets = Object.entries(forks).map(([moduleId, contents]) => {
    const authored = `fixtures/authored/${moduleId}.d.ts`;
    mkdirSync(join(root, "fixtures", "authored"), { recursive: true });
    writeFileSync(join(root, authored), contents);
    return {
      repo: `https://github.com/owner/${moduleId.split(".")[0]}`,
      ref: "1.0.0",
      authored,
      moduleId,
      namespace: moduleId,
      apiDoc: `api-doc/${moduleId}.json`,
      upstreamLua: [`fixtures/upstream-lua/${moduleId}.lua`],
    };
  });
  writeFileSync(join(root, "authored-targets.json"), JSON.stringify({ targets }));
  writeFileSync(join(root, "luals-targets.json"), JSON.stringify({ targets: [] }));
  writeFileSync(join(root, "script-api-targets.json"), JSON.stringify({ targets: [] }));
  return root;
}
