import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const GUIDE = resolve(REPO_ROOT, "packages", "docs", "guide");

async function readGuide(relPath: string): Promise<string> {
  return Bun.file(resolve(GUIDE, relPath)).text();
}

const TETRIS_JARGON = [
  "transpile",
  "transpiler",
  "lowered",
  "lowering",
  "lowers",
  "lower",
  "userdata",
  "lualib",
  "truthy",
  "opaque",
  "reconcile",
  "verify",
  "verification",
  "dispatch",
  "register",
  "registration",
];

function stripInlineMarkup(line: string): string {
  return line
    .replace(/`[^`]*`/g, "")
    .replace(/\]\([^)]*\)/g, "")
    .replace(/\|/g, " ")
    .trim();
}

function tutorialProseMetrics(raw: string): {
  words: number;
  longSentences: number;
  jargon: number;
  detailedWords: number;
} {
  const lines = raw.split("\n");
  const proseLines: string[] = [];
  const detailedLines: string[] = [];
  let inFence = false;
  let inMore = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // A `> [!MORE]` blockquote opens a tap-to-reveal region that runs until the
    // first line that is not a blockquote continuation. Its prose is metered
    // separately (detailedWords) and excluded from the Quick ratchet.
    if (/^>\s*\[!more\]/i.test(line)) {
      inMore = true;
      detailedLines.push(stripInlineMarkup(line.replace(/^>\s*\[!more\]\s*/i, "")));
      continue;
    }
    if (inMore) {
      if (line.startsWith(">")) {
        detailedLines.push(stripInlineMarkup(line.replace(/^>\s?/, "")));
        continue;
      }
      inMore = false;
    }
    if (/^\|?[\s\-|:]+\|?$/.test(line)) continue;
    let l = line;
    l = l.replace(/^#+\s+/, "");
    l = l.replace(/^> \[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\][^\s]*\s*/, "");
    l = l.replace(/`[^`]*`/g, "");
    l = l.replace(/\]\([^)]*\)/g, "");
    l = l.replace(/\|/g, " ");
    proseLines.push(l.trim());
  }
  const detailed = detailedLines.join("\n");
  const detailedWords = detailed.split(/\s+/).filter((t) => t.length > 0).length;
  const prose = proseLines.join("\n");
  const words = prose.split(/\s+/).filter((t) => t.length > 0);
  const sentences = prose.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter(
    (s) => s.split(/\s+/).filter((t) => t.length > 0).length > 30,
  );
  const lc = prose.toLowerCase();
  let jargon = 0;
  for (const w of TETRIS_JARGON) {
    const re = new RegExp(`\\b${w}\\b`, "g");
    const m = lc.match(re);
    if (m) jargon += m.length;
  }
  return { words: words.length, longSentences: longSentences.length, jargon, detailedWords };
}

// Concatenated text of every `> [!MORE]` block in `section` (the summary line
// plus its contiguous `>`-prefixed body), so a per-function walkthrough can be
// asserted to name its function inside a disclosure rather than only in the
// canonical whole-file fence.
function moreBlocks(section: string): string {
  const out: string[] = [];
  let inMore = false;
  for (const line of section.split("\n")) {
    if (/^>\s*\[!more\]/i.test(line)) {
      inMore = true;
      out.push(line);
      continue;
    }
    if (inMore) {
      if (line.startsWith(">")) {
        out.push(line);
        continue;
      }
      inMore = false;
    }
  }
  return out.join("\n");
}

