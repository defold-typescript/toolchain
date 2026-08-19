import { describe, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { installLinkPreflight, type LinkedDependencyRoot } from "../packed-install-links";

// Named `*.fixture.ts` so bun's discovery (which requires `.test`/`.spec`) skips
// it during a root `bun test`, the same dodge `*.e2e.ts` uses; the owning test
// runs it by explicit path. Every host-specific value arrives by env var.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run this fixture`);
  return value;
}

const root = required("PREFLIGHT_FIXTURE_ROOT");
const sentinel = required("PREFLIGHT_FIXTURE_SENTINEL");
const broken = required("PREFLIGHT_FIXTURE_MODE") === "broken";

const specifier = "packed-install-preflight-fixture-dep";

function writePackage(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0" }));
}

describe("a body guarded by the preflight gate", () => {
  const installed = path.join(root, "installed");
  const target = path.join(root, "dependency");
  writePackage(installed, "preflight-fixture-installed");
  writePackage(target, specifier);

  const link = path.join(installed, "node_modules", specifier);
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(target, link, "junction");
  // Break the link by removing the target after linking, so link creation itself
  // succeeds on hosts (Windows) that refuse a junction to a missing directory.
  if (broken) rmSync(target, { recursive: true, force: true });

  const roots: LinkedDependencyRoot[] = [{ specifier, link, target, installed }];
  installLinkPreflight(roots);

  test("writes the sentinel", () => {
    writeFileSync(sentinel, "the guarded body ran");
  });
});
