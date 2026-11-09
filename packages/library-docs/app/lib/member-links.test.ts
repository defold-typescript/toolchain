import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import {
  buildSymbolIndex,
  memberAnchors,
  type SymbolEntry,
} from "@defold-typescript/docs-render/symbol-index";
import { Hono } from "hono";
import { symbolIndexOutputs } from "../../scripts/build-symbol-index";
import { createApiNamespaceRoute } from "../routes/api/[owner]/[repo]/[namespace]";
import { apiPages, siteDirs } from "./api-content";
import type { LibraryDirs } from "./api-surface-loader";

// Root `bun test` runs from the repo root, so the package directory is passed in.
const REAL_DIRS = siteDirs(join(import.meta.dir, "../.."));
const FIXTURE_ROOT = join(import.meta.dir, "__fixtures__", "library-display");

const tooltipIndex = (dirs: LibraryDirs): Record<string, SymbolEntry> =>
  Object.assign({}, ...symbolIndexOutputs(dirs).map((out) => out.index));

describe("library member keys over the committed catalog", () => {
  const pages = apiPages(REAL_DIRS);
  const index = tooltipIndex(REAL_DIRS);

  test("a member is keyed by the namespace its page documents, never by its page key", () => {
    const spineGui = pages.find((page) => page.namespace === "spine.gui");
    expect(index["gui.new_spine_node"]?.route).toStartWith(`${spineGui?.route}#`);
    const rekeyed = pages.filter((page) => page.namespace !== page.module.namespace);
    expect(rekeyed.length).toBeGreaterThan(0);
    const doubled = rekeyed.flatMap((page) =>
      Object.keys(index).filter((key) =>
        key.startsWith(`${page.namespace}.${page.module.namespace}.`),
      ),
    );
    expect(doubled).toEqual([]);
  });

  test("a key two pages declare is absent; every other key routes to its page", () => {
    const routes = new Map<string, string[]>();
    for (const page of pages) {
      for (const [key, entry] of Object.entries(buildSymbolIndex([page]))) {
        routes.set(key, [...(routes.get(key) ?? []), entry.route]);
      }
    }
    const wrong = [...routes].filter(([key, owners]) =>
      owners.length > 1 ? Object.hasOwn(index, key) : index[key]?.route !== owners[0],
    );
    expect(wrong).toEqual([]);
  });
});

describe("a member key two libraries share", () => {
  const root = mkdtempSync(join(tmpdir(), "library-docs-member-links-"));
  cpSync(FIXTURE_ROOT, root, { recursive: true });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const element = (name: string, description: string) => ({
    type: "FUNCTION",
    name,
    brief: description,
    description,
    parameters: [],
    returnvalues: [],
  });
  const rewrite = (file: string, namespace: string, elements: unknown[]): void => {
    const path = join(root, "api-doc", file);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...doc, info: { ...doc.info, namespace }, elements }));
  };
  // The aliased library's page documents `demo.one` as well, so two pages, in
  // two repos, both declare `demo.one.greet`; `demo.two` only mentions it.
  rewrite("demo.one.json", "demo.one", [element("demo.one.greet", "Greets. See demo.one.greet.")]);
  rewrite("alias.actual.json", "demo.one", [
    element("demo.one.greet", "Greets too. See demo.one.greet."),
  ]);
  rewrite("demo.two.json", "demo.two", [element("demo.two.wave", "Waves after demo.one.greet.")]);

  const dirs: LibraryDirs = {
    dataDir: join(root, "data", "0.55.0"),
    modelDir: join(root, "api-doc"),
  };
  const app = new Hono();
  app.get("/api/:owner/:repo/:namespace", ...createApiNamespaceRoute(dirs));

  const greetLinks = async (page: ApiPage): Promise<string[]> => {
    const html = await (await app.request(page.route)).text();
    return [...html.matchAll(/<a href="([^"]*)" class="symbol-xref">demo\.one\.greet<\/a>/g)].map(
      (match) => match[1] ?? "",
    );
  };

  test("each page that declares it links it to its own heading", async () => {
    const declaring = apiPages(dirs).filter((page) => page.module.namespace === "demo.one");
    expect(declaring.length).toBe(2);
    for (const page of declaring) {
      expect(await greetLinks(page)).toEqual([
        `${page.route}#${memberAnchors(page).get("function:demo.one.greet")}`,
      ]);
    }
  });

  test("a page that does not declare it, and the tooltip index, name neither library", async () => {
    const other = apiPages(dirs).find((page) => page.namespace === "demo.two");
    expect(other).toBeDefined();
    expect(await greetLinks(other as ApiPage)).toEqual([]);
    expect(Object.hasOwn(tooltipIndex(dirs), "demo.one.greet")).toBe(false);
  });
});