describe("tutorialProseMetrics helper", () => {
  test("strips fenced code blocks from the prose count", () => {
    const raw = [
      "# Title",
      "",
      "Some prose here.",
      "",
      "```ts",
      "const x = 1;",
      "const y = 2;",
      "```",
      "",
      "More prose after the fence.",
    ].join("\n");
    expect(tutorialProseMetrics(raw).words).toBe(9);
  });

  test("strips table separator lines and keeps table body prose", () => {
    const raw = ["| A | B |", "| - | - |", "| one | two |", "", "Tail sentence."].join("\n");
    const m = tutorialProseMetrics(raw);
    expect(m.words).toBe(6);
    expect(m.longSentences).toBe(0);
  });

  test("strips heading markers and admonition markers", () => {
    const raw = ["# Step 1", "", "> [!NOTE]", "", "Sentence one."].join("\n");
    const m = tutorialProseMetrics(raw);
    expect(m.words).toBe(4);
    expect(m.longSentences).toBe(0);
  });

  test("strips inline backtick spans and markdown link URLs", () => {
    const raw = "Use [`foo`](https://example.com) to call the `bar` function on each row.";
    expect(tutorialProseMetrics(raw).words).toBe(9);
  });

  test("counts jargon hits word-boundary", () => {
    const raw =
      "The transpile lowers userdata; truthy is a Lua thing; register dispatches at runtime.";
    const m = tutorialProseMetrics(raw);
    expect(m.jargon).toBeGreaterThanOrEqual(4);
    expect(m.jargon).toBeLessThanOrEqual(6);
  });

  test("counts long sentences (>30 words) correctly", () => {
    const longSentence = "one ".repeat(31).trim();
    expect(tutorialProseMetrics(`${longSentence}.`).longSentences).toBe(1);
    expect(tutorialProseMetrics("short.").longSentences).toBe(0);
  });

  test("excludes a [!MORE] block region from the Quick prose metrics", () => {
    const base = ["# Title", "", "Quick prose here now.", ""].join("\n");
    const withMore = [
      base,
      "> [!MORE] Why this matters",
      "> A long detailed beginner explanation that adds many extra words to the body.",
      "",
      "Tail line.",
    ].join("\n");
    const without = [base, "Tail line."].join("\n");
    const a = tutorialProseMetrics(withMore);
    const b = tutorialProseMetrics(without);
    expect(a.words).toBe(b.words);
    expect(a.longSentences).toBe(b.longSentences);
    expect(a.jargon).toBe(b.jargon);
  });

  test("counts [!MORE] region prose in detailedWords and reports zero without a block", () => {
    const withMore = ["# Title", "", "> [!MORE] Summary", "> Three extra detailed words."].join(
      "\n",
    );
    expect(tutorialProseMetrics(withMore).detailedWords).toBeGreaterThan(0);
    expect(tutorialProseMetrics("# Title\n\nJust prose.\n").detailedWords).toBe(0);
  });
});

