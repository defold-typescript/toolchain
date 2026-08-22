// Advisory live stamped-pack proof — NOT a CI gate.
//
// Runs the real release stamp->regen->pack chain at a *synthetic* non-`0.0.0`
// version inside throwaway `git worktree`s, proving `bun pm pack` emits
// coordinated `@defold-typescript/*` sibling versions — plus a no-regen control
// proving the lockfile regen is load-bearing (without it the pack carries the
// stale `0.0.0`). A *passing* control is a proof failure: it means the regen is
// not load-bearing and the whole proof is meaningless.
//
// This is the load-bearing proof to run deliberately before flipping the
// `ENABLE_NPM_PUBLISH` gate. The cheap, deterministic CI stand-in it backs is
// the ordering invariant in `test/release-workflow.test.ts`; this script touches
// the real toolchain (two worktrees, a `bun install`, three packs) and is far
// too slow/brittle for the green path, so it is never a `bun test` gate. The
// offline guarantees (the verdict helper and harness discoverability) live in
// `scripts/release-pack-proof.test.ts`.
//
// Usage: bun scripts/release-pack-proof.ts [--version <x.y.z>]

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
export const PACKAGES = [
  "types",
  "transpiler",
  "tstl-plugin",
  "docs",
  "library-types",
  "cli",
] as const;
const DEFAULT_VERSION = "9.9.9";

// Extracted from `publish.ts`'s `verifyCoordinated` inner loop so both the
// advisory `main` and the offline test drive every branch: a `@defold-typescript/*`
// dep must resolve to a concrete spec equal to the stamped version, never a
// `workspace:` placeholder and never the stale committed `0.0.0`.
export function checkCoordinatedDeps(
  manifest: unknown,
  expectedVersion: string,
): { ok: boolean; detail: string } {
  const deps =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { dependencies?: Record<string, unknown> }).dependencies
      : undefined;
  const entries = deps && typeof deps === "object" ? Object.entries(deps) : [];
  for (const [name, spec] of entries) {
    if (!name.startsWith("@defold-typescript/")) continue;
    if (typeof spec !== "string") {
      return { ok: false, detail: `${name} has a non-string spec: ${String(spec)}` };
    }
    if (spec.startsWith("workspace:")) {
      return { ok: false, detail: `${name} still carries an unresolved spec: ${spec}` };
    }
    if (spec !== expectedVersion) {
      return { ok: false, detail: `found ${name}@${spec}, expected ${expectedVersion}` };
    }
  }
  return { ok: true, detail: `all @defold-typescript/* deps resolve to ${expectedVersion}` };
}

function run(cmd: string[], opts: { cwd?: string } = {}): { code: number; output: string } {
  const [bin, ...rest] = cmd;
  if (!bin) {
    throw new Error("run() called with an empty command");
  }
  const proc = spawnSync(bin, rest, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf8",
  });
  return { code: proc.status ?? 1, output: `${proc.stdout ?? ""}${proc.stderr ?? ""}` };
}

function parseVersion(argv: readonly string[]): string {
  const i = argv.indexOf("--version");
  if (i === -1) return DEFAULT_VERSION;
  const v = argv[i + 1];
  if (!v || !/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`--version expects an x.y.z value, got: ${v ?? "(missing)"}`);
  }
  return v;
}

// Pure version stamp: return a copy with `.version` set, every other field
// (name, dependencies) preserved and the input left unmutated.
export function stampVersion<T extends object>(
  manifest: T,
  version: string,
): T & { version: string } {
  return { ...manifest, version };
}

function stampManifest(file: string, version: string): void {
  const stamped = stampVersion(JSON.parse(readFileSync(file, "utf8")), version);
  writeFileSync(file, `${JSON.stringify(stamped, null, 2)}\n`);
}

function stamp(worktree: string, version: string): void {
  // Mirror release.yml's stamp loop: rewrite `.version` across the root and
  // every package manifest, in-process (no bash/jq).
  stampManifest(path.join(worktree, "package.json"), version);
  const packagesDir = path.join(worktree, "packages");
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      stampManifest(path.join(packagesDir, entry.name, "package.json"), version);
    }
  }
}

