import type { SearchRecord } from "./search-route";

export const LIBRARY_PAGE = "/api/github.com/britzl/defold-input/in.button";

// Fumadocs' static search client caches each index by its URL for the life of the process, and
// under test both docs sites search `/search-index.json`, so a later test file would search
// whatever index an earlier one loaded. Every test that opens either site's search dialog serves
// these records there: a toolchain and a library API page with a member each, and a guide section
// whose one passage sits far from its start.
export const SHARED_INDEX_RECORDS: SearchRecord[] = [
  { route: "/api/go", title: "go", text: "Game object API" },
  { route: "/api/go#go.animate", title: "go.animate", text: "Animates a property" },
  { route: LIBRARY_PAGE, title: "in.button", text: "Button input helper" },
  {
    route: `${LIBRARY_PAGE}#in.button.register`,
    title: "in.button.register",
    text: "Registers a button",
  },
  { route: "/guides/build", title: "Build", text: "Build the game." },
  {
    route: "/guides/build#publish",
    title: "Publish",
    text: `${"filler ".repeat(300)}run bun install first ${"filler ".repeat(300)}`,
  },
];