describe("docs/guide scaffold", () => {
  test("docs/guide/README.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "README.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/getting-started.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "getting-started.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/vector-math.md exists and cross-links the unary-minus gotcha", async () => {
    const f = Bun.file(resolve(GUIDE, "vector-math.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("vector-math.md");
    expect(body).toContain("unary minus on Vector3 silently produces number");
  });

  test("docs/guide/typescript-gotchas.md exists and contains the unary-minus entry", async () => {
    const f = Bun.file(resolve(GUIDE, "typescript-gotchas.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("## Unary minus on Vector3 / Vector4 silently produces `number`");
    expect(body).toContain("v.unm()");
  });

  test("docs/guide/defold-editor.md exists and names the script build output", async () => {
    const f = Bun.file(resolve(GUIDE, "defold-editor.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("defold-editor.md");
    expect(body).toContain("src/main.ts.script");
  });

  test("docs/guide/add-typescript.md exists and explains add-TS mode", async () => {
    const f = Bun.file(resolve(GUIDE, "add-typescript.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("add-typescript.md");
    expect(body).toContain("game.project");
  });

  test("docs/guide/add-typescript.md scopes the conflict guard to tsconfig.json only", async () => {
    const body = await readGuide("add-typescript.md");
    expect(body).toContain("tsconfig.json");
    expect(body).not.toContain("defold-typescript.config");
  });

  test("docs/guide/editor-setup.md exists and names the watch loop", async () => {
    const f = Bun.file(resolve(GUIDE, "editor-setup.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("editor-setup.md");
    expect(body).toContain("bunx @defold-typescript/cli watch");
  });

  test("docs/guide/editor-setup.md documents the opinionated mise.toml tasks", async () => {
    const body = await readGuide("editor-setup.md");
    expect(body).toContain("opinionated `mise.toml`");
    expect(body).toContain("defold-typescript:build");
    expect(body).toContain("defold-typescript:watch");
    expect(body).toContain("defold-typescript:upgrade");
  });

  test("docs/guide/script-lifecycle.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "script-lifecycle.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/script-lifecycle.md documents the per-kind ambient API walls", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## API availability by script kind");
    expect(body).toContain("@defold-typescript/types/gui-script");
  });

  test("docs/guide/script-lifecycle.md documents the onMessage dispatcher", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## Routing many messages with `onMessage`");
  });

  test("docs/guide/script-lifecycle.md documents the value-keyed properties field", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## Script properties on `self`");
    // The value-keyed `properties` field replaces the descriptor idiom.
    expect(body).toContain("properties: {");
    expect(body).not.toContain("ScriptProperties");
  });

  test("docs/guide/README.md links to script lifecycle", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("script-lifecycle.md");
  });

  test("docs/guide/README.md links to the toolchain setup pages", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("defold-editor.md");
    expect(body).toContain("add-typescript.md");
    expect(body).toContain("editor-setup.md");
  });

  test("root README.md links to the guide README", async () => {
    const body = await Bun.file(resolve(REPO_ROOT, "README.md")).text();
    expect(body).toContain("packages/docs/guide/README.md");
  });

  test("typescript-gotchas.md carries the front skim digest", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("## Before you start: Lua vs TypeScript gotchas");
  });

  test("typescript-gotchas.md documents the four narrowing traps and the any wildcard", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain('## `if (x)` truthiness differs — `0` and `""` are truthy in Lua');
    expect(body).toContain("## `typeof` cannot narrow engine values — they are Lua `userdata`");
    expect(body).toContain("## `null`, `undefined`, and `== null` all collapse to `nil`");
    expect(body).toContain("## `as` is a compile-time assertion, not a runtime check");
    expect(body).toContain("## Some slots are `unknown` on purpose — the `any` wildcard");
  });

  test("typescript-gotchas.md states `===`/`==` lower identically and links it from the digest", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain(
      "## `===` and `==` compile to the same Lua — strictness is a convention, not a runtime guard",
    );
    expect(body).toContain(
      "[`===` and `==` are the same Lua](#-and--compile-to-the-same-lua--strictness-is-a-convention-not-a-runtime-guard)",
    );
  });

  test("typescript-gotchas.md states the scaffold ships noDoubleEquals off and leaves the choice open", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("scaffolded `biome.json` ships with `noDoubleEquals` off");
    expect(body).toContain("use whichever reads best");
  });

  test("docs/guide/typescript-vs-lua.md exists with its section markers", async () => {
    const f = Bun.file(resolve(GUIDE, "typescript-vs-lua.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("## Syntax at a glance");
    expect(body).toContain("## Tables vs objects, arrays, and Maps");
    expect(body).toContain("## Modules: `require` vs `import`");
    expect(body).toContain("## Standard library and built-ins");
  });

  test("docs/guide/typescript-vs-lua.md carries the not-equal translation row", async () => {
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("~=");
    expect(body).toContain("!==");
  });

  test("docs/guide/typescript-vs-lua.md Equal row no longer prescribes the strict triple form", async () => {
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).not.toContain("use the strict triple form");
    expect(body).toContain("`a === b` or `a == b` — identical Lua");
  });

  test("docs/guide/README.md links the TypeScript-vs-Lua cheat sheet", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("typescript-vs-lua.md");
  });

  test("docs/guide/getting-started.md cross-links the TypeScript-vs-Lua cheat sheet", async () => {
    const body = await readGuide("getting-started.md");
    expect(body).toContain("typescript-vs-lua.md");
  });

  test("guide build-output pages document helper modules as .lua outputs", async () => {
    for (const rel of [
      "add-typescript.md",
      "editor-setup.md",
      "defold-editor.md",
      "getting-started.md",
      "typescript-vs-lua.md",
    ]) {
      const body = await readGuide(rel);
      expect(body).toContain("src/util.lua");
    }
  });

  test("docs/guide/debugging.md points at the pinned lldebugger release URL", async () => {
    const body = await readGuide("debugging.md");
    expect(body).toContain("releases/download/lldebugger-v1/lldebugger.zip");
  });

  test("docs/guide/transpile-diagnostics.md exists and states the advisory contract", async () => {
    const f = Bun.file(resolve(GUIDE, "transpile-diagnostics.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("transpile-diagnostics.md");
    expect(body).toContain("@defold-typescript/tstl-plugin");
    expect(body).toContain("Suggestion");
    expect(body).toContain("tsc --noEmit");
    expect(body).toContain("typescript-gotchas.md");
  });

  test("docs/guide/README.md links the transpile-diagnostics page", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("transpile-diagnostics.md");
  });

  test("docs/guide/extensions.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "extensions.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/extensions.md documents the resolve verb", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("defold-typescript resolve");
  });

  test("docs/guide/extensions.md documents declaring a dependency", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("[dependencies]");
  });

  test("docs/guide/extensions.md notes the asset-only case", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("asset-only");
  });

  test("docs/guide/extensions.md names the cache override env var", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("DEFOLD_TYPESCRIPT_CACHE");
  });

  test("docs/guide/README.md links the extensions page", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("](./extensions.md)");
  });
});

