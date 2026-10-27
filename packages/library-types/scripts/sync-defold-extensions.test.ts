import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assignPageKeys,
  type DefoldGitHub,
  earliestDate,
  fetchDefoldExtensions,
  type GitHubRepo,
  isDefoldLibrary,
  libraryIncludeDirs,
  loadReservedNamespaces,
  type ReservedNamespaces,
  reconvertDefoldExtensions,
  selectPin,
  syncDefoldExtensions,
  syncDefoldReleaseDates,
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

describe("libraryIncludeDirs", () => {
  test("splits on commas and whitespace and strips leading and trailing slashes", () => {
    expect(
      libraryIncludeDirs("[library]\ninclude_dirs = monarch, /monarch/transitions/\n"),
    ).toEqual(["monarch", "monarch/transitions"]);
  });

  test("reads only the [library] section", () => {
    expect(libraryIncludeDirs("[project]\ninclude_dirs = pbr\n\n[library]\n")).toEqual([]);
  });

  test("an empty value exports nothing", () => {
    expect(libraryIncludeDirs("[library]\ninclude_dirs =\n")).toEqual([]);
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

  test("the reserved sets are the real ones: camera is live, iap is no engine page, proto is vendored", () => {
    expect(reserved.libraryNamespaces.has("proto")).toBe(true);
    expect(reserved.engineNamespaces.has("camera")).toBe(true);
    expect(reserved.engineNamespaces.has("iap")).toBe(false);
  });

  test("a defold- repo keys by its stem without the prefix, which the version routes own", () => {
    const keyed = assignPageKeys(
      [entry("defold-rng", ["rnd"]), entry("defold-random", ["rnd"]), entry("defold-ui", ["gui"])],
      reserved,
    );
    expect(keyed.flatMap((e) => e.docs.map((d) => d.page))).toEqual(["rng", "random", "ui.gui"]);
  });

  test("a key that would still start with defold- throws naming the doc and the label", () => {
    expect(() => assignPageKeys([entry("defold-gui", ["gui"])], reserved, "portal")).toThrow(
      /^portal: page key "defold-gui" from defold\/defold-gui\/api\/gui\.script_api \(gui\)/,
    );
    expect(() => assignPageKeys([entry("extension-x", ["defold-x"])], reserved)).toThrow(
      /^defold-extensions: page key "defold-x"/,
    );
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

const WITH_CONSTANT = (namespace: string) =>
  `${SCRIPT_API(namespace)}  - name: PROVIDER_ID\n    type: number\n`;

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
    releaseByTag: async (name, tag) =>
      name === "extension-iap" && tag === "8.4.0" ? { published_at: "2024-03-02T00:00:00Z" } : null,
    commitDate: async (name, ref) =>
      name === "extension-rive" && ref === "13.1.0"
        ? "2024-05-06T00:00:00Z"
        : "2024-01-01T00:00:00Z",
    engineTags: async () => [],
    fetchText: async (url) => {
      fetched.push(url);
      const namespace = url.split("/").at(-1)?.replace(".script_api", "") ?? "";
      if (namespace === "rive") return `${SCRIPT_API("rive")}\n#****\n\n${SCRIPT_API("rive.cmd")}`;
      if (namespace === "iap") return WITH_CONSTANT("iap");
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
    expect(iapDoc.elements).toContainEqual({
      type: "CONSTANT",
      name: "iap.PROVIDER_ID",
      brief: "",
      description: "",
      types: ["number"],
    });
    const riveCmd = JSON.parse(
      readFileSync(join(out, "defold-extensions", "api-doc", "rive.cmd.json"), "utf8"),
    );
    expect(riveCmd.elements.map((e: { name: string }) => e.name)).toEqual(["rive.cmd.init"]);
  });
});

function readApiDoc(
  root: string,
  page: string,
): { info: { namespace: string }; elements: unknown[] } {
  return JSON.parse(
    readFileSync(join(root, "defold-extensions", "api-doc", `${page}.json`), "utf8"),
  );
}

function stagePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "defold-extensions-reconvert-"));
  const manifest = {
    libraries: [
      {
        repo: "https://github.com/defold/extension-proto",
        ref: "deadbeef",
        refKind: "commit",
        license: "",
        description: "",
        docs: [{ path: "proto/api/proto.script_api", namespace: "proto", page: "extension-proto" }],
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
  };
  // Deliberately not the sync's own formatting, so a rewrite is observable.
  writeFileSync(join(root, "defold-extensions.json"), JSON.stringify(manifest));
  const apiDocDir = join(root, "defold-extensions", "api-doc");
  mkdirSync(apiDocDir, { recursive: true });
  for (const page of ["extension-proto", "rive", "rive.cmd"]) {
    writeFileSync(
      join(apiDocDir, `${page}.json`),
      '{"info":{"namespace":"stale"},"elements":[]}\n',
    );
  }
  return root;
}

describe("reconvertDefoldExtensions", () => {
  test("rewrites every api-doc page at the manifest pins and leaves the manifest untouched", async () => {
    const root = stagePackageRoot();
    const manifestBefore = readFileSync(join(root, "defold-extensions.json"), "utf8");
    const fetched: string[] = [];
    await reconvertDefoldExtensions(root, async (url) => {
      fetched.push(url);
      if (url.endsWith("rive.script_api")) {
        return `${SCRIPT_API("rive")}\n#****\n\n${WITH_CONSTANT("rive.cmd")}`;
      }
      return WITH_CONSTANT("proto");
    });

    expect([...new Set(fetched)].sort()).toEqual([
      "https://raw.githubusercontent.com/defold/extension-proto/deadbeef/proto/api/proto.script_api",
      "https://raw.githubusercontent.com/defold/extension-rive/13.1.0/defold-rive/api/rive.script_api",
    ]);
    expect(readFileSync(join(root, "defold-extensions.json"), "utf8")).toBe(manifestBefore);

    const proto = readApiDoc(root, "extension-proto");
    expect(proto.info.namespace).toBe("proto");
    expect(proto.elements.map((e) => (e as { name: string }).name)).toEqual([
      "proto.init",
      "proto.PROVIDER_ID",
    ]);
    const rive = readApiDoc(root, "rive");
    expect(rive.info.namespace).toBe("rive");
    expect(rive.elements.map((e) => (e as { name: string }).name)).toEqual(["rive.init"]);
    const riveCmd = readApiDoc(root, "rive.cmd");
    expect(riveCmd.info.namespace).toBe("rive.cmd");
    expect(riveCmd.elements).toContainEqual({
      type: "CONSTANT",
      name: "rive.cmd.PROVIDER_ID",
      brief: "",
      description: "",
      types: ["number"],
    });
  });

  test("throws naming the repo, ref and namespace when a pinned doc no longer declares it", async () => {
    const root = stagePackageRoot();
    const reconvert = reconvertDefoldExtensions(root, async (url) =>
      url.endsWith("rive.script_api") ? SCRIPT_API("rive") : SCRIPT_API("proto"),
    );
    await expect(reconvert).rejects.toThrow(/extension-rive.*13\.1\.0.*rive\.cmd/);
  });
});

interface DatesCalls {
  pinned: string[];
}

// Raw GitHub-shaped answers keyed `<repo>@<ref>`: a release's `published_at`
// and the tagged commit's committer date.
function datesGitHub(input: {
  releases: Record<string, string>;
  commits: Record<string, string>;
  engineTags: string[];
}): { github: DefoldGitHub; calls: DatesCalls } {
  const calls: DatesCalls = { pinned: [] };
  const refuse = async (): Promise<never> => {
    throw new Error("the dates pass must not choose a pin");
  };
  const github: DefoldGitHub = {
    listRepos: refuse,
    gameProject: refuse,
    latestRelease: refuse,
    tags: refuse,
    headSha: refuse,
    tree: refuse,
    fetchText: refuse,
    releaseByTag: async (name, tag) => {
      calls.pinned.push(`release ${name}@${tag}`);
      const published = input.releases[`${name}@${tag}`];
      return published === undefined ? null : { published_at: published };
    },
    commitDate: async (name, ref) => {
      calls.pinned.push(`commit ${name}@${ref}`);
      const date = input.commits[`${name}@${ref}`];
      if (date === undefined) throw new Error(`no commit ${name}@${ref}`);
      return date;
    },
    engineTags: async () => input.engineTags,
  };
  return { github, calls };
}

function stageDatesRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "defold-extensions-dates-"));
  const manifest = {
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
        repo: "https://github.com/defold/extension-admob",
        ref: "3.0.0",
        refKind: "release",
        license: "MIT",
        description: "",
        docs: [],
      },
      {
        repo: "https://github.com/defold/extension-rive",
        ref: "13.1.0",
        refKind: "tag",
        license: "MIT",
        description: "extension-rive description",
        docs: [{ path: "defold-rive/api/rive.script_api", namespace: "rive", page: "rive" }],
      },
    ],
  };
  writeFileSync(join(root, "defold-extensions.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const apiDocDir = join(root, "defold-extensions", "api-doc");
  mkdirSync(apiDocDir, { recursive: true });
  for (const page of ["iap", "rive"]) {
    writeFileSync(join(apiDocDir, `${page}.json`), `{"info":{"namespace":"${page}"}}\n`);
  }
  return root;
}

const PIN_DATES = {
  releases: {
    // Published after its tagged commit: the commit date wins.
    "extension-iap@8.4.0": "2024-06-01T10:00:00Z",
    // Published before its tagged commit (the tag moved): the publish date wins.
    "extension-admob@3.0.0": "2023-02-01T10:00:00Z",
    // A tag pin ignores its release even when it is earlier than the tagged commit.
    "extension-rive@13.1.0": "2024-01-01T00:00:00Z",
  },
  commits: {
    "extension-iap@8.4.0": "2024-03-02T09:00:00Z",
    "extension-admob@3.0.0": "2023-05-05T10:00:00Z",
    "extension-rive@13.1.0": "2024-07-07T07:00:00Z",
  },
};

function readManifest(root: string): { libraries: Record<string, unknown>[] } {
  return JSON.parse(readFileSync(join(root, "defold-extensions.json"), "utf8"));
}

function byRepo(root: string): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    readManifest(root).libraries.map((entry) => [String(entry.repo).split("/").at(-1), entry]),
  );
}

