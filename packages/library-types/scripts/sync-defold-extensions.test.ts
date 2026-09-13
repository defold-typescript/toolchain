import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assignPageKeys,
  type DefoldGitHub,
  type GitHubRepo,
  isDefoldLibrary,
  loadReservedNamespaces,
  type ReservedNamespaces,
  selectPin,
  syncDefoldExtensions,
} from "./sync-defold-extensions";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

let reserved: ReservedNamespaces;
beforeAll(async () => {
  reserved = await loadReservedNamespaces(PACKAGE_ROOT);
});

function repo(name: string, overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    name,
    archived: false,
    fork: false,
    description: `${name} description`,
    license: { spdx_id: "MIT" },
    default_branch: "main",
    ...overrides,
  };
}

const neverRead = async (): Promise<string | null> => {
  throw new Error("game.project must not be read");
};

describe("selectPin", () => {
  test("prefers the latest release tag", () => {
    expect(
      selectPin({
        latestRelease: { tag_name: "8.4.0" },
        tags: [{ name: "9.0.0" }],
        headSha: "abc",
      }),
    ).toEqual({ ref: "8.4.0", refKind: "release" });
  });

  test("falls back to the newest tag when there is no release", () => {
    expect(
      selectPin({
        latestRelease: null,
        tags: [{ name: "1.0.0" }, { name: "0.9.0" }],
        headSha: "abc",
      }),
    ).toEqual({ ref: "1.0.0", refKind: "tag" });
  });

  test("falls back to the default-branch HEAD SHA when there is neither", () => {
    expect(selectPin({ latestRelease: null, tags: [], headSha: "abc123" })).toEqual({
      ref: "abc123",
      refKind: "commit",
    });
  });
});

describe("isDefoldLibrary", () => {
  test("rejects archived and fork repos", async () => {
    expect(await isDefoldLibrary(repo("extension-iap", { archived: true }), neverRead)).toBe(false);
    expect(await isDefoldLibrary(repo("extension-iap", { fork: true }), neverRead)).toBe(false);
  });

  test("rejects sample, template, tutorial, example, game, test and demo repos", async () => {
    for (const prefix of [
      "sample-",
      "template-",
      "tutorial-",
      "example-",
      "game-",
      "test-",
      "demo-",
    ]) {
      const gameProject = async () => "[library]\ninclude_dirs = lib\n";
      expect(await isDefoldLibrary(repo(`${prefix}thing`), gameProject)).toBe(false);
    }
  });

  test("accepts an extension repo without reading game.project", async () => {
    expect(await isDefoldLibrary(repo("extension-camera"), neverRead)).toBe(true);
  });

  test("accepts a non-extension repo only when [library] declares include_dirs", async () => {
    const declared = async () => "[project]\ntitle = pbr\n\n[library]\ninclude_dirs = pbr\n";
    const otherSection = async () => "[project]\ninclude_dirs = pbr\n\n[library]\n";
    const empty = async () => "[library]\ninclude_dirs =\n";
    const missing = async () => null;
    expect(await isDefoldLibrary(repo("asset-pbr"), declared)).toBe(true);
    expect(await isDefoldLibrary(repo("asset-pbr"), otherSection)).toBe(false);
    expect(await isDefoldLibrary(repo("asset-pbr"), empty)).toBe(false);
    expect(await isDefoldLibrary(repo("defold"), missing)).toBe(false);
  });
});

