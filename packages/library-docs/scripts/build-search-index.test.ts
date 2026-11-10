import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { siteDirs } from "../app/lib/api-content";
import type { LibraryDirs } from "../app/lib/api-surface-loader";
import { searchIndexOutputs } from "./build-search-index";
import { symbolIndexOutputs } from "./build-symbol-index";

const FIXTURE_ROOT = join(import.meta.dir, "..", "app", "lib", "__fixtures__", "library-display");
const TYPES_DIR = join(import.meta.dir, "..", "node_modules", "@defold-typescript", "types");
const GUIDE_DIR = join(import.meta.dir, "..", "guides");

const root = mkdtempSync(join(tmpdir(), "library-docs-search-"));
cpSync(FIXTURE_ROOT, root, { recursive: true });

const modelFile = join(root, "api-doc", "demo.one.json");
writeFileSync(
  modelFile,
  JSON.stringify({
    ...JSON.parse(readFileSync(modelFile, "utf8")),
    elements: [
      {
        type: "FUNCTION",
        name: "demo.one.greet",
        brief: "Say hello to the player",
        description: "Say hello to the player",
        parameters: [],
        returnvalues: [],
      },
    ],
  }),
);
writeFileSync(
  join(root, "data", "0.61.0", "asset-portal.json"),
  JSON.stringify({
    entries: [
      {
        id: "shaderpack",
        description: "A pack of toon shaders",
        repo: "https://github.com/someone/shader-pack",
        ref: "v1",
        refKind: "tag",
        kind: "no-lua-api",
      },
    ],
  }),
);

const dirs: LibraryDirs = {
  dataDir: join(root, "data", "0.61.0"),
  modelDir: join(root, "api-doc"),
};
const dirsWithLinkOnlyPages: LibraryDirs = { ...dirs, typesDir: TYPES_DIR };

afterAll(() => rmSync(root, { recursive: true, force: true }));

const records = (input: LibraryDirs) =>
  searchIndexOutputs(input, GUIDE_DIR).flatMap((out) => out.records);

describe("searchIndexOutputs", () => {
  test("writes one shared index file", () => {
    expect(searchIndexOutputs(dirs, GUIDE_DIR).map((out) => out.file)).toEqual([
      "search-index.json",
    ]);
  });

  test("a library member is found at its /api/<host>/<owner>/<repo>/<namespace> route", () => {
    const member = records(dirs).find((record) => record.title === "demo.one.greet");
    expect(member?.route).toStartWith("/api/github.com/someone/demolib/demo.one#");
    expect(member?.text).toContain("Say hello to the player");
  });

  test("a library member is titled by the namespace its page documents", () => {
    const member = records(siteDirs(join(import.meta.dir, ".."))).find(
      (record) => record.title === "gui.new_spine_node",
    );
    expect(member?.route).toStartWith("/api/github.com/defold/extension-spine/gui#");
  });

  test("a listing is found at its /libraries/<host>/<owner>/<repo> route", () => {
    const listing = records(dirs).find((record) => record.title === "someone/shader-pack");
    expect(listing?.route).toBe("/libraries/github.com/someone/shader-pack");
    expect(listing?.text).toContain("A pack of toon shaders");
  });

  test("a link-only toolchain page gets no record", () => {
    const all = records(dirsWithLinkOnlyPages);
    expect(all.some((record) => record.title === "demo.one.greet")).toBe(true);
    expect(all.filter((record) => /^https?:/.test(record.route))).toEqual([]);
  });
});

describe("symbolIndexOutputs", () => {
  const index = (input: LibraryDirs) =>
    Object.assign({}, ...symbolIndexOutputs(input).map((out) => out.index)) as Record<
      string,
      { route: string }
    >;

  test("a library member resolves to its /api/<host>/<owner>/<repo>/<namespace> route", () => {
    expect(index(dirs)["demo.one.greet"]?.route).toStartWith(
      "/api/github.com/someone/demolib/demo.one#",
    );
  });

  test("a link-only toolchain page gets no tooltip entry", () => {
    const entries = Object.entries(index(dirsWithLinkOnlyPages));
    expect(entries.some(([key]) => key === "demo.one.greet")).toBe(true);
    expect(entries.filter(([, entry]) => /^https?:/.test(entry.route))).toEqual([]);
  });
});
