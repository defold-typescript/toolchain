import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIBRARY_DATA_DIR } from "../packages/cli/src/library/package-root.ts";
import { writeMirror } from "./library-data-mirror.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./library-data-mirror.ts", import.meta.url));
const CLI_TIMEOUT = 60_000;

const PUBLISHED = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "data/0.55.0/druid/generated/druid.d.ts",
  "data/0.55.0/library-targets.json",
];

function write(root: string, files: Record<string, string>): void {
  for (const [path, contents] of Object.entries(files)) {
    const out = join(root, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
  }
}

function listFiles(dir: string, skip: readonly string[] = []): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (skip.includes(path)) continue;
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk("");
  return out.sort();
}

function contents(dir: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(dir).map((path) => [path, readFileSync(join(dir, path), "utf8")]),
  );
}

// The library-types package holds reports beside its data, and the repo root its
// own NOTICE and LICENSE; none of them may reach the data repo.
function sourceRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "library-data-mirror-source-"));
  write(root, {
    "packages/library-types/data/0.55.0/library-targets.json": '{ "targets": [] }\n',
    "packages/library-types/data/0.55.0/druid/generated/druid.d.ts": "declare module 'druid' {}\n",
    "packages/library-types/NOTICE": "library notice\n",
    "packages/library-types/LICENSE": "library license\n",
    "packages/library-types/api-doc/druid.json": "{}\n",
    "packages/library-types/fidelity/druid.json": "{}\n",
    "packages/library-types/package.json": "{}\n",
    "packages/library-types/README.md": "types package readme\n",
    "packages/library-docs/dist/index.html": "<html></html>\n",
    NOTICE: "toolchain notice\n",
    LICENSE: "toolchain license\n",
  });
  return root;
}

function dataCheckout(files: Record<string, string> = {}): string {
  const target = mkdtempSync(join(tmpdir(), "library-data-mirror-target-"));
  write(target, {
    ".git/HEAD": "ref: refs/heads/main\n",
    ".git/config": "[core]\n\tbare = false\n",
    ".git/objects/ab/cdef": "object\n",
    ...files,
  });
  return target;
}

describe("writeMirror", () => {
  test("leaves the target holding exactly the data, NOTICE, LICENSE and README, with .git untouched", () => {
    const source = sourceRepo();
    const target = dataCheckout();
    const gitBefore = contents(join(target, ".git"));

    writeMirror(source, target);

    expect(listFiles(target, [".git"])).toEqual(PUBLISHED);
    const published = contents(target);
    expect(published["data/0.55.0/library-targets.json"]).toBe('{ "targets": [] }\n');
    expect(published["data/0.55.0/druid/generated/druid.d.ts"]).toBe("declare module 'druid' {}\n");
    expect(published.NOTICE).toBe("library notice\n");
    expect(published.LICENSE).toBe("library license\n");
    expect(contents(join(target, ".git"))).toEqual(gitBefore);
  });

  test("removes what the target held that this repo does not publish", () => {
    const target = dataCheckout({
      "site/index.html": "<html></html>\n",
      ".github/workflows/library-check.yml": "name: Library check\n",
      ".github/scripts/cli-range.ts": "export {};\n",
      ".gitignore": "/fidelity/\n",
      "fidelity/druid.json": "{}\n",
      "data/0.55.0/removed/generated/removed.d.ts": "declare module 'removed' {}\n",
      "data/0.54.0/library-targets.json": "{}\n",
      "README.md": "the data repo's own readme\n",
    });

    writeMirror(sourceRepo(), target);

    expect(listFiles(target, [".git"])).toEqual(PUBLISHED);
    expect(readFileSync(join(target, "README.md"), "utf8")).not.toBe(
      "the data repo's own readme\n",
    );
  });

  test("publishes nothing from library-types beyond its data, NOTICE and LICENSE", () => {
    const target = dataCheckout();

    writeMirror(sourceRepo(), target);

    for (const stray of ["api-doc", "fidelity", "package.json", "packages", "dist"]) {
      expect(existsSync(join(target, stray))).toBe(false);
      expect(existsSync(join(target, "data", stray))).toBe(false);
    }
    expect(readFileSync(join(target, "README.md"), "utf8")).not.toBe("types package readme\n");
  });

  test("writes a README that sends changes to packages/library-types/data in this repo", () => {
    const target = dataCheckout();

    writeMirror(sourceRepo(), target);

    const readme = readFileSync(join(target, "README.md"), "utf8");
    expect(readme).toContain("defold-typescript/toolchain");
    expect(readme).toContain("packages/library-types/data");
    const linked = [
      ...readme.matchAll(
        /github\.com\/defold-typescript\/toolchain\/(?:blob|tree)\/main\/([^)\s#]+)/g,
      ),
    ].map((match) => match[1] ?? "");
    expect(linked).toContain("packages/library-types/data");
    expect(linked.filter((path) => !existsSync(join(REPO_ROOT, path)))).toEqual([]);
  });

  test("refuses a target that holds the source repo", () => {
    const parent = mkdtempSync(join(tmpdir(), "library-data-mirror-parent-"));
    const source = join(parent, "toolchain");
    write(source, { "packages/library-types/NOTICE": "library notice\n" });

    expect(() => writeMirror(source, source)).toThrow(/holds the source repo/);
    expect(() => writeMirror(source, parent)).toThrow(/holds the source repo/);
    expect(readFileSync(join(source, "packages/library-types/NOTICE"), "utf8")).toBe(
      "library notice\n",
    );
  });
});

describe("library-data-mirror CLI", () => {
  test(
    "writes this repo's library data into --target",
    async () => {
      const target = dataCheckout({ "site/index.html": "<html></html>\n" });

      const proc = Bun.spawn([process.execPath, SCRIPT, "--target", target], {
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(await proc.exited).toBe(0);
      expect(listFiles(join(target, "data"))).toEqual(listFiles(dirname(LIBRARY_DATA_DIR)));
      expect(existsSync(join(target, "site"))).toBe(false);
    },
    CLI_TIMEOUT,
  );

  test(
    "fails without --target",
    async () => {
      const proc = Bun.spawn([process.execPath, SCRIPT], { stdout: "pipe", stderr: "pipe" });

      expect(await proc.exited).not.toBe(0);
      expect(await new Response(proc.stderr).text()).toContain("--target");
    },
    CLI_TIMEOUT,
  );
});
