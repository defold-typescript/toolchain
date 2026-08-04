import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const EXAMPLES_DIR = join(import.meta.dir, "../../../../docs/examples");
const FIXTURES = join(import.meta.dir, "__fixtures__", "guide-source-parity");

// Strip one level of blockquote prefix from every line, so source quoted inside
// a `> [!MORE] Full Script` block can be matched byte-for-byte against the
// original file.
function dequote(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n");
}

function tsFences(body: string): { info: string; code: string }[] {
  const fences: { info: string; code: string }[] = [];
  let info: string | null = null;
  let quoted = false;
  let bodyLines: string[] = [];
  for (const line of body.split("\n")) {
    if (info === null) {
      const open = line.match(/^(> )?```(\S.*)?$/);
      if (open) {
        quoted = Boolean(open[1]);
        info = open[2] ?? "";
        bodyLines = [];
      }
      continue;
    }
    const closeRe = quoted ? /^> ?```\s*$/ : /^```\s*$/;
    if (closeRe.test(line)) {
      if (info.startsWith("ts")) fences.push({ info, code: bodyLines.join("\n") });
      info = null;
      continue;
    }
    bodyLines.push(line);
  }
  return fences;
}

// Shiki's line-highlight notation is authored into the quoted line and is not
// part of the source it quotes.
function stripHighlightTrailers(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/\s*\/\/ \[!code highlight\]$/, ""))
    .join("\n");
}

const TITLE_RE = /title="src\/([^"\s]+)(?: \(([a-z]+)\))?"/;

// A fence claiming an example source is either compared or reported. `TITLE_RE`
// alone cannot decide that: a typo'd marker (`(Partial)`) fails it while still
// carrying `title="src/`, so matching on `TITLE_RE` would exempt the fence from
// both the parity compare and the untitled check.
const SRC_TITLE = /title="src\//;

/** Every example project that ships a `src/` tree, discovered rather than listed. */
function exampleRoots(dir: string): string[] {
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .filter((entry) => existsSync(join(dir, entry, "src")))
    .sort();
}

interface Violation {
  page: string;
  fence: string;
  reason:
    | "no example root holds this file"
    | "more than one example root holds this file"
    | "not byte-identical to its source"
    | "not a contiguous slice of its source"
    | "untitled ts fence on a participating page"
    | "unknown title marker"
    | "malformed src/ title";
}

interface ParityReport {
  violations: Violation[];
  checked: { page: string; root: string; file: string; marker: string }[];
}

function checkParity(guideDir: string, examplesDir: string): ParityReport {
  const roots = exampleRoots(examplesDir);
  const violations: Violation[] = [];
  const checked: { page: string; root: string; file: string; marker: string }[] = [];

  for (const page of readdirSync(guideDir).filter((f) => f.endsWith(".md"))) {
    const fences = tsFences(readFileSync(join(guideDir, page), "utf8"));
    if (!fences.some((f) => SRC_TITLE.test(f.info))) continue;

    for (const fence of fences) {
      if (!fence.info.includes("title=")) {
        violations.push({
          page,
          fence: fence.info,
          reason: "untitled ts fence on a participating page",
        });
      } else if (SRC_TITLE.test(fence.info) && !TITLE_RE.test(fence.info)) {
        violations.push({ page, fence: fence.info, reason: "malformed src/ title" });
      }
    }

    const titled = fences
      .filter((f) => TITLE_RE.test(f.info))
      .map((fence) => {
        const match = fence.info.match(TITLE_RE) as RegExpMatchArray;
        const file = match[1] ?? "";
        return {
          fence,
          file,
          marker: match[2] ?? "",
          hits: roots.filter((root) => existsSync(join(examplesDir, root, "src", file))),
        };
      });

    // A filename two example projects both ship (`env.d.ts`) is resolved by the
    // company it keeps: the roots this page's unambiguous fences already named.
    // Inference rather than a per-fence root attribute, so adding a file to a
    // second project cannot red fences that are already correct.
    const pageRoots = new Set(
      titled.filter((t) => t.hits.length === 1).map((t) => t.hits[0] as string),
    );

    for (const { fence, file, marker, hits } of titled) {
      if (marker !== "" && marker !== "partial" && marker !== "snippet") {
        violations.push({ page, fence: fence.info, reason: "unknown title marker" });
        continue;
      }
      if (hits.length === 0) {
        violations.push({ page, fence: fence.info, reason: "no example root holds this file" });
        continue;
      }
      const narrowed = hits.length === 1 ? hits : hits.filter((root) => pageRoots.has(root));
      if (narrowed.length !== 1) {
        violations.push({
          page,
          fence: fence.info,
          reason: "more than one example root holds this file",
        });
        continue;
      }
      const root = narrowed[0] as string;
      checked.push({ page, root, file, marker: marker || "full" });
      if (marker === "snippet") continue;

      const source = readFileSync(join(examplesDir, root, "src", file), "utf8");
      const code = stripHighlightTrailers(dequote(fence.code));
      if (marker === "partial") {
        if (!source.includes(code)) {
          violations.push({
            page,
            fence: fence.info,
            reason: "not a contiguous slice of its source",
          });
        }
        continue;
      }
      // A fence closes without its file's trailing newline, so the source is the
      // fence body plus that one byte and nothing else.
      if (source !== `${code}\n`) {
        violations.push({ page, fence: fence.info, reason: "not byte-identical to its source" });
      }
    }
  }
  return { violations, checked };
}

function format(violations: Violation[]): string {
  return violations.map((v) => `  ${v.page} :: ${v.fence} -- ${v.reason}`).join("\n");
}

describe("docs/guide code fences against docs/examples sources", () => {
  const report = checkParity(GUIDE_DIR, EXAMPLES_DIR);

  test("every titled fence matches the example source it claims to quote", () => {
    if (report.violations.length > 0) {
      throw new Error(`guide fence/source parity violations:\n${format(report.violations)}`);
    }
    expect(report.violations).toEqual([]);
  });

  // Which marker modes the live guide happens to use is an authoring choice, so
  // the exact three-mode set is asserted on the fixture corpus instead; here the
  // claim is only that real fences were inspected and normalised.
  test("the guard inspected real fences, each under a supported marker mode", () => {
    expect(report.checked.length).toBeGreaterThan(0);
    for (const marker of new Set(report.checked.map((c) => c.marker))) {
      expect(["full", "partial", "snippet"]).toContain(marker);
    }
  });

  test("the example roots are discovered from disk, not listed here", () => {
    const roots = exampleRoots(EXAMPLES_DIR);
    expect(roots.length).toBeGreaterThan(1);
    expect(roots).toEqual(
      readdirSync(EXAMPLES_DIR)
        .filter((e) => existsSync(join(EXAMPLES_DIR, e, "src")))
        .sort(),
    );
  });

  test("a page whose fences quote a second example root is checked against that root", () => {
    const { violations, checked } = checkParity(
      join(FIXTURES, "guide-sound"),
      join(FIXTURES, "examples"),
    );
    expect(violations).toEqual([]);
    expect(checked.map((c) => `${c.root}/${c.file}`).sort()).toEqual([
      "one/alpha.ts",
      "one/delta.ts",
      "two/beta.ts",
    ]);
    expect(new Set(checked.map((c) => c.marker))).toEqual(new Set(["full", "partial", "snippet"]));
  });

  test("a drifted fence, an unknown file, and an untitled fence are each reported", () => {
    const { violations } = checkParity(join(FIXTURES, "guide-broken"), join(FIXTURES, "examples"));
    expect(violations.map((v) => v.reason).sort()).toEqual([
      "malformed src/ title",
      "more than one example root holds this file",
      "no example root holds this file",
      "not a contiguous slice of its source",
      "not byte-identical to its source",
      "untitled ts fence on a participating page",
    ]);
  });

  test("a page whose only src/ title is malformed still participates", () => {
    const { violations, checked } = checkParity(
      join(FIXTURES, "guide-malformed-only"),
      join(FIXTURES, "examples"),
    );
    expect(violations.map((v) => v.reason)).toEqual(["malformed src/ title"]);
    expect(checked).toEqual([]);
  });

  test("a filename two roots hold resolves to the root the page's other fences quote", () => {
    const { violations, checked } = checkParity(
      join(FIXTURES, "guide-collide"),
      join(FIXTURES, "examples"),
    );
    expect(violations).toEqual([]);
    expect(checked.map((c) => `${c.root}/${c.file}`).sort()).toEqual([
      "two/beta.ts",
      "two/shared.ts",
    ]);
  });
});