export interface TarEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

// Walk an uncompressed (already-gunzipped) tar's 512-byte ustar headers and
// yield every regular file, so a whole tarball can be materialized in-process —
// repo tooling must stay portable and never shell out to `tar`. The ustar
// `prefix` field is honored because a deep packed path outruns the 100-byte name
// field; directories and pax/GNU metadata blocks carry no file content and are
// skipped rather than written out.
export function* iterateTarEntries(tar: Uint8Array): Generator<TarEntry> {
  const decoder = new TextDecoder();
  const trimNul = (s: string): string => {
    const i = s.indexOf("\0");
    return i === -1 ? s : s.slice(0, i);
  };
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = trimNul(decoder.decode(header.subarray(0, 100)));
    if (name === "") break; // trailing all-zero block
    const size = Number.parseInt(trimNul(decoder.decode(header.subarray(124, 136))).trim(), 8);
    const typeFlag = trimNul(decoder.decode(header.subarray(156, 157)));
    const prefix = trimNul(decoder.decode(header.subarray(345, 500)));
    const dataStart = offset + 512;
    if (typeFlag === "" || typeFlag === "0") {
      yield {
        name: prefix === "" ? name : `${prefix}/${name}`,
        data: tar.subarray(dataStart, dataStart + size),
      };
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
}

// Read one entry out of an uncompressed (already-gunzipped) tar. Returns null
// when absent.
export function readTarEntry(tar: Uint8Array, name: string): string | null {
  const decoder = new TextDecoder();
  for (const entry of iterateTarEntries(tar)) {
    if (entry.name === name) return decoder.decode(entry.data);
  }
  return null;
}

function packedManifest(worktree: string, pkg: string, dest: string): unknown {
  const pkgDir = path.join(worktree, "packages", pkg);
  const pack = run(["bun", "pm", "pack", "--destination", dest], { cwd: pkgDir });
  if (pack.code !== 0) {
    throw new Error(`pack failed for ${pkg}:\n${pack.output}`);
  }
  const tgz = pack.output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.endsWith(".tgz"));
  if (!tgz) {
    throw new Error(`could not locate packed tarball for ${pkg}:\n${pack.output}`);
  }
  const tarballPath = path.isAbsolute(tgz) ? tgz : path.join(pkgDir, tgz);
  const tar = Bun.gunzipSync(new Uint8Array(readFileSync(tarballPath)));
  const manifest = readTarEntry(tar, "package/package.json");
  if (manifest === null) {
    throw new Error(`could not read manifest from ${pkg} tarball: package/package.json not found`);
  }
  return JSON.parse(manifest);
}

// ---------------------------------------------------------------------------
// Packed-install proof: does the published `@defold-typescript/types` tarball
// carry everything the shipped generator loads?
//
// The repo tree always has `fixtures/` on disk, so every in-repo test of the
// generator passes whether or not those inputs are published. That asymmetry is
// what let on-demand ref-doc generation ship broken: `regen.ts` statically
// imports `../fixtures/messages_doc.json` and eagerly builds the committed
// manifests at module scope, so in a published install the module could not
// even load. Everything below runs against a real `bun pm pack` output with no
// repo tree behind it, which is the only place that failure is visible.

export const TYPES_PACKAGE = "types";
const TARBALL_PREFIX = "package/";

// `bun pm pack` the types package and return the gunzipped tar bytes.
export function packTypes(dest: string, repoRoot: string = REPO_ROOT): Uint8Array {
  const pkgDir = path.join(repoRoot, "packages", TYPES_PACKAGE);
  const pack = run(["bun", "pm", "pack", "--destination", dest], { cwd: pkgDir });
  if (pack.code !== 0) {
    throw new Error(`pack failed for ${TYPES_PACKAGE}:\n${pack.output}`);
  }
  const tgz = pack.output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.endsWith(".tgz"));
  if (!tgz) {
    throw new Error(`could not locate packed tarball for ${TYPES_PACKAGE}:\n${pack.output}`);
  }
  const tarballPath = path.isAbsolute(tgz) ? tgz : path.join(pkgDir, tgz);
  return Bun.gunzipSync(new Uint8Array(readFileSync(tarballPath)));
}

