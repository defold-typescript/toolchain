import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { PROPERTY_KEY_RANGES, type PropertyKeyRange } from "../src/emit-dts";
import { enginePinHolds } from "./binding-pin";
import {
  authenticateEvidence,
  bindingsDir,
  type EngineBindingManifest,
  type EngineBlobId,
  type EngineEvidenceManifest,
  engineEvidencePaths,
  evidenceBlobIds,
  evidenceDir,
  gitBlobSha,
  selectBindingPaths,
  sha256,
  syncEvidence,
  targetTag,
  vendoredTargets,
} from "./sync-engine-bindings";

const TREE_FIXTURE = resolve(
  import.meta.dir,
  "..",
  "test",
  "fixtures",
  "defold-1.13.1-engine-cpp-tree.txt",
);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

describe("selectBindingPaths", () => {
  const selected = selectBindingPaths(readFileSync(TREE_FIXTURE, "utf8").trim().split("\n"));

  test("keeps every binding source vendored for 1.13.1", () => {
    const target = vendoredTargets().find((t) => t.id === "defold-1.13.1");
    if (!target) throw new Error("defold-1.13.1 is not a vendored target");
    const manifest = JSON.parse(
      readFileSync(join(bindingsDir(target), "manifest.json"), "utf8"),
    ) as EngineBindingManifest;
    const vendored = manifest.files.map((file) => file.path);
    expect(vendored.length).toBeGreaterThan(0);
    expect(vendored.filter((path) => !selected.includes(path))).toEqual([]);
  });

  test("drops test sources and platform stubs", () => {
    expect(selected.filter((path) => path.includes("/test/"))).toEqual([]);
    expect(selected.filter((path) => /_(null|android)\.cpp$/.test(path))).toEqual([]);
    expect(selected).not.toContain("engine/profiler/src/profiler_null.cpp");
    expect(selected).not.toContain("engine/crash/src/script_crash_null.cpp");
  });
});

describe("vendored engine bindings", () => {
  for (const target of vendoredTargets()) {
    test(`${target.id} files match manifest.json`, () => {
      const dir = bindingsDir(target);
      const manifest = JSON.parse(
        readFileSync(join(dir, "manifest.json"), "utf8"),
      ) as EngineBindingManifest;
      expect(manifest.tag).toBe(target.id.replace(/^defold-/, ""));
      const onDisk = listFiles(dir)
        .filter((path) => path !== "manifest.json")
        .sort();
      expect(onDisk).toEqual(manifest.files.map((file) => file.path).sort());
      for (const file of manifest.files) {
        expect({ path: file.path, sha256: sha256(readFileSync(join(dir, file.path))) }).toEqual({
          path: file.path,
          sha256: file.sha256,
        });
      }
    });
  }
});

describe("vendored engine evidence", () => {
  for (const target of vendoredTargets()) {
    test(`${target.id} evidence is the pinned files, unedited, from the bindings commit`, () => {
      const dir = evidenceDir(target);
      const manifest = JSON.parse(
        readFileSync(join(dir, "manifest.json"), "utf8"),
      ) as EngineEvidenceManifest;
      const bindings = JSON.parse(
        readFileSync(join(bindingsDir(target), "manifest.json"), "utf8"),
      ) as EngineBindingManifest;
      expect(manifest.tag).toBe(targetTag(target));
      expect(manifest.commit).toBe(bindings.commit);
      expect(bindings.evidence.map((file) => file.path)).toEqual(engineEvidencePaths());
      const paths = manifest.files.map((file) => file.path).sort();
      expect(paths).toEqual(engineEvidencePaths());
      const onDisk = listFiles(dir)
        .filter((path) => path !== "manifest.json")
        .sort();
      expect(onDisk).toEqual(paths);
      for (const file of manifest.files) {
        const bytes = readFileSync(join(dir, file.path));
        expect({
          path: file.path,
          sha256: sha256(bytes),
          blobSha: authenticateEvidence(target, bindings, file.path, bytes),
        }).toEqual({ path: file.path, sha256: file.sha256, blobSha: file.blobSha });
      }
    });
  }
});