describe("assignPageKeys", () => {
  const entry = (name: string, namespaces: string[]) => ({
    repo: `https://github.com/defold/${name}`,
    docs: namespaces.map((namespace) => ({ path: `api/${namespace}.script_api`, namespace })),
  });

  test("keys survey-shaped repos uniquely without shadowing a live engine page", () => {
    const keyed = assignPageKeys(
      [
        entry("extension-iap", ["iap"]),
        entry("extension-camera", ["camera"]),
        entry("extension-spine", ["spine", "gui", "resource"]),
        entry("extension-firebase", ["firebase"]),
        entry("extension-firebase-analytics", ["firebase"]),
        entry("extension-firebase-crashlytics", ["firebase"]),
        entry("extension-firebase-remoteconfig", ["firebase"]),
        entry("extension-admob", ["admob"]),
        entry("extension-proto", ["proto"]),
      ],
      reserved,
    );
    const keys = Object.fromEntries(
      keyed.map((e) => [e.repo.split("/").at(-1), e.docs.map((d) => d.page)]),
    );
    expect(keys).toEqual({
      "extension-iap": ["iap"],
      "extension-camera": ["extension-camera"],
      "extension-spine": ["spine", "spine.gui", "spine.resource"],
      "extension-firebase": ["firebase"],
      "extension-firebase-analytics": ["firebase-analytics"],
      "extension-firebase-crashlytics": ["firebase-crashlytics"],
      "extension-firebase-remoteconfig": ["firebase-remoteconfig"],
      "extension-admob": ["admob"],
      "extension-proto": ["extension-proto"],
    });
  });

  test("the reserved sets are the real ones: camera is live, iap is moved, proto is vendored", () => {
    expect(reserved.libraryNamespaces.has("proto")).toBe(true);
    expect(reserved.engineNamespaces.has("camera")).toBe(true);
    expect(reserved.movedNamespaces.has("camera")).toBe(false);
    expect([...reserved.movedNamespaces].sort()).toEqual(["iac", "iap", "push", "webview"]);
  });

  test("two docs resolving to one key throw naming both", () => {
    expect(() =>
      assignPageKeys([entry("extension-foo", ["foo"]), entry("extension-bar", ["foo"])], reserved),
    ).not.toThrow();
    expect(() => assignPageKeys([entry("extension-foo", ["foo", "foo"])], reserved)).toThrow(
      /extension-foo.*api\/foo\.script_api.*extension-foo.*api\/foo\.script_api/,
    );
    expect(() =>
      assignPageKeys(
        [entry("extension-a", ["z"]), entry("extension-b", ["z"]), entry("extension-c", ["a"])],
        reserved,
      ),
    ).toThrow(/extension-a\/.*extension-c\/|extension-c\/.*extension-a\//);
  });
});

const SCRIPT_API = (namespace: string) =>
  `- name: ${namespace}\n  type: table\n  desc: ${namespace} functions\n  members:\n  - name: init\n    type: function\n    desc: Initialize.\n`;

function fakeGitHub(): { github: DefoldGitHub; fetched: string[] } {
  const fetched: string[] = [];
  const repos: GitHubRepo[] = [
    repo("extension-iap", { license: { spdx_id: "Apache-2.0" } }),
    repo("extension-proto", { license: null, description: null }),
    repo("extension-rive"),
    repo("sample-thing"),
    repo("asset-pbr"),
    repo("defold"),
  ];
  const trees: Record<string, string[]> = {
    "extension-iap@8.4.0": ["README.md", "extension-iap/api/iap.script_api"],
    "extension-proto@deadbeef": ["proto/api/proto.script_api"],
    "extension-rive@13.1.0": ["defold-rive/api/rive.script_api"],
    "asset-pbr@main-sha": ["pbr/pbr.lua"],
  };
  const github: DefoldGitHub = {
    listRepos: async () => repos,
    gameProject: async (name) => (name === "asset-pbr" ? "[library]\ninclude_dirs = pbr\n" : null),
    latestRelease: async (name) => (name === "extension-iap" ? { tag_name: "8.4.0" } : null),
    tags: async (name) => (name === "extension-rive" ? [{ name: "13.1.0" }] : []),
    headSha: async (name) => (name === "extension-proto" ? "deadbeef" : "main-sha"),
    tree: async (name, ref) => trees[`${name}@${ref}`] ?? [],
    fetchText: async (url) => {
      fetched.push(url);
      const namespace = url.split("/").at(-1)?.replace(".script_api", "") ?? "";
      if (namespace === "rive") return `${SCRIPT_API("rive")}\n#****\n\n${SCRIPT_API("rive.cmd")}`;
      return SCRIPT_API(namespace);
    },
  };
  return { github, fetched };
}

describe("syncDefoldExtensions", () => {
  test("writes a sorted manifest and one api-doc per doc, fetched at the pin", async () => {
    const out = mkdtempSync(join(tmpdir(), "defold-extensions-"));
    const { github, fetched } = fakeGitHub();
    await syncDefoldExtensions(out, github, reserved);

    expect(fetched.sort()).toEqual([
      "https://raw.githubusercontent.com/defold/extension-iap/8.4.0/extension-iap/api/iap.script_api",
      "https://raw.githubusercontent.com/defold/extension-proto/deadbeef/proto/api/proto.script_api",
      "https://raw.githubusercontent.com/defold/extension-rive/13.1.0/defold-rive/api/rive.script_api",
    ]);

    const manifest = JSON.parse(readFileSync(join(out, "defold-extensions.json"), "utf8"));
    expect(manifest).toEqual({
      libraries: [
        {
          repo: "https://github.com/defold/asset-pbr",
          ref: "main-sha",
          refKind: "commit",
          license: "MIT",
          description: "asset-pbr description",
          docs: [],
        },
        {
          repo: "https://github.com/defold/extension-iap",
          ref: "8.4.0",
          refKind: "release",
          license: "Apache-2.0",
          description: "extension-iap description",
          docs: [{ path: "extension-iap/api/iap.script_api", namespace: "iap", page: "iap" }],
        },
        {
          repo: "https://github.com/defold/extension-proto",
          ref: "deadbeef",
          refKind: "commit",
          license: "",
          description: "",
          docs: [
            { path: "proto/api/proto.script_api", namespace: "proto", page: "extension-proto" },
          ],
        },
        {
          repo: "https://github.com/defold/extension-rive",
          ref: "13.1.0",
          refKind: "tag",
          license: "MIT",
          description: "extension-rive description",
          docs: [
            { path: "defold-rive/api/rive.script_api", namespace: "rive", page: "rive" },
            { path: "defold-rive/api/rive.script_api", namespace: "rive.cmd", page: "rive.cmd" },
          ],
        },
      ],
    });

    const iapDoc = JSON.parse(
      readFileSync(join(out, "defold-extensions", "api-doc", "iap.json"), "utf8"),
    );
    expect(iapDoc.info.namespace).toBe("iap");
    expect(iapDoc.elements.map((e: { name: string }) => e.name)).toContain("iap.init");
    const riveCmd = JSON.parse(
      readFileSync(join(out, "defold-extensions", "api-doc", "rive.cmd.json"), "utf8"),
    );
    expect(riveCmd.elements.map((e: { name: string }) => e.name)).toEqual(["rive.cmd.init"]);
  });
});
