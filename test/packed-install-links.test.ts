import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  type LinkedDependencyRoot,
  REPO_ROOT,
  verifyLinkedDependencies,
} from "./packed-install-links";

// Every fixture tree lives under the repo's own `node_modules` for the same
// reason the packed-install consumer does: node's parent-directory walk reaches
// `REPO_ROOT/node_modules`, which is what lets a broken link still resolve and
// is exactly the hazard the traversal probe exists to catch.
const fixtureRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(REPO_ROOT, "node_modules", ".packed-links-"));
  fixtureRoots.push(root);
  return root;
}

function realPackage(root: string, name: string): string {
  const dir = path.join(root, "real", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0" }));
  return dir;
}

function installedRoot(root: string, name: string): string {
  const installed = path.join(root, "installed", name);
  mkdirSync(installed, { recursive: true });
  writeFileSync(
    path.join(installed, "package.json"),
    JSON.stringify({ name: `installed-${name}`, version: "0.0.0" }),
  );
  return installed;
}

function link(installed: string, specifier: string, target: string): string {
  const linkPath = path.join(installed, "node_modules", specifier);
  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, "junction");
  return linkPath;
}

afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
});

describe("verifyLinkedDependencies", () => {
  test("rejects a link that exists but does not traverse", () => {
    const root = fixtureRoot();
    const installed = installedRoot(root, "dangling");
    // `typescript` is hoisted to the repo root, so a bare `require.resolve` from
    // the installed package succeeds through the parent-directory walk even
    // though this link is dangling. Only the traversal probe can see the break.
    const specifier = "typescript";
    const target = realPackage(root, "dangling-target");
    const linkPath = link(installed, specifier, target);
    rmSync(target, { recursive: true, force: true });

    const roots: LinkedDependencyRoot[] = [{ specifier, link: linkPath, target, installed }];
    let thrown: unknown;
    try {
      verifyLinkedDependencies(roots);
    } catch (error) {
      thrown = error;
    }

    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(`throws: ${thrown instanceof Error}`).toBe("throws: true");
    expect(`names specifier: ${message.includes(specifier)}`).toBe("names specifier: true");
    expect(`names link: ${message.includes(linkPath)}`).toBe("names link: true");
    expect(`names target: ${message.includes(target)}`).toBe("names target: true");
  });

  test("rejects a link that traverses but does not resolve from its installed package", () => {
    const root = fixtureRoot();
    const installed = installedRoot(root, "unresolvable");
    const specifier = "packed-install-links-fixture-absent";
    const target = realPackage(root, specifier);
    // Linked beside a *different* installed package, so the link traverses while
    // the specifier is unreachable from the root that claims to own it.
    const linkPath = link(installedRoot(root, "elsewhere"), specifier, target);

    const roots: LinkedDependencyRoot[] = [{ specifier, link: linkPath, target, installed }];
    let thrown: unknown;
    try {
      verifyLinkedDependencies(roots);
    } catch (error) {
      thrown = error;
    }

    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(`throws: ${thrown instanceof Error}`).toBe("throws: true");
    expect(`names specifier: ${message.includes(specifier)}`).toBe("names specifier: true");
    expect(`names installed root: ${message.includes(installed)}`).toBe(
      "names installed root: true",
    );
  });

  test("rejects an empty inventory", () => {
    let thrown: unknown;
    try {
      verifyLinkedDependencies([]);
    } catch (error) {
      thrown = error;
    }
    expect(`throws: ${thrown instanceof Error}`).toBe("throws: true");
  });

  test("accepts a link that traverses and resolves", () => {
    const root = fixtureRoot();
    const installed = installedRoot(root, "valid");
    const specifier = "packed-install-links-fixture-present";
    const target = realPackage(root, specifier);
    const linkPath = link(installed, specifier, target);

    const roots: LinkedDependencyRoot[] = [{ specifier, link: linkPath, target, installed }];
    verifyLinkedDependencies(roots);
    expect(`verified ${roots.length} root(s)`).toBe("verified 1 root(s)");
  });
});

describe("installLinkPreflight", () => {
  const FIXTURE = "./test/fixtures/packed-install-preflight.fixture.ts";

  function runFixture(mode: "valid" | "broken"): {
    code: number;
    output: string;
    sentinelWritten: boolean;
  } {
    const root = fixtureRoot();
    const sentinel = path.join(root, "sentinel.txt");
    const proc = Bun.spawnSync(["bun", "test", FIXTURE], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PREFLIGHT_FIXTURE_ROOT: root,
        PREFLIGHT_FIXTURE_SENTINEL: sentinel,
        PREFLIGHT_FIXTURE_MODE: mode,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      code: proc.exitCode,
      output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
      sentinelWritten: existsSync(sentinel),
    };
  }

  test("a broken link aborts the run before the guarded body executes", () => {
    const { code, output, sentinelWritten } = runFixture("broken");

    expect(`exited zero: ${code === 0}`).toBe("exited zero: false");
    expect(`guarded body ran: ${sentinelWritten}`).toBe("guarded body ran: false");
    expect(
      `names the broken specifier: ${output.includes("packed-install-preflight-fixture-dep")}`,
    ).toBe("names the broken specifier: true");
  });

  test("a valid link lets the guarded body execute", () => {
    const { code, output, sentinelWritten } = runFixture("valid");

    expect(`exited zero: ${code === 0}`).toBe(`exited zero: true`);
    expect(`guarded body ran: ${sentinelWritten}`).toBe("guarded body ran: true");
    if (code !== 0) throw new Error(`the valid-mode fixture failed:\n${output}`);
  });
});