describe("earliestDate", () => {
  test("picks the earlier instant, skipping missing dates", () => {
    expect(earliestDate("2024-06-01T10:00:00Z", "2024-03-02T09:00:00Z")).toBe(
      "2024-03-02T09:00:00Z",
    );
    expect(earliestDate(null, "2024-03-02T09:00:00Z")).toBe("2024-03-02T09:00:00Z");
    expect(earliestDate(null, null)).toBeUndefined();
  });
});

describe("syncDefoldReleaseDates", () => {
  test("dates release pins by the earlier of publish and commit, tag pins by commit, commit pins not at all", async () => {
    const root = stageDatesRoot();
    const { github, calls } = datesGitHub({ ...PIN_DATES, engineTags: [] });
    await syncDefoldReleaseDates(root, github);

    const entries = byRepo(root);
    expect(entries["extension-iap"]?.refDate).toBe("2024-03-02T09:00:00Z");
    expect(entries["extension-admob"]?.refDate).toBe("2023-02-01T10:00:00Z");
    expect(entries["extension-rive"]?.refDate).toBe("2024-07-07T07:00:00Z");
    expect(entries["asset-pbr"]).not.toHaveProperty("refDate");
    expect(calls.pinned).not.toContain("release extension-rive@13.1.0");
  });

  test("adds only refDate lines, right after refKind, reads the committed pins and touches no api-doc", async () => {
    const root = stageDatesRoot();
    const manifestBefore = readFileSync(join(root, "defold-extensions.json"), "utf8");
    const apiDocDir = join(root, "defold-extensions", "api-doc");
    const docsBefore = readdirSync(apiDocDir).map((f) => [f, readFileSync(join(apiDocDir, f))]);
    const { github, calls } = datesGitHub({ ...PIN_DATES, engineTags: [] });
    await syncDefoldReleaseDates(root, github);

    const manifestAfter = readFileSync(join(root, "defold-extensions.json"), "utf8");
    expect(manifestAfter.replace(/^ {6}"refDate": "[^"]*",\n/gm, "")).toBe(manifestBefore);
    for (const entry of readManifest(root).libraries) {
      const keys = Object.keys(entry);
      if (entry.refDate !== undefined) {
        expect(keys[keys.indexOf("refKind") + 1]).toBe("refDate");
      }
    }
    expect(readdirSync(apiDocDir).map((f) => [f, readFileSync(join(apiDocDir, f))])).toEqual(
      docsBefore,
    );
    expect(calls.pinned).not.toContain("commit asset-pbr@main-sha");
    expect(calls.pinned).not.toContain("release asset-pbr@main-sha");
  });

  test("a second run re-dates in place without duplicating the key", async () => {
    const root = stageDatesRoot();
    const { github } = datesGitHub({ ...PIN_DATES, engineTags: [] });
    await syncDefoldReleaseDates(root, github);
    const once = readFileSync(join(root, "defold-extensions.json"), "utf8");
    await syncDefoldReleaseDates(root, github);
    expect(readFileSync(join(root, "defold-extensions.json"), "utf8")).toBe(once);
  });

  test("writes every X.Y.Z engine tag newest first, dated by the earlier rule", async () => {
    const root = stageDatesRoot();
    const { github } = datesGitHub({
      releases: {
        ...PIN_DATES.releases,
        // Backfilled long after its commit: the commit date wins.
        "defold@1.2.163": "2020-04-20T00:00:00Z",
        // Tag moved after publishing: the publish date wins.
        "defold@1.14.0": "2025-07-01T00:00:00Z",
        "defold@1.9.1-beta": "2024-07-01T00:00:00Z",
      },
      commits: {
        ...PIN_DATES.commits,
        "defold@1.2.163": "2019-12-01T00:00:00Z",
        "defold@1.14.0": "2025-07-09T00:00:00Z",
        "defold@1.2.1": "2016-01-01T00:00:00Z",
        "defold@1.9.1-beta": "2024-06-20T00:00:00Z",
        "defold@stable": "2025-08-01T00:00:00Z",
      },
      engineTags: ["1.2.1", "1.14.0", "1.9.1-beta", "stable", "1.2.163"],
    });
    await syncDefoldReleaseDates(root, github);

    expect(JSON.parse(readFileSync(join(root, "defold-engine-releases.json"), "utf8"))).toEqual({
      releases: [
        { version: "1.14.0", date: "2025-07-01T00:00:00Z" },
        { version: "1.2.163", date: "2019-12-01T00:00:00Z" },
        { version: "1.2.1", date: "2016-01-01T00:00:00Z" },
      ],
    });
  });
});

describe("fetchDefoldExtensions", () => {
  test("a resurvey leaves every release and tag pin dated", async () => {
    const out = mkdtempSync(join(tmpdir(), "defold-extensions-fetch-"));
    const { github } = fakeGitHub();
    await fetchDefoldExtensions(out, github, reserved);

    const entries = byRepo(out);
    expect(entries["extension-iap"]?.refDate).toBe("2024-01-01T00:00:00Z");
    expect(entries["extension-rive"]?.refDate).toBe("2024-05-06T00:00:00Z");
    expect(entries["extension-proto"]).not.toHaveProperty("refDate");
    expect(entries["asset-pbr"]).not.toHaveProperty("refDate");
  });
});
