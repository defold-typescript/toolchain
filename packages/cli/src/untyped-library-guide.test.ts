/**
 * The resolve guide's "A library nobody types" section teaches a game developer to type a
 * dependency's Lua in their own project. Its declaration fence is written where the section
 * says to save it and its import fence beside it; both must type-check at the strictness
 * `init` scaffolds and build, and the import must compile to a `require` of the declared path.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
  type FenceProject,
  failingFences,
  GUIDE_DIR,
  guideFences,
  transpileErrors,
  transpileFenceProject,
  writeFenceProject,
} from "./guide-fence-gate";

const HEADING = "## A library nobody types";
// `src/types/mylib.d.ts`, where the section tells the reader to save the declaration.
const DECLARATION_MODULE = "types/mylib";

function guideSection(page: string): string {
  const start = page.indexOf(`\n${HEADING}\n`);
  if (start === -1) throw new Error(`resolve.md has no "${HEADING}" section`);
  const section = page.slice(start + 1);
  const next = section.indexOf("\n## ", HEADING.length);
  return next === -1 ? section : section.slice(0, next);
}

const fences = guideFences(guideSection(readFileSync(path.join(GUIDE_DIR, "resolve.md"), "utf8")));
const [declaration, usage] = fences;

let project: FenceProject | undefined;
function fenceProject(): FenceProject {
  if (declaration === undefined || usage === undefined) {
    throw new Error(`the section holds ${fences.length} ts fences, not 2`);
  }
  // The declaration is written verbatim: `writeFenceProject` appends `export {}` to a
  // fence, which would turn the ambient `declare module` into an augmentation.
  project ??= writeFenceProject([usage], {
    libraryModules: [DECLARATION_MODULE],
    corpus: new Map([[DECLARATION_MODULE, declaration.body]]),
    tmpPrefix: "untyped-library-guide-",
  });
  return project;
}

afterAll(() => {
  if (project !== undefined) rmSync(project.root, { recursive: true, force: true });
});

describe("resolve guide: A library nobody types", () => {
  test("the section shows a declaration fence and an import fence", () => {
    expect(fences).toHaveLength(2);
  });

  test("both fences type-check at the scaffold's strictness and build", () => {
    const built = fenceProject();
    expect(failingFences(usage === undefined ? [] : [usage], built)).toEqual({});
    expect(transpileErrors(built)).toEqual([]);
  });

  test("the import compiles to a require of the declared module path", () => {
    const built = fenceProject();
    const lua = usage === undefined ? undefined : transpileFenceProject(built).lua[usage.rel];
    expect(lua).toMatchSnapshot();
  });
});
