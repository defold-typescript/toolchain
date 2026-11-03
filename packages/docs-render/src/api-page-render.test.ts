import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import { apiPageMarkdown } from "./api-page-render";
import type { ApiPage, LibraryMeta } from "./api-surface";

const MODULE: ApiModule = {
  namespace: "astar",
  brief: "Grid path finding.",
  description: "",
  functions: [
    {
      name: "astar.solve",
      brief: "Finds a path.",
      description: "",
      parameters: [],
      returnValues: [],
    },
  ],
  variables: [],
  constants: [],
  properties: [],
  typedefs: [],
};

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_URL = `https://github.com/someone/defold-astar/blob/${COMMIT}/astar.d.ts`;

const META: LibraryMeta = {
  author: "someone",
  authorUrl: "https://github.com/someone/defold-astar",
  commit: COMMIT,
  sourceUrl: SOURCE_URL,
  importString: 'import * as astar from "astar"',
  license: "MIT",
  authoredHere: false,
  usage: "import",
};

function page(fields: Partial<ApiPage>): ApiPage {
  return {
    namespace: MODULE.namespace,
    route: "/api/astar",
    brief: MODULE.brief,
    module: MODULE,
    translations: {},
    signatures: {},
    category: "engine",
    ...fields,
  };
}

describe("apiPageMarkdown provenance block", () => {
  const provenance = [
    `pinned to [\`0123456\`](${SOURCE_URL})`,
    "Run `bunx @defold-typescript/cli resolve` to materialize its types.",
    '     import * as astar from "astar"',
  ];

  test("a library page states its pin, resolve step and import; an engine page of the same module none", () => {
    const library = apiPageMarkdown(page({ category: "library", libraryMeta: META }), (t) => t);
    const engine = apiPageMarkdown(page({}), (t) => t);
    for (const line of provenance) {
      expect(library).toContain(line);
      expect(engine).not.toContain(line);
    }
  });
});