// Every `package/`-rooted regular file in a packed tar, keyed by its path
// relative to the package root.
export function packedEntryNames(tar: Uint8Array): Set<string> {
  const names = new Set<string>();
  for (const entry of iterateTarEntries(tar)) {
    if (entry.name.startsWith(TARBALL_PREFIX)) {
      names.add(entry.name.slice(TARBALL_PREFIX.length));
    }
  }
  return names;
}

// Materialize a packed tar into `dir` as an installed package would appear.
export function extractPackage(tar: Uint8Array, dir: string): number {
  let written = 0;
  for (const entry of iterateTarEntries(tar)) {
    if (!entry.name.startsWith(TARBALL_PREFIX)) continue;
    const abs = path.join(dir, entry.name.slice(TARBALL_PREFIX.length));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, entry.data);
    written += 1;
  }
  return written;
}

// Stand in for the installer: a packed tarball carries no dependency tree, so
// point the extracted package at one that already has its declared packages.
// This deliberately resolves *any* installed package, not just the declared
// ones — proving the manifest declares what the graph loads is
// `undeclaredPackedDependencies`' job, and splitting the two keeps this proof
// about the package's own contents. Dropping that guard would let this one pass
// on a dependency a consumer never receives.
export function linkDependencies(installDir: string, repoRoot: string = REPO_ROOT): void {
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(installDir, "node_modules"), "dir");
}

// Relative specifiers a module pulls in at load time, read by Bun's own
// transpiler rather than a bespoke regex: type-only imports are elided (they
// never reach the loader) and dynamic imports are reported separately, which is
// exactly the split this proof cares about. A hand-maintained list of expected
// filenames would restate the answer instead of deriving it.
export function allLoadTimeSpecifiers(source: string): string[] {
  return new Bun.Transpiler({ loader: "ts" })
    .scanImports(source)
    .filter((entry) => entry.kind === "import-statement")
    .map((entry) => entry.path);
}

// The relative subset — the inputs that have to be inside the tarball itself.
export function loadTimeSpecifiers(source: string): string[] {
  return allLoadTimeSpecifiers(source).filter(
    (spec) => spec.startsWith("./") || spec.startsWith("../"),
  );
}

// Resolve a relative specifier against the packed entry set the way the loader
// would, trying the literal name then the TS extension candidates.
function resolvesInPack(entries: Set<string>, fromEntry: string, spec: string): boolean {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromEntry), spec));
  return [base, `${base}.ts`, `${base}.d.ts`, `${base}/index.ts`].some((c) => entries.has(c));
}

// Every load-time import in the packed executable graph that resolves to
// nothing inside the tarball. `regen.ts`'s `../fixtures/messages_doc.json` was
// the entry that broke a published install; the check is written over the
// module's own import list so a newly added static input is covered without
// touching this file.
export function unpackagedLoadTimeInputs(tar: Uint8Array): string[] {
  const entries = packedEntryNames(tar);
  const decoder = new TextDecoder();
  const missing: string[] = [];
  for (const entry of iterateTarEntries(tar)) {
    if (!entry.name.startsWith(TARBALL_PREFIX)) continue;
    const rel = entry.name.slice(TARBALL_PREFIX.length);
    if (!rel.endsWith(".ts") || rel.endsWith(".d.ts")) continue;
    for (const spec of loadTimeSpecifiers(decoder.decode(entry.data))) {
      if (!resolvesInPack(entries, rel, spec)) {
        missing.push(`${rel} -> ${spec}`);
      }
    }
  }
  return missing;
}

// Bare specifiers the packed executable graph loads, mapped to the package name
// a consumer's installer would have to provide.
export function packedBareDependencies(tar: Uint8Array): Set<string> {
  const decoder = new TextDecoder();
  const bare = new Set<string>();
  for (const entry of iterateTarEntries(tar)) {
    if (!entry.name.startsWith(TARBALL_PREFIX)) continue;
    const rel = entry.name.slice(TARBALL_PREFIX.length);
    if (!rel.endsWith(".ts") || rel.endsWith(".d.ts")) continue;
    for (const spec of allLoadTimeSpecifiers(decoder.decode(entry.data))) {
      if (spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("node:")) continue;
      const parts = spec.split("/");
      bare.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string));
    }
  }
  return bare;
}