describe("syncEvidence", () => {
  const RAW = "https://raw.githubusercontent.com/defold/defold";
  const SENTINEL = '{ "sentinel": true }\n';
  const paths = engineEvidencePaths();
  const targets = vendoredTargets();
  const committed = (target: (typeof targets)[number], path: string): Uint8Array =>
    readFileSync(join(evidenceDir(target), path));
  const enginePins = [...PROPERTY_KEY_RANGES.values()].flatMap((range) => range.engine?.pins ?? []);
  const holder = targets.find((target) =>
    enginePins.every((pin) => enginePinHolds(target.id, pin)),
  );
  if (!holder) throw new Error("no vendored target holds every engine pin");
  const target = targets.find(
    (t) =>
      t !== holder &&
      paths.some((path) => !Buffer.from(committed(t, path)).equals(committed(holder, path))),
  );
  if (!target) throw new Error(`no vendored target's evidence differs from ${holder.id}'s`);
  const { commit } = JSON.parse(
    readFileSync(join(bindingsDir(target), "manifest.json"), "utf8"),
  ) as EngineBindingManifest;
  const recorded: EngineBlobId[] = paths.map((path) => ({
    path,
    blobSha: gitBlobSha(committed(target, path)),
  }));
  const url = (path: string) => `${RAW}/${commit}/${path}`;

  let root: string;
  let requested: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sync-evidence-"));
    requested = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const stage = (evidence: readonly EngineBlobId[], served: ReadonlyMap<string, Uint8Array>) => {
    const bindings: EngineBindingManifest = { tag: targetTag(target), commit, files: [], evidence };
    mkdirSync(bindingsDir(target, root), { recursive: true });
    writeFileSync(join(bindingsDir(target, root), "manifest.json"), JSON.stringify(bindings));
    mkdirSync(evidenceDir(target, root), { recursive: true });
    writeFileSync(join(evidenceDir(target, root), "manifest.json"), SENTINEL);
    const byUrl = new Map([...served].map(([path, bytes]) => [url(path), bytes] as const));
    return spyOn(globalThis, "fetch").mockImplementation((async (input: string | URL | Request) => {
      const href = input instanceof Request ? input.url : String(input);
      requested.push(href);
      const bytes = byUrl.get(href);
      return bytes ? new Response(bytes) : new Response("not found", { status: 404 });
    }) as typeof fetch);
  };

  const expectUntouched = () => {
    const dir = evidenceDir(target, root);
    expect(listFiles(dir)).toEqual(["manifest.json"]);
    expect(readFileSync(join(dir, "manifest.json"), "utf8")).toBe(SENTINEL);
  };

  test("rejects bytes from another commit and writes nothing", async () => {
    const differing = paths.find(
      (path) => !Buffer.from(committed(target, path)).equals(committed(holder, path)),
    ) as string;
    const spy = stage(recorded, new Map(paths.map((path) => [path, committed(holder, path)])));
    try {
      await expect(syncEvidence(target, root)).rejects.toThrow(
        `${target.id}: ${differing}: blob ${gitBlobSha(committed(holder, differing))} is not ${gitBlobSha(committed(target, differing))} at ${commit}`,
      );
    } finally {
      spy.mockRestore();
    }
    expectUntouched();
  });

  test("writes bytes whose blob ids match the recorded ids, fetched at the commit only", async () => {
    const served = new Map(paths.map((path) => [path, committed(target, path)]));
    const spy = stage(recorded, served);
    let manifest: EngineEvidenceManifest;
    try {
      manifest = await syncEvidence(target, root);
    } finally {
      spy.mockRestore();
    }
    const dir = evidenceDir(target, root);
    expect(listFiles(dir).sort()).toEqual([...paths, "manifest.json"].sort());
    for (const path of paths) {
      expect({ path, bytes: Buffer.from(readFileSync(join(dir, path))).toString("hex") }).toEqual({
        path,
        bytes: Buffer.from(served.get(path) as Uint8Array).toString("hex"),
      });
    }
    const expected: EngineEvidenceManifest = {
      tag: targetTag(target),
      commit,
      files: recorded.map(({ path, blobSha }) => ({
        path,
        blobSha,
        sha256: sha256(served.get(path) as Uint8Array),
      })),
    };
    expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))).toEqual(expected);
    expect(manifest).toEqual(expected);
    expect([...requested].sort()).toEqual(paths.map(url).sort());
  });

  test("fails closed on a failed download", async () => {
    const missing = paths[paths.length - 1] as string;
    const served = new Map(
      paths.filter((path) => path !== missing).map((path) => [path, committed(target, path)]),
    );
    const spy = stage(recorded, served);
    try {
      await expect(syncEvidence(target, root)).rejects.toThrow(`${target.id}: ${missing}:`);
    } finally {
      spy.mockRestore();
    }
    expectUntouched();
  });

  test("fails closed on a path with no recorded blob id", async () => {
    const unrecorded = paths[paths.length - 1] as string;
    const spy = stage(
      recorded.filter((file) => file.path !== unrecorded),
      new Map(paths.map((path) => [path, committed(target, path)])),
    );
    try {
      await expect(syncEvidence(target, root)).rejects.toThrow(
        `${target.id}: ${unrecorded}: no blob id recorded at ${commit}; run the sync without --evidence`,
      );
    } finally {
      spy.mockRestore();
    }
    expectUntouched();
  });
});

describe("evidenceBlobIds", () => {
  const tree: ReadonlyMap<string, string> = new Map([
    ["engine/z/src/z.h", "1111111111111111111111111111111111111111"],
    ["engine/a/src/a.cpp", "2222222222222222222222222222222222222222"],
    ["engine/m/src/m.cpp", "3333333333333333333333333333333333333333"],
  ]);

  test("takes each pinned path's id from the tree, sorted by path", () => {
    expect(evidenceBlobIds(tree, ["engine/z/src/z.h", "engine/a/src/a.cpp"])).toEqual([
      { path: "engine/a/src/a.cpp", blobSha: "2222222222222222222222222222222222222222" },
      { path: "engine/z/src/z.h", blobSha: "1111111111111111111111111111111111111111" },
    ]);
  });

  test("throws on a pinned path the tree lacks", () => {
    expect(() => evidenceBlobIds(tree, ["engine/a/src/a.cpp", "engine/q/src/q.h"])).toThrow(
      "engine/q/src/q.h",
    );
  });
});

describe("engineEvidencePaths", () => {
  test("lists each pinned file once, engine-prefixed and sorted", () => {
    const pin = (file: string, contains: string) => ({ file, contains });
    const ranges: ReadonlyMap<string, PropertyKeyRange> = new Map([
      [
        "a.slotN",
        {
          prefix: "slot",
          first: 0,
          last: 1,
          evidence: "0-1",
          engine: {
            last: 3,
            pins: [pin("z/src/z.h", "Z = 4;"), pin("z/src/z.h", "Z;"), pin("b/src/b.cpp", "B")],
          },
        },
      ],
      ["c.itemN", { prefix: "item", first: 1, last: 2, evidence: "1-2" }],
    ]);
    expect(engineEvidencePaths(ranges)).toEqual(["engine/b/src/b.cpp", "engine/z/src/z.h"]);
  });
});

describe("gitBlobSha", () => {
  test("is the object id git hash-object gives", () => {
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