describe("docs/guide/vector-math.md worked example", () => {
  test("contains the worked-example heading", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("## A worked example: the platformer");
  });

  test("makes the ambient-globals point", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("ambient global");
    expect(body).toContain("no import");
  });

  test("quotes the real method chain from the platformer", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("go.get_position().add(self.velocity.mul(dt)).add(self.adj)");
  });

  test("contrasts component access with whole-vector arithmetic", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("self.velocity.x");
  });

  test("labels the entrypoint fixed_update", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("fixed_update(self, dt)");
  });

  test("prose names the corrected hook and drops the stale one", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("`fixed_update` body");
    expect(body).not.toContain("`update` body");
  });

  test("attributes the projection line to the collision helper", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("handle_obstacle_contact");
  });
});

describe("docs/guide/pinning-defold-version.md release-channel section", () => {
  test("contains the channel section heading", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("## Pinning a release channel");
  });

  test("names all three channels and the stable default", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("stable");
    expect(body).toContain("beta");
    expect(body).toContain("alpha");
    expect(body).toContain("default stays `stable`");
  });

  test("documents the --channel flag and the package.json channel pin precedence", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("--channel");
    expect(body).toContain('"channel"');
  });

  test("documents --json reporting the channel", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("defoldChannel");
  });

  test("states beta/alpha are experimental pre-release surfaces", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("experimental");
  });
});

describe("docs/guide/pinning-defold-version.md installed-editor detection tier", () => {
  test("names the installed-editor detection as a pin-tier between pin and default", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("installed Defold editor");
    // Precedence chain has four tiers, with detection the lowest-precedence
    // fallback.
    expect(body).toMatch(/1\..*--defold-version/);
    expect(body).toMatch(/2\..*`package\.json` pin/);
    expect(body).toMatch(/3\..*installed Defold editor/);
    expect(body).toMatch(/4\..*current-stable default/);
  });

  test("names the per-OS candidate paths the probe checks", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("Defold.app/Contents/Resources/config");
    expect(body).toContain("~/Defold/config");
    expect(body).toContain("%LOCALAPPDATA%");
  });

  test("reports defoldVersionSource in --json with the four source values", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("defoldVersionSource");
    expect(body).toContain("`flag`");
    expect(body).toContain("`pin`");
    expect(body).toContain("`detected`");
    expect(body).toContain("`default`");
  });
});

describe("docs/guide/api-docs-vs-ts-defold.md", () => {
  test("keeps the dimension comparison naming both surfaces as columns", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Dimension comparison");
    expect(body).toContain("| ts-defold-types |");
    expect(body).toContain("@defold-typescript/types");
  });

  test("renames the partisan cleaner heading to name the surface", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Where ts-defold-types is arguably cleaner");
    expect(body).not.toContain("## Where they are arguably cleaner");
  });

  test("carries the neutral picker section", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Which surface fits your project");
  });

  test("drops the partisan superset phrasing", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).not.toContain("our docs are a superset");
  });
});

describe("docs/guide/migrating-from-ts-defold.md", () => {
  test("exists", async () => {
    const f = Bun.file(resolve(GUIDE, "migrating-from-ts-defold.md"));
    expect(await f.exists()).toBe(true);
  });

  test("carries the package-map, step-by-step, and provenance marker headings", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("## Package and tooling map");
    expect(body).toContain("## Step-by-step migration");
    expect(body).toContain("## What this guide verified");
  });

  test("names the provenance label instead of the in-group voice", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("**@defold-typescript side**");
    expect(body).not.toContain("**Our side**");
  });

  test("names the toolchain in the step-1 heading instead of the in-group voice", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("Add the defold-typescript toolchain");
    expect(body).not.toContain("Add our toolchain");
  });

  test("docs/guide/README.md Contents links the migration guide", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("./migrating-from-ts-defold.md");
  });
});