// Runtime packages the shipped graph loads without the tarball declaring them.
// Workspace hoisting resolves them here whatever the manifest says, so the repo
// tree can never surface this: `src/script-api.ts` imported `yaml` while the
// types package declared only `lua-types`, which an install would not provide.
export function undeclaredPackedDependencies(tar: Uint8Array): string[] {
  const manifestRaw = readTarEntry(tar, `${TARBALL_PREFIX}package.json`);
  if (manifestRaw === null) {
    throw new Error("packed tarball carries no package.json");
  }
  const manifest = JSON.parse(manifestRaw) as {
    name?: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...(manifest.name ? [manifest.name] : []),
  ]);
  return [...packedBareDependencies(tar)].filter((name) => !declared.has(name)).sort();
}

interface RegistryTarget {
  readonly id: string;
  readonly fixturesDir: string;
  readonly source?: { readonly kind: string } | null;
  readonly modules?: readonly { readonly fixture: string }[];
  readonly editorModules?: readonly { readonly fixture: string }[];
}

// Fixture paths the packed registry declares for its committed (`source: null`)
// targets. `regen.ts` reads every one of them while building the manifests a
// generated surface brands its constants against, so a target registered
// without its fixtures published breaks generation in an install even though
// the repo tree stays green. Derived from the packed `api-targets.json`, so
// registering the next Defold version is covered without editing this file.
export function declaredCommittedFixtures(tar: Uint8Array): string[] {
  const registry = readTarEntry(tar, `${TARBALL_PREFIX}api-targets.json`);
  if (registry === null) {
    throw new Error("packed tarball carries no api-targets.json");
  }
  const { targets } = JSON.parse(registry) as { targets: RegistryTarget[] };
  return targets
    .filter((target) => (target.source ?? null) === null)
    .flatMap((target) =>
      [...(target.modules ?? []), ...(target.editorModules ?? [])].map((module) =>
        path.posix.join(target.fixturesDir, module.fixture),
      ),
    );
}

// Declared committed fixtures absent from the tarball.
export function unpackagedCommittedFixtures(tar: Uint8Array): string[] {
  const entries = packedEntryNames(tar);
  return [...new Set(declaredCommittedFixtures(tar))].filter((file) => !entries.has(file));
}

export interface ProofVerdict {
  readonly ok: boolean;
  readonly detail: string;
}

// A single-module ref-doc target, resolved from an injected zip so the proof
// never touches the network or a cached download. The generator's own
// `resolveTargetModules` keys the zip entry off the supplied sync manifest, so
// the whole ref-doc path runs exactly as it does for a registered version.
const PROOF_NAMESPACE = "label";
const PROOF_ZIP_ENTRY = "doc/label_doc.json";
const PROOF_DOC = JSON.stringify({
  info: { namespace: PROOF_NAMESPACE, brief: "proof", description: "proof" },
  elements: [
    {
      type: "FUNCTION",
      name: `${PROOF_NAMESPACE}.get_text`,
      description: "Gets the text of a label component.",
      parameters: [{ name: "url", doc: "the label", types: ["string"] }],
      returnvalues: [{ name: "text", doc: "the label text", types: ["string"] }],
    },
  ],
});

interface MaterializeVersionModule {
  buildVersionedSurfaceFiles(
    target: unknown,
    opts: { resolveOpts?: Record<string, unknown> },
  ): Promise<Array<{ path: string; contents: string }>>;
}

