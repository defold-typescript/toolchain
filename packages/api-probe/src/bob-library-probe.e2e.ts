import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { type BobCommandResult, defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import {
  DEFOLD_DEPENDENCIES_MANIFEST,
  DEFOLD_LIBRARY_DIR,
  findDefoldBuildArchive,
} from "../../cli/src/defold-library-cache";
import { BUILD_SERVER, engineHead } from "./run-probe";
import { probeTarget } from "./witness";

// `resolve --frozen` reads Bob's library folder, whose shape no document states.
const COMMIT = "5c33c39830489925493163e741d5b22b4e5e3b9d";
const COMMIT_URL = `https://github.com/britzl/monarch/archive/${COMMIT}.zip`;
const BRANCH_URL = "https://github.com/Insality/druid/archive/refs/heads/master.zip";
const RELEASE_URL =
  "https://github.com/defold-typescript/toolchain/releases/download/lldebugger-v1/lldebugger.zip";
const URLS = [COMMIT_URL, BRANCH_URL, RELEASE_URL];
const SETUP_TIMEOUT = 300_000;

const head = engineHead(probeTarget());

function project(): string {
  const cwd = mkdtempSync(join(tmpdir(), "defold-bob-library-probe-"));
  writeFileSync(
    join(cwd, "game.project"),
    `[project]\ntitle = bob-library-probe\n${URLS.map((url, i) => `dependencies#${i} = ${url}`).join("\n")}\n`,
  );
  return cwd;
}

function bob(cwd: string, subcommand: "resolve" | "build"): Promise<BobCommandResult> {
  return runBobCommand({
    cwd,
    subcommand,
    capture: true,
    head,
    io: defaultDefoldIo(),
    buildServer: BUILD_SERVER,
  });
}

describe("bob library folder", () => {
  const cwd = project();
  const lib = join(cwd, DEFOLD_LIBRARY_DIR);
  let resolved: BobCommandResult;
  let buildWithNoFolder: BobCommandResult;
  let folderAfterBuild: boolean;

  const listedCommit = (url: string): unknown => {
    const manifest = JSON.parse(readFileSync(join(cwd, DEFOLD_DEPENDENCIES_MANIFEST), "utf8")) as {
      url: string;
      "commit-sha1": unknown;
    }[];
    return manifest.find((entry) => entry.url === url)?.["commit-sha1"];
  };

  const zipsOf = (url: string): string[] => {
    const prefix = `${createHash("sha1").update(url).digest("hex")}-`;
    return readdirSync(lib).filter((name) => name.startsWith(prefix) && name.endsWith(".zip"));
  };

  beforeAll(async () => {
    buildWithNoFolder = await bob(cwd, "build");
    folderAfterBuild = existsSync(lib);
    resolved = await bob(cwd, "resolve");
  }, SETUP_TIMEOUT);

  test("bob build with no library folder fails without fetching", () => {
    expect(buildWithNoFolder.ok).toBe(false);
    expect(buildWithNoFolder.output ?? "").toContain("Missing libraries folder");
    expect(folderAfterBuild).toBe(false);
  });

  test("bob resolve lists each URL with what it resolved to", () => {
    expect(resolved.ok, resolved.output ?? "").toBe(true);
    expect(listedCommit(COMMIT_URL)).toBe(COMMIT);
    expect(listedCommit(BRANCH_URL)).toMatch(/^[0-9a-f]{40}$/);
    expect(listedCommit(RELEASE_URL)).toBe("");
  });

  test.each(URLS)(
    "%s lands in one zip under the URL's sha1, its comment the listed commit",
    (url) => {
      const zips = zipsOf(url);
      expect(zips).toHaveLength(1);
      expect(readZip(join(lib, zips[0] as string)).comment()).toBe(listedCommit(url) as string);
    },
  );

  test.each(URLS)("the gate reads what bob wrote for %s", async (url) => {
    expect(await findDefoldBuildArchive(cwd, url, readZip)).toEqual({
      path: join(lib, zipsOf(url)[0] as string),
    });
  });
});