describe("docs/guide/agent-runbooks.md verify-against-real-api section", () => {
  test("carries the verification-discipline heading", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain("## Verify against the real API surface");
  });

  test("governs the CLI runbooks by sitting before the first one", async () => {
    const body = await readGuide("agent-runbooks.md");
    const verifyAt = body.indexOf("## Verify against the real API surface");
    const scaffoldAt = body.indexOf("## Scaffold a project");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(scaffoldAt);
  });

  test("names the authority order: trust the installed surface, distrust ts-defold", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain(".defold-types/");
    expect(body).toContain("@defold-typescript/types");
    expect(body).toContain("ts-defold");
  });

  test("cross-links script lifecycle and the Fix the Lua output verification loop", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain("script-lifecycle.md");
    expect(body).toContain("#fix-the-lua-output");
    // Both cross-link targets resolve: the sibling page exists on disk and the
    // in-file runbook anchor has a real heading.
    expect(await Bun.file(resolve(GUIDE, "script-lifecycle.md")).exists()).toBe(true);
    expect(body).toContain("## Fix the Lua output");
  });

  test("documents the on-demand gitignored fetch and refuses a submodule", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain("ref-doc.zip");
    expect(body).toContain("~/.cache/defold-typescript/ref-doc");
    expect(body).toContain("not a submodule");
  });
});

describe("docs/guide/agent-runbooks.md topical runbooks", () => {
  function section(body: string, heading: string, next?: string): string {
    const start = body.indexOf(heading);
    expect(start).toBeGreaterThan(-1);
    const end = next ? body.indexOf(next, start + heading.length) : body.length;
    return body.slice(start, end === -1 ? body.length : end);
  }

  test("carries all five topical runbook headings", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain("## Combine components on a game object");
    expect(body).toContain("## Spawn objects with a factory");
    expect(body).toContain("## Spawn a hierarchy with a collection factory");
    expect(body).toContain("## Pass messages between components");
    expect(body).toContain("## Where script state lives");
  });

  test("the factory section names factory.create and the collection-factory section names collectionfactory.create", async () => {
    const body = await readGuide("agent-runbooks.md");
    const factory = section(
      body,
      "## Spawn objects with a factory",
      "## Spawn a hierarchy with a collection factory",
    );
    expect(factory).toContain("factory.create");
    const collectionFactory = section(
      body,
      "## Spawn a hierarchy with a collection factory",
      "## Pass messages between components",
    );
    expect(collectionFactory).toContain("collectionfactory.create");
  });

  test("the messaging section links the narrowing runbook without duplicating the guard docs", async () => {
    const body = await readGuide("agent-runbooks.md");
    const messaging = section(
      body,
      "## Pass messages between components",
      "## Where script state lives",
    );
    expect(messaging).toContain("#narrow-engine-callback-payloads");
    // The guard runbook stays singular — messaging links it, never re-derives it.
    const guardHeadings = body.split("## Narrow engine callback payloads").length - 1;
    expect(guardHeadings).toBe(1);
  });

  test("the state section cross-links script-lifecycle.md and that target resolves", async () => {
    const body = await readGuide("agent-runbooks.md");
    const state = section(body, "## Where script state lives");
    expect(state).toContain("script-lifecycle.md");
    expect(await Bun.file(resolve(GUIDE, "script-lifecycle.md")).exists()).toBe(true);
  });

  test("the state section contrasts per-instance self with a shared module global", async () => {
    const body = await readGuide("agent-runbooks.md");
    const state = section(body, "## Where script state lives");
    expect(state).toContain("self");
    expect(state).toContain("module local");
    expect(state).toContain("shared");
  });
});

describe("docs/guide/script-state.md", () => {
  test("exists and carries its four state-tier marker headings", async () => {
    const f = Bun.file(resolve(GUIDE, "script-state.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("script-state.md");
    expect(body).toContain("## Per-instance state: `self`");
    expect(body).toContain("shared by every component instance");
    expect(body).toContain("## Sharing state across different scripts: a module singleton");
    expect(body).toContain("## Truly global variables: `declare global`");
  });

  test("docs/guide/README.md links script-state.md", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("script-state.md");
  });

  test("script-lifecycle.md cross-links script-state.md", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("script-state.md");
  });

  test("agent-runbooks.md 'Where script state lives' runbook points at script-state.md", async () => {
    const body = await readGuide("agent-runbooks.md");
    const start = body.indexOf("## Where script state lives");
    expect(start).toBeGreaterThan(-1);
    expect(body.slice(start)).toContain("script-state.md");
  });

  test("typescript-vs-lua.md states the `declare global` lowering: emits no Lua, bare-global use", async () => {
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("emits no Lua");
    expect(body).toContain("FOO = FOO + 1");
  });
});