// The load-bearing packed-install proof: import the shipped generator out of an
// extracted tarball — by resolved path, the way the CLI loads it — and generate
// a ref-doc surface from it. A published install has no `fixtures/` sibling to
// fall back on, so this fails on exactly the packaging gap that made "generated
// on demand" false for every consumer, and passes only when the generator's
// inputs actually ship.
export async function refDocMaterialize(installDir: string): Promise<ProofVerdict> {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "pack-proof-refdoc-cache-"));
  try {
    const mod = (await import(
      path.join(installDir, "scripts", "materialize-version.ts")
    )) as MaterializeVersionModule;
    const files = await mod.buildVersionedSurfaceFiles(
      {
        id: "defold-pack-proof",
        fixturesDir: "fixtures/defold-pack-proof",
        generatedDir: "generated/versions/defold-pack-proof",
        coreTypesImport: "./core-types",
        source: { kind: "ref-doc", version: "1.9.8" },
        modules: [
          {
            namespace: PROOF_NAMESPACE,
            fixture: `${PROOF_NAMESPACE}_doc.json`,
            outFile: `${PROOF_NAMESPACE}.d.ts`,
          },
        ],
      },
      {
        resolveOpts: {
          cacheDir,
          download: async () => new Uint8Array([0]),
          readZip: () => ({
            has: (name: string) => name === PROOF_ZIP_ENTRY,
            entries: () => [PROOF_ZIP_ENTRY],
            read: (name: string) => {
              if (name !== PROOF_ZIP_ENTRY) throw new Error(`unexpected zip entry: ${name}`);
              return PROOF_DOC;
            },
          }),
          syncManifest: [
            {
              namespace: PROOF_NAMESPACE,
              zipEntry: PROOF_ZIP_ENTRY,
              fixture: `fixtures/${PROOF_NAMESPACE}_doc.json`,
            },
          ],
        },
      },
    );
    const surface = files.find((file) => file.path === `${PROOF_NAMESPACE}.d.ts`);
    if (!surface) {
      return { ok: false, detail: `generated surface has no ${PROOF_NAMESPACE}.d.ts` };
    }
    if (!surface.contents.includes("get_text")) {
      return { ok: false, detail: `${PROOF_NAMESPACE}.d.ts carries no declaration for get_text` };
    }
    return {
      ok: true,
      detail: `ref-doc surface generated from the packed install (${files.length} files)`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

// Doc examples are a generator input like any fixture, but `loadTranslations`
// fails soft to `{}` — so an unpublished store degrades every generated surface
// silently instead of erroring. Read it out of the install to prove it shipped.
export async function packedTranslations(installDir: string): Promise<ProofVerdict> {
  try {
    const mod = (await import(path.join(installDir, "scripts", "example-store-io.ts"))) as {
      loadTranslations(): Record<string, unknown>;
    };
    const count = Object.keys(mod.loadTranslations()).length;
    return count > 0
      ? { ok: true, detail: `${count} translated examples reachable from the install` }
      : {
          ok: false,
          detail: "loadTranslations() came back empty — the example store is unpublished",
        };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

interface RunResult {
  readonly regen: boolean;
  readonly verdicts: Array<{ pkg: string; ok: boolean; detail: string }>;
}

function packProof(version: string, regen: boolean): RunResult {
  const worktree = mkdtempSync(
    path.join(os.tmpdir(), `pack-proof-${regen ? "regen" : "control"}-`),
  );
  const dest = mkdtempSync(path.join(os.tmpdir(), "pack-proof-tgz-"));
  // git worktree add refuses a pre-existing non-empty dir, so add into a fresh
  // child path and clean up the mkdtemp parent in `finally`.
  const checkout = path.join(worktree, "tree");
  try {
    const add = run(["git", "worktree", "add", "--detach", checkout, "HEAD"]);
    if (add.code !== 0) {
      throw new Error(`git worktree add failed:\n${add.output}`);
    }
    stamp(checkout, version);
    if (regen) {
      rmSync(path.join(checkout, "bun.lock"), { force: true });
      const install = run(["bun", "install"], { cwd: checkout });
      if (install.code !== 0) {
        throw new Error(`bun install failed in worktree:\n${install.output}`);
      }
    }
    const verdicts = PACKAGES.map((pkg) => {
      const manifest = packedManifest(checkout, pkg, dest);
      const v = checkCoordinatedDeps(manifest, version);
      return { pkg, ok: v.ok, detail: v.detail };
    });
    return { regen, verdicts };
  } finally {
    run(["git", "worktree", "remove", "--force", checkout]);
    rmSync(worktree, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
}

// Pack the types package once, run every packed-install check against that
// single tarball, and report each verdict.
export async function packedInstallProof(): Promise<Array<ProofVerdict & { check: string }>> {
  const dest = mkdtempSync(path.join(os.tmpdir(), "pack-proof-types-"));
  const install = mkdtempSync(path.join(os.tmpdir(), "pack-proof-install-"));
  try {
    const tar = packTypes(dest);
    extractPackage(tar, install);
    linkDependencies(install);
    const missingInputs = unpackagedLoadTimeInputs(tar);
    const missingFixtures = unpackagedCommittedFixtures(tar);
    const undeclared = undeclaredPackedDependencies(tar);
    return [
      {
        check: "load-time inputs",
        ok: missingInputs.length === 0,
        detail:
          missingInputs.length === 0
            ? "every static import in the packed graph resolves inside the tarball"
            : `unpublished: ${missingInputs.join(", ")}`,
      },
      {
        check: "committed fixtures",
        ok: missingFixtures.length === 0,
        detail:
          missingFixtures.length === 0
            ? "every fixture the packed registry declares is published"
            : `unpublished: ${missingFixtures.join(", ")}`,
      },
      {
        check: "declared dependencies",
        ok: undeclared.length === 0,
        detail:
          undeclared.length === 0
            ? "every package the shipped graph loads is declared by the tarball"
            : `undeclared: ${undeclared.join(", ")}`,
      },
      { check: "example store", ...(await packedTranslations(install)) },
      { check: "ref-doc materialize", ...(await refDocMaterialize(install)) },
    ];
  } finally {
    rmSync(dest, { recursive: true, force: true });
    rmSync(install, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const version = parseVersion(process.argv.slice(2));
  process.stdout.write(
    `live stamped-pack proof (advisory, real packs in throwaway worktrees) — synthetic version ${version}\n\n`,
  );

  const regen = packProof(version, true);
  process.stdout.write(`regen run (stamp -> rm bun.lock -> bun install -> pack):\n`);
  for (const v of regen.verdicts) {
    process.stdout.write(`  ${v.ok ? "PASS" : "FAIL"}  ${v.pkg} — ${v.detail}\n`);
  }
  const regenOk = regen.verdicts.every((v) => v.ok);

  const control = packProof(version, false);
  process.stdout.write(`\nno-regen control (stamp -> pack, lockfile NOT regenerated):\n`);
  for (const v of control.verdicts) {
    process.stdout.write(
      `  ${v.ok ? "(unexpectedly coordinated)" : "stale, as expected"}  ${v.pkg} — ${v.detail}\n`,
    );
  }
  // The control must FAIL: a stamp without the regen has to pack the stale
  // committed version. If it comes out coordinated, the regen step is not
  // load-bearing and the whole proof is meaningless — surface that loudly.
  const controlFails = control.verdicts.some((v) => !v.ok);

  const packed = await packedInstallProof();
  process.stdout.write(
    `\npacked-install run (pack types -> extract -> generate from the install):\n`,
  );
  for (const v of packed) {
    process.stdout.write(`  ${v.ok ? "PASS" : "FAIL"}  ${v.check} — ${v.detail}\n`);
  }
  const packedOk = packed.every((v) => v.ok);

  process.stdout.write("\n");
  if (regenOk && controlFails && packedOk) {
    process.stdout.write(
      `proof OK: regen pack is coordinated at ${version}; no-regen control packs the stale version (regen is load-bearing); the packed types tarball generates a ref-doc surface on its own\n`,
    );
    process.exit(0);
  }
  if (!regenOk) {
    process.stdout.write(`proof FAILED: regen pack did not emit coordinated ${version} deps\n`);
  }
  if (!controlFails) {
    process.stdout.write(
      "proof FAILED: no-regen control came out coordinated — the lockfile regen is NOT load-bearing\n",
    );
  }
  if (!packedOk) {
    process.stdout.write(
      "proof FAILED: the packed types tarball cannot generate a surface in a published install\n",
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  await main();
}
