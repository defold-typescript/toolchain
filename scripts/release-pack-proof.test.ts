import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  checkCoordinatedDeps,
  PACKAGES,
  readTarEntry,
  stampVersion,
} from "./release-pack-proof.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(path.join(PACKAGES_DIR, dir, "package.json"), "utf8"));
}

function miseTaskBody(toml: string, task: string): string | null {
  const lines = toml.split("\n");
  const start = lines.findIndex((l) => l.trim() === `[tasks.${task}]`);
  if (start === -1) {
    return null;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\[/.test(l.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("checkCoordinatedDeps", () => {
  test("accepts a manifest whose every @defold-typescript/* dep equals the synthetic version", () => {
    const result = checkCoordinatedDeps(
      {
        dependencies: {
          "@defold-typescript/types": "9.9.9",
          "@defold-typescript/transpiler": "9.9.9",
        },
      },
      "9.9.9",
    );
    expect(result.ok).toBe(true);
  });

  test("rejects the stale 0.0.0 control, naming both the found and expected version", () => {
    const result = checkCoordinatedDeps(
      { dependencies: { "@defold-typescript/types": "0.0.0" } },
      "9.9.9",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("0.0.0");
    expect(result.detail).toContain("9.9.9");
  });

  test("rejects a manifest still leaking a workspace: spec", () => {
    const result = checkCoordinatedDeps(
      { dependencies: { "@defold-typescript/types": "workspace:*" } },
      "9.9.9",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("workspace:");
  });

  test("ignores non-@defold-typescript/* deps at any version", () => {
    const result = checkCoordinatedDeps(
      {
        dependencies: { "@defold-typescript/types": "9.9.9", typescript: "6.0.2" },
      },
      "9.9.9",
    );
    expect(result.ok).toBe(true);
  });
});

describe("stampVersion", () => {
  test("sets .version, leaves every other field untouched, and does not mutate the input", () => {
    const input = {
      name: "@defold-typescript/types",
      version: "0.0.0",
      dependencies: { "@defold-typescript/transpiler": "0.0.0" },
    };
    const stamped = stampVersion(input, "1.2.3");
    expect(stamped.version).toBe("1.2.3");
    expect(stamped.name).toBe("@defold-typescript/types");
    expect(stamped.dependencies).toEqual({ "@defold-typescript/transpiler": "0.0.0" });
    expect(input.version).toBe("0.0.0");
  });
});

describe("readTarEntry", () => {
  function buildTar(entries: Array<{ name: string; content: string }>): Uint8Array {
    const enc = new TextEncoder();
    const blocks: Uint8Array[] = [];
    for (const { name, content } of entries) {
      const header = new Uint8Array(512);
      header.set(enc.encode(name), 0);
      const bytes = enc.encode(content);
      header.set(enc.encode(bytes.length.toString(8).padStart(11, "0")), 124);
      blocks.push(header);
      const padded = new Uint8Array(Math.ceil(bytes.length / 512) * 512);
      padded.set(bytes, 0);
      blocks.push(padded);
    }
    blocks.push(new Uint8Array(1024)); // two trailing zero blocks
    const total = blocks.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of blocks) {
      out.set(b, off);
      off += b.length;
    }
    return out;
  }

  test("returns the exact text of a named entry", () => {
    const tar = buildTar([{ name: "package/package.json", content: '{"version":"9.9.9"}' }]);
    expect(readTarEntry(tar, "package/package.json")).toBe('{"version":"9.9.9"}');
  });

  test("walks past earlier entries to find a later one", () => {
    const tar = buildTar([
      { name: "package/README.md", content: "hello world" },
      { name: "package/package.json", content: '{"name":"x"}' },
    ]);
    expect(readTarEntry(tar, "package/package.json")).toBe('{"name":"x"}');
  });

  test("returns null when the name is absent", () => {
    const tar = buildTar([{ name: "package/README.md", content: "hi" }]);
    expect(readTarEntry(tar, "package/package.json")).toBeNull();
  });
});

describe("release-pack-proof.ts is shell-free", () => {
  test("spawns none of bash, jq, or tar", () => {
    const src = readFileSync(path.join(REPO_ROOT, "scripts", "release-pack-proof.ts"), "utf8");
    expect(src.includes('"bash"')).toBe(false);
    expect(src.includes('"jq"')).toBe(false);
    expect(src.includes('"tar"')).toBe(false);
  });
});

describe("release pack proof harness is discoverable", () => {
  test("root package.json exposes a pack-proof script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.["pack-proof"]).toBe("bun scripts/release-pack-proof.ts");
  });

  test("mise.toml defines a pack-proof task running scripts/release-pack-proof.ts", () => {
    const toml = readFileSync(path.join(REPO_ROOT, "mise.toml"), "utf8");
    const body = miseTaskBody(toml, "pack-proof");
    expect(body).not.toBeNull();
    expect(body).toContain("scripts/release-pack-proof.ts");
  });
});

describe("pack-proof covers the coordinated release set", () => {
  test("PACKAGES includes tstl-plugin in dependency order", () => {
    expect(PACKAGES).toContain("tstl-plugin");
    expect(PACKAGES.indexOf("tstl-plugin")).toBeGreaterThan(PACKAGES.indexOf("transpiler"));
    expect(PACKAGES.indexOf("tstl-plugin")).toBeLessThan(PACKAGES.indexOf("cli"));
  });

  // Workspace-parity guard (relocated from the retired publish.ts test): without
  // it, extracting a new publishable package (as `docs` was) silently leaves it
  // out of the release set — its workspace:* deps would never resolve.
  test("PACKAGES lists exactly the publishable packages/* dirs", () => {
    const publishable = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((dir) => readManifest(dir).private !== true)
      .sort();
    // publishable (string[]) as the received value so the literal PACKAGES
    // tuple-union widens to it rather than the reverse (which tsc rejects).
    expect(publishable).toEqual([...PACKAGES].sort());
  });

  test("each PACKAGES dir maps to its @defold-typescript/<dir> package name", () => {
    for (const dir of PACKAGES) {
      expect(readManifest(dir).name).toBe(`@defold-typescript/${dir}`);
    }
  });

  // Dependency-closure guard: every internal @defold-typescript/* runtime dep of
  // a published package must itself be published. This is the invariant that
  // broke when `cli` pinned `library-types` while `library-types` stayed
  // `private: true` and never published — a 404 on `bunx @defold-typescript/cli`.
  // Runtime deps only (dependencies/optional/peer); devDependencies never ship.
  test("every internal runtime dep of a PACKAGES dir is itself in PACKAGES", () => {
    const published = new Set(PACKAGES.map((dir) => `@defold-typescript/${dir}`));
    const offenders: string[] = [];
    for (const dir of PACKAGES) {
      const m = readManifest(dir);
      const runtimeDeps = {
        ...m.dependencies,
        ...m.optionalDependencies,
        ...m.peerDependencies,
      };
      for (const dep of Object.keys(runtimeDeps)) {
        if (dep.startsWith("@defold-typescript/") && !published.has(dep)) {
          offenders.push(`${dir} -> ${dep}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