describe("docs/guide/data-structures.md", () => {
  test("exists and carries the built-in container table with Map, Set, and a tuple cell", async () => {
    const f = Bun.file(resolve(GUIDE, "data-structures.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("data-structures.md");
    expect(body).toContain("## Built-in containers");
    expect(body).toContain("`Map`");
    expect(body).toContain("`Set`");
    expect(body).toContain("[number, string]");
  });

  test("carries the not-available section naming regex and BigInt with substitutes", async () => {
    const body = await readGuide("data-structures.md");
    expect(body).toContain("## Not available — reach for instead");
    expect(body).toContain("string.match is unsupported");
    expect(body).toContain("BigInt");
    // Each rejected feature names what to reach for instead.
    expect(body).toContain("startsWith");
  });

  test("documents the no-lualib LuaMap/LuaSet extensions and the no-import rule", async () => {
    const body = await readGuide("data-structures.md");
    expect(body).toContain("## Lower-overhead containers: the Lua table extensions");
    expect(body).toContain("LuaMap");
    expect(body).toContain("LuaSet");
    expect(body).toContain("do not import them");
  });

  test("docs/guide/README.md links data-structures.md", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("data-structures.md");
  });

  test("typescript-vs-lua.md cross-links data-structures.md", async () => {
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("data-structures.md");
  });
});

describe("docs/guide URL addressing coverage", () => {
  const GOTCHAS_HEADING =
    "## URL addressing: same-world objects are relative, `socket:` crosses worlds";
  const GOTCHAS_ANCHOR = "#url-addressing-same-world-objects-are-relative-socket-crosses-worlds";
  const RUNBOOK_HEADING = "## Address an object by URL";

  test("typescript-gotchas.md carries the URL addressing section heading", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain(GOTCHAS_HEADING);
  });

  test("typescript-gotchas.md front digest links the URL addressing section", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("[URL addressing");
    expect(body).toContain(GOTCHAS_ANCHOR);
  });

  test("typescript-gotchas.md URL addressing section quotes the three-part URL shape", async () => {
    const body = await readGuide("typescript-gotchas.md");
    const start = body.indexOf("## URL addressing");
    expect(start).toBeGreaterThan(-1);
    const section = body.slice(start);
    expect(section).toContain("[socket:][path][#fragment]");
  });

  test("typescript-gotchas.md URL addressing section ties the socket to the collection Name property", async () => {
    const body = await readGuide("typescript-gotchas.md");
    const start = body.indexOf("## URL addressing");
    expect(start).toBeGreaterThan(-1);
    const section = body.slice(start);
    expect(section).toContain("collection");
    expect(section).toContain("`Name`");
  });

  test("typescript-gotchas.md URL addressing section cross-references the msg.url arity typing", async () => {
    const body = await readGuide("typescript-gotchas.md");
    const start = body.indexOf("## URL addressing");
    expect(start).toBeGreaterThan(-1);
    const section = body.slice(start);
    expect(section).toContain("msg.url");
  });

  test("agent-runbooks.md carries the URL addressing runbook heading", async () => {
    const body = await readGuide("agent-runbooks.md");
    expect(body).toContain(RUNBOOK_HEADING);
  });

  test("agent-runbooks.md URL addressing runbook names the relative-vs-socket rule", async () => {
    const body = await readGuide("agent-runbooks.md");
    const start = body.indexOf(RUNBOOK_HEADING);
    expect(start).toBeGreaterThan(-1);
    const section = body.slice(start);
    expect(section).toContain("socket:");
    expect(section).toContain("collection-proxy");
  });
});

describe("docs/guide/tetris-tutorial.md", () => {
  const EXAMPLE_SRC = resolve(REPO_ROOT, "docs", "examples", "tetris-tutorial", "src");

  const TETRIS_RATCHET = {
    words: 2500,
    longSentences: 14,
    jargon: 6,
  } as const;

  // Empirically baselined after authoring the per-function `[!MORE]`
  // walkthroughs (their fenced excerpts count toward detailed prose); a separate
  // ceiling from the Quick ratchet so detail prose ratchets on its own.
  const DETAILED_RATCHET = 933;

  const TETRIS_TONE_ANCHORS = [
    "What you'll have",
    "In plain English",
    "one breath",
    "freeze into the board",
    "stack reached the ceiling",
  ] as const;

  test("exists and titles the build", async () => {
    const f = Bun.file(resolve(GUIDE, "tetris-tutorial.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("tetris-tutorial.md");
    expect(body).toContain("Build Tetris");
  });

  test("carries the rotation rule anchor and the 0-is-truthy tripwire text", async () => {
    const body = await readGuide("tetris-tutorial.md");
    expect(body).toContain("[-r, c]");
    expect(body).toContain("== 0");
    expect(body).toContain("`0` is truthy in Lua");
  });

  test("the equality note links the truthiness gotcha and prioritizes ==", async () => {
    const body = await readGuide("tetris-tutorial.md");
    expect(body).toContain(
      "./typescript-gotchas.md#if-x-truthiness-differs--0-and--are-truthy-in-lua",
    );
    expect(body).toContain("cell == 0");
    expect(body).toContain("`0` is truthy in Lua");
  });

  test("the Complete source step quotes each example file verbatim", async () => {
    const body = await readGuide("tetris-tutorial.md");
    for (const file of ["grid.ts", "pieces.ts", "board.ts"]) {
      const source = await Bun.file(resolve(EXAMPLE_SRC, file)).text();
      expect(body).toContain(source);
    }
  });

  test("a verbatim example fence carries a Shiki meta highlight range", async () => {
    const body = await readGuide("tetris-tutorial.md");
    expect(body).toContain('```ts title="src/grid.ts" {33-40}');
  });

  test("a hand-authored snippet demonstrates [!code highlight] notation", async () => {
    const body = await readGuide("tetris-tutorial.md");
    expect(body).toContain("[-r, c] as Offset); // [!code highlight]");
  });

  test("prose word count is at or below the recorded ceiling", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const m = tutorialProseMetrics(body);
    expect(m.words).toBeLessThanOrEqual(TETRIS_RATCHET.words);
  });

  test("long-sentence count is at or below the recorded ceiling", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const m = tutorialProseMetrics(body);
    expect(m.longSentences).toBeLessThanOrEqual(TETRIS_RATCHET.longSentences);
  });

  test("jargon-term count is at or below the recorded ceiling", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const m = tutorialProseMetrics(body);
    expect(m.jargon).toBeLessThanOrEqual(TETRIS_RATCHET.jargon);
  });

  test("carries the five friendly tone anchors", async () => {
    const body = await readGuide("tetris-tutorial.md");
    for (const anchor of TETRIS_TONE_ANCHORS) {
      expect(body).toContain(anchor);
    }
  });

  test("no heading line ends with a period", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const headingLines = body.split("\n").filter((line) => /^#{1,6}\s/.test(line));
    for (const line of headingLines) {
      expect(line.endsWith(".")).toBe(false);
    }
  });

  test("step 1 tree is the init output, not the end state", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const sectionStart = body.indexOf("## 01");
    expect(sectionStart).toBeGreaterThan(-1);
    const nextSection = body.indexOf("\n## 02 ", sectionStart);
    const section = body.slice(sectionStart, nextSection === -1 ? body.length : nextSection);
    const treeMatch = section.match(/```text\n([\s\S]*?)\n```/);
    expect(treeMatch).not.toBeNull();
    const tree = treeMatch?.[1] ?? "";
    for (const banned of [
      "board.gui",
      "board.go",
      "hud.go",
      "hud.gui",
      "board.ts",
      "pieces.ts",
      "grid.ts",
      "hud.ts",
    ]) {
      expect(tree).not.toContain(banned);
    }
    expect(tree).toContain("main.ts");
    expect(tree).toContain("main.collection");
    expect(tree).toContain("game.input_binding");
    expect(tree).toContain("game.project");
  });

  test("script attachment comes after the board.ts script is shown", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const boardTsFence = body.indexOf('```ts title="src/board.ts"');
    expect(boardTsFence).toBeGreaterThan(-1);
    const sectionFive = body.indexOf("## 05");
    const attachment = body.indexOf(
      "/src/board.ts.gui_script",
      sectionFive === -1 ? 0 : sectionFive,
    );
    expect(attachment).toBeGreaterThan(boardTsFence);
    expect(body).not.toContain("Save `src/board.ts` at least once");
    expect(body).not.toContain("then set it as the scene's **Script**");
  });

  test("input bindings precede the script's input code", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const bindingsOffset = body.indexOf("game.input_binding");
    const scriptOffset = body.indexOf('hash("left")');
    expect(bindingsOffset).toBeGreaterThan(-1);
    expect(scriptOffset).toBeGreaterThan(-1);
    expect(bindingsOffset).toBeLessThan(scriptOffset);
  });

  test("HUD is its own optional section after the run-it section", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const headingRe = /^#{2,3}\s.+$/gm;
    const headings = [...body.matchAll(headingRe)].map((m) => ({
      index: m.index ?? 0,
      text: m[0],
    }));
    const buildOffset = Math.min(
      body.indexOf("Project → Build"),
      body.indexOf("Cmd/Ctrl+B"),
      body.indexOf("Build-and-Run"),
    );
    expect(buildOffset).toBeGreaterThan(-1);
    const hudSection = headings.find((h) => {
      const lower = h.text.toLowerCase();
      return lower.includes("hud") && /(optional|extension|stretch)/i.test(h.text);
    });
    expect(hudSection).toBeDefined();
    expect(hudSection?.index).toBeGreaterThan(buildOffset);
    expect(body).not.toContain("what's left to you");
  });

  test("no save-then-come-back workaround paragraph", async () => {
    const body = await readGuide("tetris-tutorial.md");
    expect(body).not.toContain("then set it as the scene's **Script**");
    expect(body).not.toContain("Save `src/board.ts` at least once");
  });

  test("the grid-model section carries a [!MORE] disclosure", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const start = body.indexOf("## 03 — Model the grid");
    const end = body.indexOf("## 04 ", start);
    expect(start).toBeGreaterThan(-1);
    expect(body.slice(start, end === -1 ? body.length : end)).toContain("[!MORE]");
  });

  test("the rotation-geometry section carries a [!MORE] disclosure", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const start = body.indexOf("### How rotations are derived");
    const end = body.indexOf("### The seven base shapes", start);
    expect(start).toBeGreaterThan(-1);
    expect(body.slice(start, end === -1 ? body.length : end)).toContain("[!MORE]");
  });

  test("the grid section gives each model function its own [!MORE] walkthrough", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const start = body.indexOf("## 03 — Model the grid");
    const end = body.indexOf("## 04 ", start);
    expect(start).toBeGreaterThan(-1);
    const more = moreBlocks(body.slice(start, end === -1 ? body.length : end));
    for (const fn of ["emptyGrid", "isFree", "clearLines"]) {
      expect(more).toContain(fn);
    }
  });

  test("the tetromino section walks each function and the PIECES table in a [!MORE]", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const start = body.indexOf("## 04 — Define the tetrominoes");
    const end = body.indexOf("## 05", start);
    expect(start).toBeGreaterThan(-1);
    const more = moreBlocks(body.slice(start, end === -1 ? body.length : end));
    for (const name of ["rotateCW", "cellsAt", "nextPieceIndex", "PIECES"]) {
      expect(more).toContain(name);
    }
  });

  test("detailed-prose word count is positive and at or below the recorded ceiling", async () => {
    const body = await readGuide("tetris-tutorial.md");
    const m = tutorialProseMetrics(body);
    expect(m.detailedWords).toBeGreaterThan(0);
    expect(m.detailedWords).toBeLessThanOrEqual(DETAILED_RATCHET);
  });

  test("no h2/h3 heading appears inside a [!MORE] disclosure block", async () => {
    const body = await readGuide("tetris-tutorial.md");
    let inMore = false;
    for (const line of body.split("\n")) {
      if (/^>\s*\[!more\]/i.test(line)) {
        inMore = true;
        continue;
      }
      if (inMore) {
        if (line.startsWith(">")) {
          expect(/^>\s*#{2,3}\s/.test(line)).toBe(false);
          continue;
        }
        inMore = false;
      }
    }
  });
});
