import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseMarkdownApi } from "./parse-markdown-api";
import { readAuthoredTargets } from "./sync-authored-types";
import {
  compareFidelityToTsDefold,
  emitMarkdownDeclaration,
  evaluateMarkdownCandidate,
  type MarkdownTarget,
  readMarkdownTargets,
  retargetDoc,
  tsDefoldMembers,
} from "./sync-markdown-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function orthographicTarget(): MarkdownTarget {
  const target = readMarkdownTargets(PACKAGE_ROOT).find(
    (t) => t.moduleId === "orthographic.camera",
  );
  if (target === undefined) throw new Error("orthographic.camera target missing");
  return target;
}

// The comparison runs against the *emitted* markdown `.d.ts` (the real emitter is
// the single source of truth for type resolution), not the parsed doc.
//
// orthographic severed its ts-defold dependency into the authored lane, so the
// retired `fixtures/ts-defold/` snapshot is gone and the recorded verdict now
// resolves against the vendored fork. The fork was taken verbatim from the
// ts-defold-lane golden, so the comparison it feeds is the same one the no-go was
// recorded from — the `follow` correction that landed on top of it renames a
// parameter and widens a union, neither of which the gate scores.
const AUTHORED_SNAPSHOT = "fixtures/authored/orthographic.camera.d.ts";

async function comparison() {
  const target = orthographicTarget();
  const markdownEmittedDts = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(join(PACKAGE_ROOT, AUTHORED_SNAPSHOT), "utf8");
  return { target, ...compareFidelityToTsDefold(markdownEmittedDts, tsDefold) };
}

describe("tsDefoldMembers sees bare export-less declarations", () => {
  test("extracts bare `function` members from a module written without `export`", () => {
    // rendy is the corpus's only module written with zero `export` keywords, and
    // its fork exhibits that identically. Read through `targetFor` so the lane
    // the surface lives in follows the severance instead of being hard-coded.
    const rendy = readFileSync(
      join(PACKAGE_ROOT, targetFor("rendy.rendy", severedFor(RENDY, "rendy")).fixture),
      "utf8",
    );
    const members = tsDefoldMembers(rendy);
    for (const fn of ["create_camera", "destroy_camera", "get_stack", "screen_to_world"]) {
      expect(members).toContain(fn);
    }
  });
});

describe("orthographic markdown-vs-ts-defold fidelity gate", () => {
  test("reports the ts-defold members the markdown parse does not cover", async () => {
    const { missingMembers } = await comparison();
    // Functions in the fork's surface absent from the README API table. The signature
    // correction withdrew `add_projector`, `get_projection_id` and `use_projector` —
    // deprecated stubs whose upstream body only `error()`s — so they are no longer in
    // the fork to be missing from anything.
    for (const fn of [
      "get_cameras",
      "project",
      "set_window_scaling_factor",
      "unproject",
      "window_to_world",
    ]) {
      expect(missingMembers).toContain(fn);
    }
    for (const withdrawn of ["add_projector", "get_projection_id", "use_projector"]) {
      expect(missingMembers).not.toContain(withdrawn);
    }
    // Every ts-defold constant is a member the flat signature parser cannot see.
    // `MSG_SET_AUTOMATIC_ZOOM` joined them with the field correction that declared it
    // from `camera.lua:18`.
    for (const constant of ["PROJECTOR", "SHAKE_BOTH", "MSG_SHAKE", "MSG_SET_AUTOMATIC_ZOOM"]) {
      expect(missingMembers).toContain(constant);
    }
  });

  // The same correction deleted two declarations the pinned `camera.lua` defines
  // nowhere: reading either returned `nil` and posting `MSG_USE_PROJECTION` reached
  // nothing. An empty comparison term alone cannot tell a deleted declaration from a
  // name the reader stopped seeing, so the fork text is re-read here.
  test("the two invented constants are gone from the fork and from every comparison term", async () => {
    const { missingMembers, addedMembers, decision } = await comparison();
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED_SNAPSHOT), "utf8");
    for (const invented of ["MSG_USE_PROJECTION", "ORTHOGRAPHIC_RENDER_SCRIPT_USED"]) {
      expect(fork).not.toContain(invented);
      expect(missingMembers).not.toContain(invented);
      expect(addedMembers).not.toContain(invented);
    }
    expect(addedMembers).toEqual([]);
    expect(decision).toBe("no-go");
  });

  // `get_automatic_zoom` and `set_automatic_zoom` were the whole of this term: the
  // README documented them and the inherited ts-defold surface did not. The signature
  // correction declared both from the pinned `camera.lua`, which is what draining the
  // term means — the gap the comparison named was closed in the fork, not hidden.
  test("the README now adds nothing over the fork, the automatic-zoom pair having landed", async () => {
    const { addedMembers } = await comparison();
    expect(addedMembers).toEqual([]);
  });

  test("the README's matrix-returning members are no longer downgraded", async () => {
    const { downgradedMembers, decision } = await comparison();
    // ts-defold returns `vmath.matrix4` and the README's `matrix` shorthand now
    // maps to the same `Matrix4`, so neither member loses its type. The missing
    // surface is the sole remaining driver of the no-go.
    expect(downgradedMembers).not.toContain("get_view");
    expect(downgradedMembers).not.toContain("get_projection");
    expect(decision).toBe("no-go");
  });

  test("the missing surface forces a no-go decision", async () => {
    const { missingMembers, decision } = await comparison();
    expect(missingMembers.length).toBeGreaterThan(0);
    expect(decision).toBe("no-go");
  });

  test("the recorded target decision matches the computed comparison", async () => {
    const { target, decision } = await comparison();
    expect(target.decision).toBeDefined();
    expect(target.decision).toBe(decision);
  });
});

interface ModuleDecision {
  module: string;
  decision: "go" | "no-go";
  reason:
    | "no-markdown"
    | "no-signature-section"
    | "doc-dialect"
    | "shared-document"
    | "surface-loss"
    | "signature-loss"
    | "type-downgrade";
  // The upstream `.md` path at the pin, absent exactly when `no-markdown`.
  markdown?: string;
  // Set once this module severs its ts-defold dependency; see `SeveredSource`.
  severedSource?: SeveredSource;
}

/** One Bucket-C library's audited cutover record. `<prefix><module>` is both the
 * moduleId and the publish namespace, so every module here carries the in-place
 * hazard: its markdown goldens would land on the paths the live ts-defold module
 * already owns. Evaluation therefore runs through unregistered in-memory targets
 * (`evaluateMarkdownCandidate`) and only a `go` module is ever registered. */
interface LibraryRecord {
  library: string;
  repo: string;
  ref: string;
  license: string;
  prefix: string;
  classificationDir: string;
  decisions: ModuleDecision[];
}

interface LibraryTargetRow {
  module: string;
  path: string;
  fixture: string;
  generated: string;
}

/** The two `library-targets.json` fields a severed library's record supplies
 * itself. A markdown `no-go` judges the markdown source, not the ts-defold
 * dependency, so a no-go library may still fork into the authored lane and drop
 * its row — but it still owes its recorded verdict a resolvable snapshot and
 * classification module. Keeping a dead row to satisfy the lookup would make
 * `library-targets.json` stop meaning "still ts-defold-sourced", so the override
 * lives on the decisions that severed. A fork starts byte-identical to the
 * retired snapshot, so `fixture` may point at the vendored authored copy, and the
 * recorded comparison holds until an authored correction changes a term the
 * comparison scores — at which point the verdict is re-checked, not the pin
 * re-baselined blindly.
 *
 * The override lives on the *decision*, not the record, because a multi-module
 * library severs one distinct snapshot per module: defold-input's ten modules
 * have ten `packages/defold-input/in.<mod>.d.ts` paths and ten forks, so a single
 * record-level value would score every one of them against one snapshot and pin
 * one digest instead of ten. */
interface SeveredSource {
  path: string;
  fixture: string;
}

/** The severance override recorded for one module of `record`, or `undefined`
 * while the library is still ts-defold-sourced. */
function severedFor(record: LibraryRecord, module: string): SeveredSource | undefined {
  return record.decisions.find((d) => d.module === module)?.severedSource;
}

/** The `library-targets.json` row a moduleId ships from. The ts-defold snapshot
 * path and the classification module name are read from the row rather than
 * composed from the moduleId, because the two coincide only by convention:
 * `bzAnim.bzLibrary` ships in `packages/bzAnim/bzAnim.bzAnim.d.ts`, so both
 * guesses would miss. `writeClassification` derives the classification name from
 * the upstream filename, which is what `basename(path)` reproduces. */
function targetFor(moduleId: string, severed?: SeveredSource): LibraryTargetRow {
  const { targets } = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
  ) as { targets: LibraryTargetRow[] };
  const row = targets.find((t) => t.module === moduleId);
  if (row !== undefined) return row;
  if (severed !== undefined) {
    return { module: moduleId, ...severed, generated: `generated/${moduleId}.d.ts` };
  }
  throw new Error(`no library-targets row for ${moduleId}`);
}

function classificationModule(moduleId: string, severed?: SeveredSource): string {
  return basename(targetFor(moduleId, severed).path, ".d.ts");
}

function candidateTarget(record: LibraryRecord, decision: ModuleDecision): MarkdownTarget {
  const moduleId = `${record.prefix}${decision.module}`;
  return {
    repo: record.repo,
    ref: record.ref,
    license: record.license,
    markdown: decision.markdown ?? "",
    moduleId,
    namespace: moduleId,
    generated: `generated/${moduleId}.d.ts`,
    apiDoc: `api-doc/${moduleId}.json`,
    fidelity: `fidelity/${moduleId}.json`,
    decision: decision.decision,
  };
}

function fixtureText(record: LibraryRecord, decision: ModuleDecision): string {
  return readFileSync(
    join(PACKAGE_ROOT, "fixtures/markdown", `${record.prefix}${decision.module}.md`),
    "utf8",
  );
}

// Drop the sections belonging to the other receiver so the remainder satisfies
// the parser's uniform-prefix invariant. Test-local on purpose: per-receiver
// splitting is a front-end feature the measured verdicts show would buy no
// decision change on either library that needs it.
function filterToReceiver(markdown: string, receiver: string): string {
  const kept: string[] = [];
  let dropping = false;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{2,3}\s+([A-Za-z_]\w*)\.[A-Za-z_]\w*\(.*\)\s*$/);
    if (heading !== null) dropping = heading[1] !== receiver;
    else if (/^#{1,6}\s/.test(line)) dropping = false;
    if (!dropping) kept.push(line);
  }
  return kept.join("\n");
}

/**
 * Run one test-rewritten reading of a refused `shared-document` snapshot through
 * the real pipeline — parse, retarget onto the publish namespace, emit, compare
 * against the ts-defold surface it would replace. `evaluateMarkdownCandidate`
 * cannot serve here because it reads the snapshot as committed, which is exactly
 * the string the parser refuses.
 *
 * A severed library passes its `severedSource` so the comparison still resolves a
 * snapshot after its `library-targets.json` row is gone — the same override
 * `comparisonFor` threads into `evaluateMarkdownCandidate`.
 */
async function comparisonForMarkdown(markdown: string, moduleId: string, severed?: SeveredSource) {
  const doc = retargetDoc(parseMarkdownApi(markdown, moduleId), moduleId);
  const regen = (await import(join(PACKAGE_ROOT, "..", "types", "scripts", "regen.ts"))) as {
    generateModuleDeclaration: (entry: {
      namespace: string;
      doc: unknown;
      outFile: string;
      importsFrom?: string;
      moduleId?: string;
    }) => { contents: string };
  };
  const { contents } = regen.generateModuleDeclaration({
    namespace: moduleId,
    doc,
    outFile: `${moduleId}.d.ts`,
    importsFrom: "../src/core-types",
    moduleId,
  });
  const tsDefold = readFileSync(join(PACKAGE_ROOT, targetFor(moduleId, severed).fixture), "utf8");
  return { doc, emitted: contents, ...compareFidelityToTsDefold(contents, tsDefold) };
}

/**
 * The four assertions every per-library decision record owes, so a sibling
 * library costs a decision table plus its own evidence rather than a copied
 * describe block: the record covers exactly the library's shipped modules, a
 * `no-markdown` module has no snapshot, a `no-signature-section` module is
 * refused by the parser, and a `no-go` module stays wired to ts-defold.
 */
function describeLibraryDecisions(record: LibraryRecord): void {
  const { library, ref, decisions } = record;
  const noGo = decisions.filter((d) => d.decision === "no-go");

  describe(`${library} per-module fidelity decisions at tag ${ref}`, () => {
    test("the decision record covers exactly the library's library-targets modules", () => {
      const libraryTargets = JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
      ) as { targets: { module: string }[] };
      const shipped = libraryTargets.targets
        .map((t) => t.module)
        .filter((m) => m.startsWith(record.prefix))
        .sort();
      const recorded = decisions.map((d) => `${record.prefix}${d.module}`).sort();
      // A `go` module is dropped from library-targets.json at cutover, so only
      // the retained (no-go) modules are still expected to appear there.
      expect(recorded.filter((m) => shipped.includes(m))).toEqual(shipped);
      expect(decisions.every((d) => d.reason === "no-markdown" || d.markdown !== undefined)).toBe(
        true,
      );
    });

    const noMarkdown = decisions.filter((d) => d.reason === "no-markdown");
    if (noMarkdown.length > 0) {
      test.each(
        noMarkdown,
      )(`${record.prefix}$module ships no upstream .md, so it has no snapshot to parse`, (decision) => {
        expect(
          existsSync(
            join(PACKAGE_ROOT, "fixtures/markdown", `${record.prefix}${decision.module}.md`),
          ),
        ).toBe(false);
      });
    }

    // Both classes are proven the same way — the front-end refuses the snapshot.
    // They differ in *why*: `no-signature-section` documents no signatures at
    // all, `doc-dialect` documents them in a convention the parser cannot read.
    const signatureless = decisions.filter(
      (d) => d.reason === "no-signature-section" || d.reason === "doc-dialect",
    );
    if (signatureless.length > 0) {
      test.each(
        signatureless,
      )(`${record.prefix}$module is refused by the markdown parser ($reason)`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(() => parseMarkdownApi(fixtureText(record, decision), moduleId)).toThrow(
          /signature/,
        );
      });
    }

    // A third refusal class, proven the same way but by a different message: the
    // parser reads the sections and rejects them for spanning two receivers —
    // sibling modules or a module plus its returned instance's methods — so the
    // `/signature/` matcher above would not match it.
    const sharedDocument = decisions.filter((d) => d.reason === "shared-document");
    if (sharedDocument.length > 0) {
      test.each(
        sharedDocument,
      )(`${record.prefix}$module is refused because one document covers several modules`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(() => parseMarkdownApi(fixtureText(record, decision), moduleId)).toThrow(
          /non-uniform module prefix/,
        );
      });
    }
  });

  // Severance is a whole-record move: the two branches below assert opposite
  // things about the same shared config, so a record with some decisions severed
  // and some not would take one branch and quietly assert the wrong half for the
  // rest. Partial severance is therefore forbidden outright rather than
  // supported — no library needs it, and forbidding it is what lets the branch
  // key off `some`.
  const severedCount = decisions.filter((d) => d.severedSource !== undefined).length;
  describe(`${library} severs ts-defold all at once or not at all`, () => {
    test("every decision carries a severedSource, or none does", () => {
      expect([severedCount === 0, severedCount === decisions.length]).toContain(true);
    });
  });

  // A `no-go` retires the *markdown* front-end as this library's regeneration
  // path. Whether it also keeps the ts-defold dependency is a separate question,
  // and the two answers get opposite assertions: an unsevered library must still
  // carry its row, fixture, and classification entry; a severed one must have
  // dropped all three, its verdict now resolving through `severedSource`.
  if (noGo.length > 0 && severedCount === 0) {
    describe(`every no-go ${library} module stays ts-defold-sourced`, () => {
      const dtsCheck = readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8");

      const shippedModules = (
        JSON.parse(readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8")) as {
          targets: { module: string }[];
        }
      ).targets.map((t) => t.module);

      test.each(
        noGo,
      )(`${record.prefix}$module keeps its ts-defold row and fixture and stays out of the dts-check include`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(shippedModules).toContain(moduleId);
        expect(existsSync(join(PACKAGE_ROOT, targetFor(moduleId).fixture))).toBe(true);
        expect(dtsCheck).not.toContain(`generated/${moduleId}.d.ts`);
      });

      test("no no-go module is registered as a markdown target", () => {
        const registered = readMarkdownTargets(PACKAGE_ROOT).map((t) => t.moduleId);
        for (const decision of noGo) {
          expect(registered).not.toContain(`${record.prefix}${decision.module}`);
        }
      });

      test(`the ${record.classificationDir} dir retains exactly the modules that stayed`, () => {
        const classification = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
        ) as { dirs: { dir: string; modules: string[] }[] };
        const entry = classification.dirs.find((d) => d.dir === record.classificationDir);
        expect(entry).toBeDefined();
        expect([...(entry?.modules ?? [])].sort()).toEqual(
          noGo.map((d) => classificationModule(`${record.prefix}${d.module}`)).sort(),
        );
      });
    });
  }

  if (noGo.length > 0 && severedCount > 0) {
    describe(`every no-go ${library} module severed ts-defold for the authored lane`, () => {
      const shippedModules = (
        JSON.parse(readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8")) as {
          targets: { module: string }[];
        }
      ).targets.map((t) => t.module);
      const authoredTargets = readAuthoredTargets(PACKAGE_ROOT);

      // Whether the ts-defold golden dies with the row depends on the namespace
      // the fork publishes under, so the assertion cannot be unconditional. A
      // library that collapses to a bare namespace (starly's `starly.starly` ->
      // `starly`) leaves `generated/<moduleId>.d.ts` behind as a dead path; a
      // dotted severance that keeps `namespace === moduleId` (defold-input's ten)
      // overwrites that exact golden in place, so requiring its absence would
      // demand deleting the file the fork still emits.
      test.each(
        noGo,
      )(`${record.prefix}$module dropped its ts-defold row, and its dotted golden per its registered namespace`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(shippedModules).not.toContain(moduleId);
        const target = authoredTargets.find((t) => t.moduleId === moduleId);
        const dottedGolden = `generated/${moduleId}.d.ts`;
        if (target?.namespace === moduleId) {
          expect(existsSync(join(PACKAGE_ROOT, dottedGolden))).toBe(true);
          expect(target.generated).toBe(dottedGolden);
        } else {
          expect(existsSync(join(PACKAGE_ROOT, dottedGolden))).toBe(false);
        }
      });

      test("no no-go module is registered as a markdown target", () => {
        const registered = readMarkdownTargets(PACKAGE_ROOT).map((t) => t.moduleId);
        for (const decision of noGo) {
          expect(registered).not.toContain(`${record.prefix}${decision.module}`);
        }
      });

      test(`the ${record.classificationDir} dir is gone from library-classification.json`, () => {
        const classification = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
        ) as { dirs: { dir: string }[] };
        expect(classification.dirs.some((d) => d.dir === record.classificationDir)).toBe(false);
      });

      // The two recorded fields carry identity at different strengths. The
      // `fixture` is always `fixtures/authored/<moduleId>.d.ts`, so it is held to
      // strict identity — that is what catches a `severedSource` copy-pasted from
      // a sibling module. The `path` is the retired ts-defold row verbatim, whose
      // basename is the *upstream filename* and coincides with the moduleId only
      // by convention: `bzAnim.bzLibrary` ships in `bzAnim.bzAnim.d.ts`, so `path`
      // is held to this library's prefix instead.
      test.each(
        noGo,
      )(`${record.prefix}$module still resolves its snapshot and classification module`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        const severed = severedFor(record, decision.module);
        expect(severed).toBeDefined();
        const target = targetFor(moduleId, severed);
        expect(existsSync(join(PACKAGE_ROOT, target.fixture))).toBe(true);
        expect(basename(target.fixture, ".d.ts")).toBe(moduleId);
        expect(classificationModule(moduleId, severed)).toStartWith(record.prefix);
      });

      // Ten modules, ten distinct forks: a record-level override would resolve
      // every one of them to whichever single snapshot it held. Both fields are
      // checked because the prefix-shaped `path` assertion above no longer rejects
      // a sibling's path on its own.
      test("each severed module resolves a distinct snapshot", () => {
        const targets = noGo.map((d) =>
          targetFor(`${record.prefix}${d.module}`, severedFor(record, d.module)),
        );
        expect(new Set(targets.map((t) => t.fixture)).size).toBe(targets.length);
        expect(new Set(targets.map((t) => t.path)).size).toBe(targets.length);
      });
    });
  }
}

// The recorded per-module fidelity decision for `britzl/defold-input` at tag
// 4.7.1 — the audit record this evaluation produced. Every module is `no-go`, so
// none is registered as a markdown target.
//
// All ten have since severed ts-defold for the authored lane — the first
// multi-module severance, and the reason `severedSource` sits on the decision
// rather than the record: ten modules mean ten distinct snapshots. The verdicts
// below are unchanged and final, and they are now read off the authored forks
// rather than the retired `fixtures/ts-defold/in.<mod>.d.ts` copies. The terms
// survive that move because the forks are the *mapped* goldens and
// `compareFidelityToTsDefold` (`sync-markdown-types.ts:610`) scores no type
// token — it tests for an introduced `unknown`, counts parameters and `void`
// returns, and reads `?`, none of which a `hash` -> `Hash` respelling touches.
// The reserved-word blocker recorded below is likewise unaffected: it is a fact
// about the *markdown* emitter, which the authored lane never reaches. If a term
// does move, re-measure and record why — never relax the assertion.
// `reason` names which evidence class drove the decision:
//
//   no-markdown          upstream ships no `in/<mod>.md` at the pin at all.
//   no-signature-section the `.md` is usage/tutorial prose with no
//                        `### <recv>.<fn>(...)` header, so the parser loud-fails.
//   doc-dialect          the `.md` does document signature sections, but in a
//                        markdown convention the front-end does not parse, so it
//                        loud-fails all the same. The convention need not be
//                        unreadable — starly's headings are well-formed
//                        `<recv>.<fn>(...)` signatures that happen to be wrapped
//                        in backticks — only unmatched. Recorded only alongside
//                        independent evidence that a dialect-aware parse would
//                        not change the decision.
//   shared-document      the parser reads the `.md`'s convention fine, but one
//                        document documents more than one receiver, so the
//                        uniform-prefix invariant refuses it. Two forms: sibling
//                        modules sharing a README (metrics' `fps.`/`mem.`), and a
//                        module plus the instance-method family of the object it
//                        returns (platypus' `platypus.`/`instance.`). The
//                        invariant refuses both identically, but the remedy
//                        differs — a per-receiver parse would help the first and
//                        actively harm the second, which would hoist instance
//                        methods into module scope. A granularity gap, not a
//                        dialect gap — recorded only alongside evidence that a
//                        per-receiver parse would not change the decision either.
//   surface-loss         the `.md` parses, but the structural gate reports the
//                        markdown surface losing members versus ts-defold.
//   signature-loss       the `.md` parses and loses no member, but the members it
//                        keeps lost their parameters or their non-`void` return —
//                        a prose-only README that documents names, not types.
//   type-downgrade       the `.md` parses, loses no member, and every member keeps
//                        its parameters and its return — but the types those
//                        parameters and returns resolve to are weaker than
//                        ts-defold's. The only class reachable by a document the
//                        front-end accepts in full: every other one is scored on a
//                        refusal or on a hole in the surface, so this is what is
//                        left when the document is read exactly as written and the
//                        loss is precision alone.
const DEFOLD_INPUT: LibraryRecord = {
  library: "defold-input",
  repo: "https://github.com/britzl/defold-input",
  ref: "4.7.1",
  license: "MIT",
  prefix: "in.",
  classificationDir: "defold-input",
  decisions: [
    {
      module: "accelerometer",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/accelerometer.md",
      severedSource: {
        path: "packages/defold-input/in.accelerometer.d.ts",
        fixture: "fixtures/authored/in.accelerometer.d.ts",
      },
    },
    {
      module: "button",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/button.md",
      severedSource: {
        path: "packages/defold-input/in.button.d.ts",
        fixture: "fixtures/authored/in.button.d.ts",
      },
    },
    {
      module: "cursor",
      decision: "no-go",
      reason: "surface-loss",
      markdown: "in/cursor.md",
      severedSource: {
        path: "packages/defold-input/in.cursor.d.ts",
        fixture: "fixtures/authored/in.cursor.d.ts",
      },
    },
    {
      module: "gesture",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/gesture.md",
      severedSource: {
        path: "packages/defold-input/in.gesture.d.ts",
        fixture: "fixtures/authored/in.gesture.d.ts",
      },
    },
    {
      module: "keyboard",
      decision: "no-go",
      reason: "no-markdown",
      severedSource: {
        path: "packages/defold-input/in.keyboard.d.ts",
        fixture: "fixtures/authored/in.keyboard.d.ts",
      },
    },
    {
      module: "mapper",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/mapper.md",
      severedSource: {
        path: "packages/defold-input/in.mapper.d.ts",
        fixture: "fixtures/authored/in.mapper.d.ts",
      },
    },
    {
      module: "onscreen",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/onscreen.md",
      severedSource: {
        path: "packages/defold-input/in.onscreen.d.ts",
        fixture: "fixtures/authored/in.onscreen.d.ts",
      },
    },
    {
      module: "state",
      decision: "no-go",
      reason: "surface-loss",
      markdown: "in/state.md",
      severedSource: {
        path: "packages/defold-input/in.state.d.ts",
        fixture: "fixtures/authored/in.state.d.ts",
      },
    },
    {
      module: "textbox",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/textbox.md",
      severedSource: {
        path: "packages/defold-input/in.textbox.d.ts",
        fixture: "fixtures/authored/in.textbox.d.ts",
      },
    },
    {
      module: "triggers",
      decision: "no-go",
      reason: "no-markdown",
      severedSource: {
        path: "packages/defold-input/in.triggers.d.ts",
        fixture: "fixtures/authored/in.triggers.d.ts",
      },
    },
  ],
};

// The recorded per-module decision for `britzl/monarch` at tag 6.0.2 — the second
// multi-module Bucket-C library, and the first whose evaluation needed a
// front-end change: `README_API.md` writes its signatures at `##`, so before the
// header-level widening the parser saw zero sections and the recorded reason
// would have been a tooling artifact rather than a fidelity judgment.
//
// All three modules are `no-go` — the markdown front-end is not monarch's
// regeneration path — and all three have since severed ts-defold for the authored
// lane, keeping `namespace === moduleId` so the goldens are overwritten in place.
//
// The snapshots the terms below are read from are therefore the authored forks,
// not `fixtures/ts-defold/`. Every recorded term is unchanged across that move,
// because a verbatim fork differs from its ts-defold source only in type tokens
// (`hash` -> `Hash`, `vmath.vector3` -> `Vector3`) and
// `compareFidelityToTsDefold` scores no type token (`sync-markdown-types.ts:610`).
// If a term does move, re-measure and record why — never relax the assertion.
//
// The `transitions.gui` fork has since gained twelve declared functions, upstream's
// transition constructors having been corrected from `const`s of a callable alias. Its
// verdict is unmoved and carries no name-set term to re-measure: `no-signature-section`
// is a *parser refusal* on `README_TRANSITIONS.md`, so no comparison against the fork is
// ever built and the decision is derived from the markdown side alone.
const MONARCH: LibraryRecord = {
  library: "monarch",
  repo: "https://github.com/britzl/monarch",
  ref: "6.0.2",
  license: "MIT",
  prefix: "monarch.",
  classificationDir: "monarch",
  decisions: [
    {
      module: "monarch",
      decision: "no-go",
      reason: "surface-loss",
      markdown: "README_API.md",
      severedSource: {
        path: "packages/monarch/monarch.monarch.d.ts",
        fixture: "fixtures/authored/monarch.monarch.d.ts",
      },
    },
    {
      module: "transitions.easings",
      decision: "no-go",
      reason: "no-markdown",
      severedSource: {
        path: "packages/monarch/monarch.transitions.easings.d.ts",
        fixture: "fixtures/authored/monarch.transitions.easings.d.ts",
      },
    },
    {
      module: "transitions.gui",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "README_TRANSITIONS.md",
      severedSource: {
        path: "packages/monarch/monarch.transitions.gui.d.ts",
        fixture: "fixtures/authored/monarch.transitions.gui.d.ts",
      },
    },
  ],
};

// The recorded per-module decision for `britzl/defold-richtext` at tag 5.22.1 —
// the third multi-module Bucket-C library, and the first whose documented module
// parses cleanly: the single root `README.md` yields 8 fully-typed `richtext.*`
// functions with no loud-fail. It is `no-go` anyway, and the reason is a fidelity
// judgment rather than a tooling gap: ts-defold's surface is a hand-crafted
// structural API (`Word`, a 16-field `Settings`, `TextMetrics`, branded
// `Alignment`/`VAlignment`) plus 7 paren-less `ALIGN_*`/`VALIGN_*` constant
// headings, and a flat signature parse collapses all of it. `color` and `tags`
// are documented nowhere as signature sections — only inside fenced Lua examples
// and prose bullets — so both are `no-markdown`, not `no-signature-section`.
//
// All three have since severed ts-defold for the authored lane, keeping
// `namespace === moduleId` so the goldens are overwritten in place. The snapshots
// the terms below are read from are therefore the authored forks, not
// `fixtures/ts-defold/`. Every recorded term is unchanged across that move,
// because a verbatim fork differs from its ts-defold source only in type tokens
// (`hash` -> `Hash`, `vmath.vector4` -> `Vector4`) and
// `compareFidelityToTsDefold` scores no type token (`sync-markdown-types.ts:610`).
// If a term does move, re-measure and record why — never relax the assertion.
//
// Unlike monarch, no upstream correction landed with this cutover, and the
// absence is deliberate rather than unfinished work: `addedMembers` is `[]`, so
// the markdown surface names nothing our types lack, and every module forked
// verbatim. What the fork owes the verdict instead is the structure the flat
// parse collapses — the 7 `ALIGN_*`/`VALIGN_*` constants and the six named types
// the `surface-loss` case rests on — which is pinned as an assertion below rather
// than left to this comment.
const RICHTEXT: LibraryRecord = {
  library: "richtext",
  repo: "https://github.com/britzl/defold-richtext",
  ref: "5.22.1",
  license: "MIT",
  prefix: "richtext.",
  classificationDir: "defold-richtext",
  decisions: [
    {
      module: "color",
      decision: "no-go",
      reason: "no-markdown",
      severedSource: {
        path: "packages/defold-richtext/richtext.color.d.ts",
        fixture: "fixtures/authored/richtext.color.d.ts",
      },
    },
    {
      module: "richtext",
      decision: "no-go",
      reason: "surface-loss",
      markdown: "README.md",
      severedSource: {
        path: "packages/defold-richtext/richtext.richtext.d.ts",
        fixture: "fixtures/authored/richtext.richtext.d.ts",
      },
    },
    {
      module: "tags",
      decision: "no-go",
      reason: "no-markdown",
      severedSource: {
        path: "packages/defold-richtext/richtext.tags.d.ts",
        fixture: "fixtures/authored/richtext.tags.d.ts",
      },
    },
  ],
};

// The recorded decision for `whiteboxdev/library-defold-persist` at commit
// `b37f61040740f232d86f68e2606f27b6f1bd15c4` — the fourth Bucket-C library, and
// the first pinned to a SHA rather than a tag: upstream publishes no tags and no
// releases at all, and its README installs from `archive/main.zip`. Its license is
// Zlib, not the MIT every prior sibling carried.
//
// It is also the library that exposed the fidelity gate's false `go`. The single
// root `README.md` documents 6 `### persist.<fn>(...)` headings with no
// `**PARAMETERS**` / `**RETURN**` block anywhere, so the parse keeps every member
// name — `missingMembers` is empty — and emits six argument-less `(): void` stubs
// that contain no `unknown` token, so `downgradedMembers` is empty too. Both terms
// of the old two-term rule read clean and the gate computed `go`, which would have
// retired a fully-typed five-function surface. The comparator now scores a dropped
// parameter list and a lost non-`void` return as `signatureLossMembers`, and the
// decision is `no-go` on its own evidence. Upstream is abandoned (the README's
// first line redirects to `Klaleus/defold-checkpoint`), so this decision is final
// rather than provisional.
//
// It is also the first library to sever ts-defold on a `no-go`. The verdict below
// is unchanged and final; what changed is the answer to the separate question a
// `no-go` never asked — where the types are *maintained*. persist's ts-defold
// surface is small, fully typed, and better than its README, so it forked into
// the authored lane verbatim rather than staying a ts-defold consumer, and
// `severedSource` supplies the `library-targets.json` fields the dropped row used
// to.
const PERSIST: LibraryRecord = {
  library: "persist",
  repo: "https://github.com/whiteboxdev/library-defold-persist",
  ref: "b37f61040740f232d86f68e2606f27b6f1bd15c4",
  license: "Zlib",
  prefix: "persist.",
  classificationDir: "library-defold-persist",
  decisions: [
    {
      module: "persist",
      decision: "no-go",
      reason: "signature-loss",
      markdown: "README.md",
      severedSource: {
        path: "packages/library-defold-persist/persist.persist.d.ts",
        fixture: "fixtures/authored/persist.persist.d.ts",
      },
    },
  ],
};

// The recorded decision for `indiesoftby/defold-yagames` at tag `0.19.0` — the
// fifth Bucket-C library, one module, and the first `doc-dialect` record.
//
// Upstream's single root `README.md` is a full API reference: 70 backticked
// `#### <recv>.<fn>(...)` headings, 66 under `yagames.` and 4 under `sitelock.`.
// The front-end reads none of it, because the document diverges from the corpus
// convention four independent ways — `####` and backticked headings against
// `##`/`###` bare ones, `**Parameters:**`/`**Returns:**` against
// `**PARAMETERS**`/`**RETURN**`, `- ` bullets against `* `, and
// `` `x` <kbd>type</kbd> `` against `` `x` (type) ``. That vocabulary is eight
// bare Lua tokens with no structural types at all, against a ts-defold surface
// of hand-written interfaces and named callback types.
//
// None of that dialect work would change the outcome, and the evidence describe
// below re-measures that against the *forked* snapshot rather than the retired
// ts-defold one. Unlike persist (verbatim) and orthographic (a rename and a
// widened union, neither of which the gate scores), the yagames fork has moved
// twice since the severance, so the recorded numbers move with it by design. The
// severance retired `banner_init`, `banner_create`, `banner_delete`,
// `banner_refresh`, `banner_set` in favour of the documented
// `adv_show_banner_adv`/`adv_hide_banner_adv`/`adv_get_banner_adv_status`; the
// upstream-parity correction then declared the 22 members the fork had never
// carried and withdrew the four `sitelock.`-receiver names the pinned
// `yagames.lua` does not export. The surface is 68 members, and the
// generous-reading gap is the 2 upstream still declares but no longer documents —
// `leaderboards_init` and `player_get_id`. Any gap at all forces `no-go` for
// surface-loss, so the verdict is unchanged; what the smaller number costs is only
// the size of the margin. Reading only the `yagames.` prefix the uniform-prefix
// rule would enforce, the gap is the same 2: the restriction used to strand the
// four sitelock declarations, and there are none left to strand.
//
// yagames is also the library that exposed the comparator's `//*` comment-strip
// defect: its fixture's `//* Advertisement` section markers opened a block
// comment that ran to the next JSDoc terminator, truncating the surface it
// reported. Every term of a comparison against that truncated surface fails
// toward `go`.
const YAGAMES: LibraryRecord = {
  library: "yagames",
  repo: "https://github.com/indiesoftby/defold-yagames",
  ref: "0.19.0",
  license: "MIT",
  prefix: "yagames.",
  classificationDir: "defold-yagames",
  decisions: [
    {
      module: "yagames",
      decision: "no-go",
      reason: "doc-dialect",
      markdown: "README.md",
      severedSource: {
        path: "packages/defold-yagames/yagames.yagames.d.ts",
        fixture: "fixtures/authored/yagames.yagames.d.ts",
      },
    },
  ],
};

// The recorded decision for `britzl/gooey` at tag `10.5.3` — the sixth Bucket-C
// library, one module, and the first to trip all three no-go terms at once.
//
// Unlike yagames the dialect is fully accepted: the README writes bare
// `### gooey.<fn>(...)` headings, `**PARAMETERS**`/`**RETURN**`, and
// `* \`name\` (type) - doc` bullets — exactly the corpus convention — so the
// parser returns 8 elements rather than refusing. This is a structural fidelity
// judgment, not a tooling gap. Against the fork's 20-function surface:
//
//   surface-loss    12 missing members. Four — `horizontal_dynamic_list`,
//                   `vertical_dynamic_list`, `horizontal_static_list` and
//                   `vertical_static_list` — are documented at `#####` under a
//                   `**HORIZONTAL AND VERTICAL LISTS**` prose block, and
//                   `HEADER` accepts `#{2,3}` only. The other eight —
//                   `is_enabled`, `acquire_input`, `release_input`,
//                   `create_theme`, `mask_text`, `radiogroup`,
//                   `horizontal_scrollbar` and `set_focus` — the parity
//                   correction took from `gooey.lua`, and the README documents
//                   none of them at any header level.
//   type downgrade  8 of 8 parsed members. The README's vocabulary is bare Lua
//                   tokens — `table`, `function`, and `bool` (an upstream typo
//                   for `boolean`) — against the fork's hand-written state
//                   interfaces threaded through typed callbacks.
//   signature loss  1 member, `vertical_scrollbar`: `gooey.lua:149` takes
//                   `config` between `action` and `fn` and the README documents
//                   the six-parameter form that predates it.
//
// Widening `HEADER` past `#{2,3}` cannot flip the verdict, on three independent
// counts: the four `#####` sections have empty bodies, so parsing them would emit
// four zero-arity `(): void` stubs and trade surface-loss for signature-loss; the
// static pair is written upstream with the *dynamic* signature
// (`root_id, item_id, data`) where ts-defold declares `item_ids` and neither
// `root_id` nor `data`; and the 8 type downgrades are independent of header level
// entirely. Upstream is not poorer than ts-defold on content — it documents
// `group` with four parameters where ts-defold declares two — but the state
// tables it describes live in `The state table contains the following fields:`
// bullet blocks that the flat signature parser deliberately ignores, and lifting
// those into named types is deep-prose work the PRD lists as a non-goal.
//
// One note for a future re-evaluation: `bool` is not in `KNOWN_LOSSY_TOKENS`, so
// building a fidelity report for this module would loud-fail in
// `computeMarkdownFidelity`. No report is built for a no-go module, so nothing is
// added — recorded here so that loud-fail is not later read as a regression.
//
// Since the severance the snapshot every term above is read from is the authored
// fork, not the retired `fixtures/ts-defold/` copy. Two rounds of parity
// corrections have moved it since, each re-measured here rather than assumed:
//
// The first was `group`. `gooey.lua:191` declares `M.group(id, action_id, action,
// fn)` where ts-defold bound two parameters, matching the LDoc block above that
// function — which lists only `@param id` and `@param fn` — rather than the
// signature. That correction is scored by nothing: signature loss fires only when
// the markdown side is the poorer one, and `group` ran the other way (4 documented
// against 2 declared before, 4 against 4 after).
//
// The second completed the fork against `gooey.lua` — eight members declared, five
// parameter lists corrected — and moved two terms. Surface-loss went 4 -> 12, the
// eight new members being undocumented in the README. Signature loss stayed at one
// member but changed which: `dynamic_list` left it, because the `root_id` its
// heading named and its `**PARAMETERS**` run omitted was never in `gooey.lua` and
// the fork dropped it, leaving the markdown side the wider one by a parameter;
// `vertical_scrollbar` entered it, the fork having taken upstream's `config`.
// Type downgrade and `addedMembers` are unmoved — both are member-level over the
// 8 parsed names, which neither correction touched.
//
// The `no-go` stands either way, and now on a wider surface loss than when it was
// first recorded.
const GOOEY: LibraryRecord = {
  library: "gooey",
  repo: "https://github.com/britzl/gooey",
  ref: "10.5.3",
  license: "MIT",
  prefix: "gooey.",
  classificationDir: "gooey",
  decisions: [
    {
      module: "gooey",
      decision: "no-go",
      reason: "surface-loss",
      markdown: "README.md",
      severedSource: {
        path: "packages/gooey/gooey.gooey.d.ts",
        fixture: "fixtures/authored/gooey.gooey.d.ts",
      },
    },
  ],
};

// The recorded decision for `britzl/defold-metrics` at tag `1.2.1` — the seventh
// Bucket-C library, and the first whose *one* document covers *two* modules.
//
// Every prior sibling ships one `.md` per module. `defold-metrics` documents both
// `metrics.fps` and `metrics.mem` in a single root `README.md` under two
// receivers — `### fps.create(...)` and `### mem.create(...)` — so the front-end's
// uniform-prefix invariant refuses it, identically for either moduleId:
//
//   parse-markdown-api: non-uniform module prefix across headers: fps, mem
//
// The dialect itself is fully accepted (`**PARAMETERS**`, `**RETURNS**`,
// `* \`name\` (type) - doc`), which is why this is `shared-document` rather than
// `doc-dialect`: the gap is document granularity, not convention support.
//
// Filtering the README to one receiver before parsing yields 4 elements per
// module and still lands `no-go`, on a single term for each — as first recorded,
// before the severance and the correction the closing paragraph describes:
//
//   term                   metrics.fps                 metrics.mem
//   tsDefoldMembers        ["create"]                  ["create"]
//   missingMembers         []                          []
//   signatureLossMembers   []                          []
//   downgradedMembers      ["create"]                  ["create"]
//   addedMembers           ["draw","fps","update"]     ["draw","mem","update"]
//
// ts-defold hand-writes a factory — `create(...): Metrics` over an interface of
// `fps()`/`update()`/`draw()` — while the README types the return as bare `table`,
// emitting `Record<string | number, unknown>`. The `Metrics` interface is outside
// `MEMBER_DECL`'s function/const surface and never enters the comparison, exactly
// as gooey's state aliases did not.
//
// The `addedMembers` are real, not an artifact: upstream `metrics/fps.lua` holds
// `local singleton = M.create()` plus module-level `M.update`/`M.fps`/`M.draw`
// delegating to it, and ts-defold omits all three. So metrics is the closest
// Bucket-C has come to a `go` — it loses no member and drops no parameter, and
// *adds* three genuine ones. Only the factory return blocks it.
//
// metrics is also the library that exposed the gate's unscored optionality loss.
// ts-defold declares every `create` parameter optional; the markdown emit declares
// all of them required, because optionality reaches the front-end only through a
// `[name]` bracket in the heading and this README writes it in prose ("Optional
// sample count") under a bare `fps.create(samples, format, position, color)`.
// Same arity, same names — so had the `**RETURNS**` named a mappable token
// instead of `table`, both modules would have computed `go` while breaking every
// existing `create()` call site. The comparator now scores that as
// `optionalityLossMembers`.
//
// Both modules have since severed ts-defold for the authored lane under
// `namespace === moduleId`, so the snapshots the terms above are read from are
// the authored forks. This is the first record whose terms moved *because* an
// authored correction landed rather than in spite of a lane move: the fork adds
// the three module-level members upstream really defines — `M.update`, `M.fps`
// (`M.mem` in `metrics.mem`) and `M.draw`, delegating to a `local singleton =
// M.create()` at `metrics/fps.lua:42` and `metrics/mem.lua:34` — so
// `addedMembers` has collapsed from three names to `[]`. That is the whole of
// the movement, and it is the correction's proof; every other term is unchanged,
// which is why `addedMembers: []` must not be read as metrics having become a
// `go`. The `no-go` stands exactly where it did: on `create`'s `table` return,
// scored as `downgradedMembers: ["create"]`, plus the unscored-until-now
// optionality loss on the same member.
//
// The field correction then declared upstream's three drawing defaults —
// `POSITION`, `FORMAT` and `COLOR` — in each fork, so `tsDefoldMembers` is the
// seven `["COLOR","FORMAT","POSITION","create","draw","<mod>","update"]` and
// `missingMembers` is the three constant names the README documents nowhere.
// `MEMBER_DECL` matches a bare or exported `const`, which is the only reason a
// field declaration reaches this comparison at all; and no other term can move,
// because the three signature/downgrade/optionality terms all return early
// unless both sides hold the name as a function.
const METRICS: LibraryRecord = {
  library: "metrics",
  repo: "https://github.com/britzl/defold-metrics",
  ref: "1.2.1",
  license: "MIT",
  prefix: "metrics.",
  classificationDir: "defold-metrics",
  decisions: [
    {
      module: "fps",
      decision: "no-go",
      reason: "shared-document",
      markdown: "README.md",
      severedSource: {
        path: "packages/defold-metrics/metrics.fps.d.ts",
        fixture: "fixtures/authored/metrics.fps.d.ts",
      },
    },
    {
      module: "mem",
      decision: "no-go",
      reason: "shared-document",
      markdown: "README.md",
      severedSource: {
        path: "packages/defold-metrics/metrics.mem.d.ts",
        fixture: "fixtures/authored/metrics.mem.d.ts",
      },
    },
  ],
};

// The recorded decision for `whiteboxdev/library-defold-rendy` at commit
// `b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3` — the eighth Bucket-C library, one
// module, and the second SHA pin in the corpus: like its persist sibling (same
// upstream author) it publishes no tags and no releases, and carries Zlib rather
// than the MIT every other sibling ships. The ts-defold fixture header cites
// `klaytonkowalski/library-defold-rendy`, which now 301-redirects to the
// `whiteboxdev` slug used here — the same account rename persist recorded.
//
// rendy is the library that widened `HEADER` by an optional `function` keyword.
// Its `## API` section writes 2 of its 11 headings bare (`### rendy.create_camera(
// camera_id)`) and the other 9 as `### function rendy.set(camera_id, property,
// value)`. The keyword form did not match, so the as-is parse returned 2 elements
// rather than throwing — no refusal class applied — and the comparison read 11
// missing members against a `["create_camera","destroy_camera"]` markdown surface.
// Recording that as `surface-loss` would have filed a header dialect as a fidelity
// judgment, the trap the monarch slice fixed at the `##` level. The unmatched
// headings also did not close the preceding section, so the whole rest of the API
// section landed inside `destroy_camera`'s description — a second, independent
// harm the widening removes.
//
// The dialect-aware parse lifts all 11 documented members and does not move the
// verdict:
//
//   missingMembers         []                          (both sides name the same 11)
//   signatureLossMembers   all 11 shared members
//   downgraded / added / optionalityLoss   []
//
// The README carries no `**PARAMETERS**` and no `**RETURN**` block anywhere —
// a heading and one line of prose per function — so every member emits as a
// zero-arity `(): void` stub, discarding `get_display_size(): vmath.vector3`,
// `get_stack(screen_x, screen_y): CameraId[]`, `screen_to_world(camera_id,
// screen_position): vmath.vector3`, the 5-parameter `shake` with its optional
// `scaler`, and the `CameraId` alias itself. Both terms are independently
// decisive; the dominant one — 11 members against 2 — is the signature collapse,
// so the reason is persist's `signature-loss` class, for persist's reason: a
// prose-only README that documents names, not types.
//
// One note for a future re-evaluation: `shake`'s heading writes its optional
// argument as `duration \[, scaler]`, an escaped bracket `bracketedArgs` does not
// read as optional. Inert here — with no `**PARAMETERS**` bullets there are no
// parameters to mark either way — so it is recorded rather than fixed.
const RENDY: LibraryRecord = {
  library: "rendy",
  repo: "https://github.com/whiteboxdev/library-defold-rendy",
  ref: "b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3",
  license: "Zlib",
  prefix: "rendy.",
  classificationDir: "library-defold-rendy",
  decisions: [
    {
      module: "rendy",
      decision: "no-go",
      reason: "signature-loss",
      markdown: "README.md",
      severedSource: {
        path: "packages/library-defold-rendy/rendy.rendy.d.ts",
        fixture: "fixtures/authored/rendy.rendy.d.ts",
      },
    },
  ],
};

// The recorded decision for `britzl/platypus` at tag `4.3.1` (commit
// `a58d54c1fc1b95d67089a039feb5d904c3524298`) — the ninth Bucket-C library, one
// module, and the second `shared-document` refusal, on the second *form* of that
// class.
//
// The root `README.md`'s `# Platypus API` carries 20 signature headings: one
// `### platypus.create(config)` and 19 `### instance.<fn>(...)`. The as-is parse
// throws, byte-identically to metrics':
//
//   parse-markdown-api: non-uniform module prefix across headers: instance, platypus
//
// The dialect is fully accepted — bare `###` headings, `**PARAMETERS**`,
// `**RETURN**`, `* \`name\` (type) - doc` bullets, no `<kbd>` — so this is
// `shared-document`, not `doc-dialect`.
//
// What differs from metrics is *what* the second receiver is. metrics' `fps.` and
// `mem.` are two sibling modules, so a per-receiver parse is at least a coherent
// (if insufficient) path. platypus' `instance.` is not a module: it is the object
// `create` returns, ts-defold's `PlatypusInstance`. A per-receiver parse would
// emit those 19 methods as *module-level* functions — wrong rather than
// incomplete. That is why the class is widened to name both forms instead of
// teaching the front-end a per-receiver parse.
//
// `tsDefoldMembers` is 13 — `create` plus 12 constants (7 message hashes and 5
// `DIR_*` values). Every reading of the document lands no-go, on independently
// decisive terms:
//
//   term                  platypus. only    unified prefix        instance. only
//   elements parsed       1                 20                    19
//   missingMembers        the 12 constants  the 12 constants      all 13
//   addedMembers          []                the 19 methods        the 19 methods
//   downgradedMembers     ["create"]        ["create"]            []
//   signature/optionality []                []                    []
//
// The constants are unreachable under any reading: `DIR_UP`/`DIR_LEFT`/
// `DIR_RIGHT`/`DIR_DOWN`/`DIR_ALL` appear only inside a code example, and the 7
// message hashes are paren-less `### platypus.FALLING` headings under
// `## Messages` that `HEADER` does not match. `create` downgrades because the
// README types both its parameter and its return as bare `(table)`.
//
// The recorded terms are a floor on the loss, not a measure of it. `MEMBER_DECL`
// sees only top-level `function`/`const`, so `PlatypusConfig` (11 optional fields
// plus a required nested `collisions` shape) and `PlatypusInstance` (19 methods plus
// `velocity: vmath.vector3`) never enter the comparison at all — exactly as
// metrics' `Metrics` interface and gooey's state aliases did not. Both collapse
// to `Record<string | number, unknown>` in the markdown emit.
//
// Those two unscored interfaces are exactly why it has since severed ts-defold
// for the authored lane, under the bare namespace `platypus`. The verdict below
// is unchanged and final; it now reads off the forked `.d.ts` rather than the
// retired `fixtures/ts-defold/platypus.platypus.d.ts`, and every recorded term
// survives that move because `compareFidelityToTsDefold` scores no type token —
// the fork is the *mapped* golden, so its `hash` -> `Hash` and
// `vmath.vector3` -> `Vector3` respellings are invisible to the comparison.
const PLATYPUS: LibraryRecord = {
  library: "platypus",
  repo: "https://github.com/britzl/platypus",
  ref: "4.3.1",
  license: "MIT",
  prefix: "platypus.",
  classificationDir: "platypus",
  decisions: [
    {
      module: "platypus",
      decision: "no-go",
      reason: "shared-document",
      markdown: "README.md",
      severedSource: {
        path: "packages/platypus/platypus.platypus.d.ts",
        fixture: "fixtures/authored/platypus.platypus.d.ts",
      },
    },
  ],
};

// The recorded decision for `VowSoftware/starly` at commit
// `85d1b2af8bf0618e7f297da41d03eb55d27e49b6` — the tenth Bucket-C library, one
// module, and the third SHA pin (the repo publishes no tags and no releases).
// The PRD named `whiteboxdev/library-defold-starly`, which 404s; the ts-defold
// fixture's own `@see` already pointed at the `VowSoftware` slug used here.
//
// `## Function API` carries 14 signature headings, every one backtick-wrapped —
// ``### `m_starly.create(id)` `` — which `HEADER` does not match, so the as-is
// parse refuses the document outright. Five axes diverge in total:
//
//   1. headings wrapped in backticks
//   2. mixed-case `**Parameters**` / `**Returns**` markers (the regexes are
//      uppercase-only)
//   3. colon-typed bullets — `* \`id\`: \`hash\` doc` rather than
//      `* \`id\` (hash) - doc`
//   4. type-only return bullets (`* \`boolean\``, `* \`vector3\` or \`nil\``)
//      that name no slot at all
//   5. a blank line between each marker and its bullet run, which closes the
//      list before a single bullet is read
//
// The receiver alias `m_starly` is *not* one of them — `retargetDoc` rewrites it
// onto `starly.starly` exactly as it rewrites orthographic's `camera`.
//
// Under a maximally generous reading — all five axes rewritten, and
// `[visible = false]` reduced to `[visible]` so `bracketedArgs` reads it — the
// parse yields all 14 functions and the verdict does not move:
//
//   elements parsed        14
//   tsDefoldMembers        `CoreModule`'s 21 — 14 methods and 7 `c_*` constants
//   missingMembers         the 7 `c_*` constants
//   addedMembers           []
//   downgradedMembers      ["get_tight_world_area"]
//   signatureLossMembers   ["screen_to_world", "world_to_screen"]
//   optionalityLossMembers ["shake"]
//
// This record was first taken against a surface of one member, and was re-derived
// when the extractor learned to read an `export =` handle. The snapshot publishes
// through `interface CoreModule` + `type CameraMap`
// + `const exportThis: Starley; export = exportThis;`. While `MEMBER_DECL` read
// only top-level `function`/`const`, `tsDefoldMembers` was `["exportThis"]`,
// `missingMembers` was `["exportThis"]`, `addedMembers` was all 14 markdown
// functions, and the three signature terms were empty for want of any shared
// member — `opaqueTsDefoldSurface` carried the whole verdict. `tsDefoldSurface`
// now resolves the handle through its alias, its intersection and `Readonly<>` to
// `CoreModule`'s members, so the terms above are read off the real surface and the
// `no-go` rests on them. The verdict and its `doc-dialect` reason are unchanged.
//
// starly is the only `export =` fixture in the corpus, and the guard stays for a
// handle that resolves to nothing: were the handle a *type* rather than a const,
// `tsMembers` would still be empty and the decision would otherwise read `go`
// against nothing. This record is why `opaqueTsDefoldSurface` exists.
//
// The losses behind those terms — and the one the comparator still cannot see:
//
//   - 7 module constants — `display_width`/`display_height`/`display_ratio` and
//     the four `behavior_*` hashes are `**Module Variables**` bullets under
//     `## Variable API`, never signature headings, so a flat parse cannot reach
//     them. ts-defold additionally renames them `c_*`, and they are the whole of
//     `missingMembers`.
//   - 3 dropped parameters across 2 members — the headings declare
//     `screen_to_world(id, screen_x, screen_y, [visible])` and
//     `world_to_screen(id, world_position, [visible])`, but both `**Parameters**`
//     lists document only `id` and `visible`, so the generous emit is
//     `screen_to_world(id: Hash, visible?: boolean)`.
//   - 1 type downgrade — `get_tight_world_area`'s `positions: table` emits
//     `Record<string | number, unknown>` against ts-defold's `vmath.vector3[]`.
//   - 2 optional parameters lost — `shake`'s bullets repeat the heading's
//     brackets in the *name* (`* \`[duration_scalar]\`: \`number\``), which is no
//     identifier, so even the generous emit renames them `arg4`/`arg5` and drops
//     their optionality.
//   - 8 `CameraMap` fields — `starly[id].behavior`/`viewport_*`/`near`/`far`/
//     `zoom` are a `LuaMap<hash, {...}>` value, not members of the module object,
//     so they stay outside the comparison: a flat signature surface cannot express
//     an indexed map. This one is still measurable only by hand.
//
// The 14 documented functions do match ts-defold's 14 one-for-one, so this is not
// gooey's member-count loss. The decision is driven by the dialect refusal plus
// the constants, the map, and the dropped parameters.
//
// starly has since severed, so the snapshot every term above is read from is the
// authored fork rather than the retired `fixtures/ts-defold/` copy. The terms are
// unchanged across that move because the fork is the *mapped* golden and
// `compareFidelityToTsDefold` scores no type token — it tests for an introduced
// `unknown`, counts parameters and `void` returns, and reads `?`, none of which a
// `hash` -> `Hash` respelling touches.
const STARLY: LibraryRecord = {
  library: "starly",
  repo: "https://github.com/VowSoftware/starly",
  ref: "85d1b2af8bf0618e7f297da41d03eb55d27e49b6",
  license: "Zlib",
  prefix: "starly.",
  classificationDir: "starly",
  decisions: [
    {
      module: "starly",
      decision: "no-go",
      reason: "doc-dialect",
      markdown: "README.md",
      severedSource: {
        path: "packages/starly/starly.starly.d.ts",
        fixture: "fixtures/authored/starly.starly.d.ts",
      },
    },
  ],
};

// The recorded decision for `8bitskull/dicebag` at tag `0.3` (commit
// `2d966260ff3185393c4244714c7fb7d8b7c2fe63`) — the eleventh Bucket-C library and
// one module. The PRD named `white-star-dev/dicebag`; the ts-defold fixture's own
// `@see` already pointed at the `8bitskull` slug used here.
//
// This is the first Bucket-C document the front-end reads as-is. `# Usage` writes
// 11 bare `### dicebag.<fn>(...)` headings, uppercase `**PARAMETERS**`/
// `**RETURNS**` markers and `* \`name\` (type) - doc` bullets, and the receiver is
// already `dicebag` — the exact dialect the parser was built for. So it is also
// the first one-for-one surface match:
//
//   elements parsed                          11
//   tsDefoldMembers / markdownMembers        the same 11 names
//   missingMembers / addedMembers            []
//   signatureLossMembers                     []
//   opaqueTsDefoldSurface                    false
//   downgradedMembers                        3
//   optionalityLossMembers                   ["set_up_rng"]
//
// The verdict therefore rests on type precision alone — neither `surface-loss`
// (no member is lost) nor `signature-loss` (no member's parameters or return
// collapsed), which is why the class is `type-downgrade` and not either of those.
// Filing it under `signature-loss` would have made that class's legend false about
// its own corpus.
//
// This record was first taken at 7 downgrades. Four of those — `bag_create`,
// `bag_draw`, `bag_reset`, `table_reset` — and part of two more were a front-end
// gap, not a document one: the README writes `id`'s type as the comma-listed
// token `(string, number, hash)`, and `parseSlot` split a `(type)` group on `|`
// alone, so the whole group reached the emitter unmappable and fell to `unknown`.
// The parser now treats a top-level comma as a union separator too, so `id` emits
// `string | number | Hash` and those members stopped being downgrades.
//
// The three that remain are upstream underspecification: `roll_custom_dice`'s
// `sides` is documented `(table)` against ts-defold's `Array<[number, number]>`
// and its return `(any)`, so the emit is
// `roll_custom_dice(num_dice: number, sides: Record<string | number, unknown>): unknown`.
// `table_create`'s `rollable_table` is `(table)` against
// `Array<[number, any, boolean?]>` the same way, and `table_roll` returns `(any)`
// -> `unknown` against ts-defold's `any`. The one optionality loss is
// `set_up_rng`: ts-defold has `seed?: number`, the heading writes
// `set_up_rng(seed)` with no brackets, and the optionality lives only in the
// bullet's prose, which `bracketedArgs` cannot read.
//
// The one fixable front-end gap left is not load-bearing either. Under a generous
// reading — the heading rewritten `set_up_rng([seed])` — the parse still yields 11
// elements and:
//
//   term                    as-is              generous
//   downgradedMembers       the three above    the three above
//   optionalityLossMembers  ["set_up_rng"]     []
//   decision                no-go              no-go
//
// The residue is exactly the underspecification a parser cannot fix, which is why
// the comma split — real precision, and the one term that did move — still changes
// no decision here.
//
// One finding that is evidence about the *retained* surface rather than a term in
// the decision: `roll_special_dice`'s `advantage` is documented `(boolean)`
// upstream ("If true, the highest rolls will be selected") and typed `number` in
// ts-defold. The markdown emit is the correct one. The comparator does not flag
// it — it scores weakening, and this is a lateral disagreement — so the ts-defold
// type error survives the no-go.
const DICEBAG: LibraryRecord = {
  library: "dicebag",
  repo: "https://github.com/8bitskull/dicebag",
  ref: "0.3",
  license: "CC0-1.0",
  prefix: "dicebag.",
  classificationDir: "dicebag",
  decisions: [
    {
      module: "dicebag",
      decision: "no-go",
      reason: "type-downgrade",
      markdown: "README.md",
      severedSource: {
        path: "packages/dicebag/dicebag.dicebag.d.ts",
        fixture: "fixtures/authored/dicebag.dicebag.d.ts",
      },
    },
  ],
};

// The recorded decision for `jbp4444/bzAnim` at tag `v.1.2` (commit
// `43412de571fc880849f1b58a0ef52d65ca71e6c8`) — the twelfth Bucket-C library and
// one module. The PRD left the repo unresolved; it is `jbp4444/bzAnim`, which the
// ts-defold fixture's `@see` and `NOTICE` already named. Apache-2.0 is the first
// Apache license in Bucket C. `main` is 3.5 years ahead of the tag, but
// `README.md` is byte-identical at both, so the pin is not stale evidence.
//
// This is the first Bucket-C library whose *only* document carries no signature
// heading at all. Its ten headings are prose section titles (`## Installation`,
// `## Usage`, `## Helper Functions`, ...) and not one matches
// `##`/`###` `<recv>.<fn>(...)`, so the front-end refuses the whole library —
// `no-signature-section`, the class defold-input's six prose modules already
// carry, but there as one module of ten.
//
// The structural reason runs deeper than the dialect. Both animation entry points
// take a single options table (`animate(args: AnimateArgs): string`), and a flat
// signature table cannot express an options-table parameter at all, so even a
// README rewritten into the parser's dialect could not carry `AnimateArgs`.
//
// Nor does the verdict depend on that gap being fixable. Hoisting every function
// the README names anywhere — the 7 `bz.<fn>(...)` calls in its Lua snippets —
// into `### bzAnim.<fn>(...)` headings yields 7 elements and:
//
//   missingMembers          ["DEBUG_LEVEL", "INFO_LEVEL", "TRACE_LEVEL",
//                            "registerController", "setMaxPoints",
//                            "unregisterController"]
//   addedMembers            ["setMaxPts"]
//   signatureLossMembers    all 6 shared functions — every one emits `(): void`
//   downgradedMembers       []
//   optionalityLossMembers  []
//   decision                no-go
//
// The README documents no parameter bullets anywhere, so every function collapses
// to a zero-arity `void` stub, `animate`'s `string` return included.
//
// The document is not a faithful surface even on its own terms: its
// `bz.setMaxPts( 15 )` does not exist upstream (`bzAnim/bzLibrary.lua` defines
// `bz.setMaxPoints`), and it never mentions `registerController` or
// `unregisterController` at all. Correcting the fork against that Lua turned all
// three into `missingMembers` above; the recorded reason is unmoved, the decision
// having been `no-go` on the three constants already. One further finding that
// moves nothing: `bzLibrary.lua` carries no LuaLS annotations, confirming the
// audit's Bucket-C placement.
//
// bzAnim is also the one target whose upstream filename and declared module
// diverge — it ships `packages/bzAnim/bzAnim.bzAnim.d.ts` as module
// `bzAnim.bzLibrary` — which is why the shared record resolves the ts-defold
// snapshot and the classification name through `targetFor` instead of composing
// them from the moduleId.
const BZANIM: LibraryRecord = {
  library: "bzAnim",
  repo: "https://github.com/jbp4444/bzAnim",
  ref: "v.1.2",
  license: "Apache-2.0",
  prefix: "bzAnim.",
  classificationDir: "bzAnim",
  decisions: [
    {
      module: "bzLibrary",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "README.md",
      severedSource: {
        path: "packages/bzAnim/bzAnim.bzAnim.d.ts",
        fixture: "fixtures/authored/bzAnim.bzLibrary.d.ts",
      },
    },
  ],
};

function decisionFor(record: LibraryRecord, module: string): ModuleDecision {
  const decision = record.decisions.find((d) => d.module === module);
  if (decision === undefined) throw new Error(`no recorded decision for ${module}`);
  return decision;
}

// A severed record compares against its `severedSource` snapshot rather than the
// `fixtures/ts-defold/` entry it no longer has; the two are byte-identical for a
// verbatim fork, so the recorded evidence reproduces unchanged.
const comparisonFor = (record: LibraryRecord, module: string) =>
  evaluateMarkdownCandidate(
    PACKAGE_ROOT,
    candidateTarget(record, decisionFor(record, module)),
    decisionFor(record, module).severedSource?.fixture,
  );

const inputComparison = (mod: string) => comparisonFor(DEFOLD_INPUT, mod);

const LIBRARY_RECORDS = [
  DEFOLD_INPUT,
  MONARCH,
  RICHTEXT,
  PERSIST,
  YAGAMES,
  GOOEY,
  METRICS,
  RENDY,
  PLATYPUS,
  STARLY,
  DICEBAG,
  BZANIM,
];

for (const record of LIBRARY_RECORDS) describeLibraryDecisions(record);

/** Every vendored snapshot a recorded verdict in this file rests on: the upstream
 * `.md` each decision judges, and the ts-defold surface — or, once a library
 * severed, the authored fork — it was compared against. Derived from the records
 * themselves so a new library extends the coverage by existing. */
function verdictFixturePaths(): string[] {
  const paths = new Set<string>([AUTHORED_SNAPSHOT, "fixtures/markdown/orthographic.camera.md"]);
  for (const record of LIBRARY_RECORDS) {
    for (const decision of record.decisions) {
      const moduleId = `${record.prefix}${decision.module}`;
      if (decision.reason !== "no-markdown") paths.add(`fixtures/markdown/${moduleId}.md`);
      paths.add(targetFor(moduleId, decision.severedSource).fixture);
    }
  }
  return [...paths].sort();
}

function fixtureDigest(path: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(readFileSync(join(PACKAGE_ROOT, path)))
    .digest("hex");
}

/** Paths `authored-targets.json` declares as this repo's own forked or
 * hand-authored `.d.ts`. Read from the production config rather than matched on
 * a directory prefix, so a target re-vendored elsewhere keeps its lane. */
const AUTHORED_LANE = new Set(readAuthoredTargets(PACKAGE_ROOT).map((target) => target.authored));

/** What a drifted pin means, and whether re-pinning is the correct response.
 * The two lanes drift for opposite reasons, so they cannot share a remedy: an
 * upstream copy drifting means a snapshot the repo does not own moved under a
 * recorded verdict, while an authored-lane fork drifting is the expected result
 * of deliberate work on a file the repo maintains. */
function driftRemedy(path: string): { digestMayBeUpdated: boolean; message: string } {
  if (AUTHORED_LANE.has(path)) {
    return {
      digestMayBeUpdated: true,
      message: `${path} no longer matches the copy every verdict derived from it was read off. It is an authored-lane snapshot this repo owns: re-check the recorded comparison for the modules that read it, then update this digest in the same commit as the edit.`,
    };
  }
  return {
    digestMayBeUpdated: false,
    message: `${path} no longer matches the copy every verdict derived from it was read off. Re-run the evaluation for the modules that read it and rewrite their recorded decision — do not re-baseline this digest.`,
  };
}

/** The pinned SHA-256 of every path `verdictFixturePaths` names, across both
 * lanes: the upstream copies taken at a pin, and the authored-lane forks a
 * severed library's verdict now resolves against. Every decision recorded in
 * this file was derived by reading them once; an in-place edit or a silent
 * re-vendor changes what those verdicts are about without changing the
 * verdicts. The lanes drift for different reasons, so `driftRemedy` reports
 * them differently. */
const VENDORED_FIXTURE_HASHES: Record<string, string> = {
  "fixtures/authored/in.accelerometer.d.ts":
    "d69fcfebd4a5d2bb98c7d0b7dc6ec73cc95e6f72d4239c78271ae78d8933622e",
  "fixtures/authored/in.button.d.ts":
    "24c49e22b6170ce45af0056db1e3e60ed51896539579ee8e2fb14f019d007d61",
  "fixtures/authored/in.cursor.d.ts":
    "84e1be7786a0b147bb434fdb92254190d5de38cb961be3ca27c9bb2d0adb31fe",
  "fixtures/authored/in.gesture.d.ts":
    "1b433bb9d8823cbccc9edb80613e28842b370b5d84830432cfde6dc0bef3a038",
  "fixtures/authored/in.keyboard.d.ts":
    "e18b39a30caf3432e54d7808a74a30e7537776eb3cec8fed1eb24015b5d0e59b",
  "fixtures/authored/in.mapper.d.ts":
    "d52500f818de9d3b5c36ea878ee2b853ab26e4478eea4039948bb808529c93a8",
  // Re-pinned with the doc-comment the fork now owes `create`, whose upstream block
  // the `---` reader declines. A doc-comment declares no member and renames none, and
  // this module's `no-signature-section` verdict is a parser refusal on `in/onscreen.md`
  // that builds no comparison against the fork at all — so there was no term to move.
  // Re-derived against the edited fork first regardless: it held.
  "fixtures/authored/in.onscreen.d.ts":
    "899e19927d012feb909c20b923be00605b0fa59954c043939bc04ecaaa27a899",
  "fixtures/authored/in.state.d.ts":
    "23764519e7e88f8bd4bbc0ecfc6f06eba54e5e58c490ee29fa10a0e120330a8f",
  // Re-pinned on the same terms as `in.onscreen` above, for the doc-comment the fork
  // now owes `text`: `no-signature-section` is a refusal on `in/textbox.md`, so no
  // comparison against the fork exists to move. Re-derived first; it held.
  "fixtures/authored/in.textbox.d.ts":
    "490e845229a3185febc37e802ede17e0fa17a93858cdfc5a63ecea92bb84f089",
  "fixtures/authored/in.triggers.d.ts":
    "277cc01d2ddcfdc47878f47ced9fadcaacc2a449d9830b72d8edc346c3cb32de",
  // Re-pinned with the field correction that declared upstream's seven live
  // transition/focus hashes and its `register` alias, and carried upstream's own
  // `@deprecated` onto the grouped forms it had been steering consumers at. The
  // `surface-loss` verdict was re-derived against the edited fork first: it held,
  // and its missing set took the eight names README_API.md documents nowhere.
  // Re-pinned again with the doc-comment the fork now owes
  // `SCREEN_TRANSITION_IN_STARTED`, whose `-- listener messages` header the reader
  // declines. `surface-loss` turns on the member *names* either side declares, and a
  // doc-comment adds none — re-derived first all the same: the decision held and the
  // missing set is unchanged.
  "fixtures/authored/monarch.monarch.d.ts":
    "2c2d2000c4cc654f334632028d726be6240abcc1896c3f481bc55e5dab872246",
  "fixtures/authored/monarch.transitions.easings.d.ts":
    "5ceaab6e08ef808a91a7a23052d638a407e9b5fe2042bd20a5b4de7919836b77",
  "fixtures/authored/monarch.transitions.gui.d.ts":
    "95baa41fc59bb2495d47c4207089ad12dbf5b968cb947143b1391bedc82f5ca8",
  // Re-pinned with the field correction that declared `MSG_SET_AUTOMATIC_ZOOM` and
  // deleted `MSG_USE_PROJECTION` and `ORTHOGRAPHIC_RENDER_SCRIPT_USED`, neither of
  // which the pinned `camera.lua` defines anywhere. The `no-go` was re-derived
  // against the edited fork first: it held, the README still adds nothing, and the
  // missing set traded the two invented names for the declared one.
  "fixtures/authored/orthographic.camera.d.ts":
    "8e2714a0f506d073c7b9044f6d439c53ba9653892f288ee67d483ef3d1195f05",
  "fixtures/authored/metrics.fps.d.ts":
    "20e3d51b21591de2adf9c65432eb3ea7afa9efccc1b1d8e85f60e51dd276a4a9",
  "fixtures/authored/metrics.mem.d.ts":
    "ccd0b76336aef4130b7f2a43c3ea071b14f30dd57a6c94a3a38710359ef39c91",
  "fixtures/authored/persist.persist.d.ts":
    "4ede94326945884649966cd0496316ba51bf243d06be2fbfc868789207df4be8",
  "fixtures/authored/gooey.gooey.d.ts":
    "8544aa267709580c194a9fb52bf740048a6bca90fa8d4b8332f25d78a49e825f",
  "fixtures/authored/bzAnim.bzLibrary.d.ts":
    "5ac9ea3a79428383dca86b3dbd85beff6a55413e2a52867b88079f97a21fbc69",
  "fixtures/authored/dicebag.dicebag.d.ts":
    "51649de912a91815fd2bd8aeeda3390689c114ff3d7702d11dc201b29d6a44a8",
  // Re-pinned with the field correction that declared the two `SEPARATION_*` modes
  // from `platypus.lua:27-28`. The `shared-document` verdict was re-derived against
  // the edited fork first: both documented readings held their `no-go`, `create` is
  // still the only downgrade, and the two names joined the constants the flat
  // signature parse cannot see.
  "fixtures/authored/platypus.platypus.d.ts":
    "896068c523d89641edcd8a7684e957adb94605537d36c1259b616ff06848918d",
  "fixtures/authored/rendy.rendy.d.ts":
    "838b7d62ec4fe12bde657bdb76c7444faa3da5cecaff56e0966d83b8bd3b8e0f",
  // The one entry whose verdict comes from the openapi lane rather than
  // markdown: `openapi-fidelity-gate.test.ts` scores this fork against the
  // pinned swagger + proto and records `no-go`. Re-pinned with the signature
  // correction that took the fork to upstream's own 156 members, in the same
  // commit and after that gate was re-derived against the edited fork: the
  // decision held and its missing set narrowed to the client-lifecycle helpers.
  // Re-pinned again with the field correction that declared upstream's 12 enum
  // constants, on the same terms: the gate was re-derived first, the decision held,
  // and the missing set took the 12 names the swagger emits no constant for.
  // Re-pinned a third time with the doc-comments the fork now owes `cancel`,
  // `cancellation_token` and `sync`, whose upstream blocks the reader declines. Same
  // terms as before: the gate was re-derived first, the decision held, and the missing
  // set is unchanged — a doc-comment declares no member for the swagger to match.
  "fixtures/authored/nakama.nakama.d.ts":
    "2306ada7aeb519b17fadee53aa6592bfe8463048f4893e3d05817e8d298b39c5",
  "fixtures/authored/richtext.color.d.ts":
    "fdacac61ee40f105f63c7a15745520630818b9d14ee0ffa077912f899b2f1999",
  "fixtures/authored/richtext.richtext.d.ts":
    "35b06ed582b027ae84e395856afd015ba74bc76c05460e63c4f0adfd3da6457b",
  "fixtures/authored/richtext.tags.d.ts":
    "722f9bcd88d44a5c17e5b1b49d9060759be46467658599c3fe2fae3f172b8b11",
  "fixtures/authored/starly.starly.d.ts":
    "79bad0b84c801c6b57e03d2f208af6aea1248eeda99383f88b1bcf9b7e340e21",
  "fixtures/authored/yagames.yagames.d.ts":
    "2fde3ee97ce24ba40de2fea7b21040882b3bbae94a8a08875417d070bd603b06",
  "fixtures/markdown/bzAnim.bzLibrary.md":
    "ffc299add5db0e4348fcdf59fa432b4606071c7188aaa51fae4206f7fa04d8b1",
  "fixtures/markdown/dicebag.dicebag.md":
    "9590507ceb5c3532f4c967fbc3198282fe523259d265008ec398f06b747dee19",
  "fixtures/markdown/gooey.gooey.md":
    "b2a05e8e10f3bfcbfc756d18ac1916dddbfffc7c844b3a2c3336f54a4b57b329",
  "fixtures/markdown/in.accelerometer.md":
    "fc229088954b9e7bbb961ecd1d17d93efb0eae20f5c04e80070cb01ae3571d04",
  "fixtures/markdown/in.button.md":
    "fb1a285d5bf2744aed3464ca90e3c2c6ed9710c083a65117a9172d355e06f3dd",
  "fixtures/markdown/in.cursor.md":
    "c2b1b47ba3814e1e4358cfd16de73a56ecf625903c43056b4a76cb3c185096f3",
  "fixtures/markdown/in.gesture.md":
    "1b5c8f39a703dce5a90d7b0060523c9741250795f8a9833467dc1f74b95da548",
  "fixtures/markdown/in.mapper.md":
    "5768cac1137dff4ad113ce1abce53143d21f356863e398652b77755fa6bb53ab",
  "fixtures/markdown/in.onscreen.md":
    "1515b0bf7a0dff36af3ed6b3df028be86dbf4f798b4c7f9454d72f71c3befd2f",
  "fixtures/markdown/in.state.md":
    "3d5b1e4a4b5b6f1dad95c25a6e68bc0f2378f5573052ab238478b09d9ddd7dad",
  "fixtures/markdown/in.textbox.md":
    "82265179af4e80ee0f03d05b35307acf956a361a869f10894da64542c9cdb5ee",
  "fixtures/markdown/metrics.fps.md":
    "940950ba4e352746634cfcc267d10bbca4094b8e481a7b342eadc68afbdf158f",
  "fixtures/markdown/metrics.mem.md":
    "940950ba4e352746634cfcc267d10bbca4094b8e481a7b342eadc68afbdf158f",
  "fixtures/markdown/monarch.monarch.md":
    "0fd171fbc8b3d7c04457665640ee46a902bbc8aba63c68789a473e89f1cb0451",
  "fixtures/markdown/monarch.transitions.gui.md":
    "7eab84dbe50480492be688804481d9ad322c281579816eb95364c0521e75e8e8",
  "fixtures/markdown/orthographic.camera.md":
    "688407034ede0cc4b3ddd6d79609d0e965123c6781724828ac9ced401c6b9995",
  "fixtures/markdown/persist.persist.md":
    "6af89cba9ca8ff710105cec1f298299e580b194988979d4d40fdb0a4819f72eb",
  "fixtures/markdown/platypus.platypus.md":
    "fcb7d098d898c0e4cc7bf97f6f82d17d11efa9420f8604d29bfa5de814288f1f",
  "fixtures/markdown/rendy.rendy.md":
    "3f00ba31525ec646be07899a66a2545fb4d321f0aac4e23d83d00318e5d17d1a",
  "fixtures/markdown/richtext.richtext.md":
    "c5cdd5e925f00d3e5ab61ddaa1b219cb9d082392c2b84294abf88a565d15808f",
  "fixtures/markdown/starly.starly.md":
    "2499999d90adccc01b253e41da1a6adfb97ee4f3d46481a61f5ae7b362fe0aa7",
  "fixtures/markdown/yagames.yagames.md":
    "2e62c65b4324e5fa1878cdefaea71dbf7e0e4951ac7094ba24a659754f6a8f3e",
};

describe("the vendored snapshots the recorded verdicts were derived from", () => {
  test("every pinned snapshot still hashes to its recorded digest", () => {
    const drifted = Object.entries(VENDORED_FIXTURE_HASHES)
      .filter(([path]) => existsSync(join(PACKAGE_ROOT, path)))
      .filter(([path, digest]) => fixtureDigest(path) !== digest)
      .map(([path]) => driftRemedy(path).message);
    expect(drifted).toEqual([]);
  });

  test("every pinned path still exists, so a renamed snapshot reds", () => {
    expect(Object.keys(VENDORED_FIXTURE_HASHES).length).toBeGreaterThan(0);
    expect(
      Object.keys(VENDORED_FIXTURE_HASHES).filter((path) => !existsSync(join(PACKAGE_ROOT, path))),
    ).toEqual([]);
  });

  test("the pin covers every snapshot a recorded verdict reads", () => {
    expect(verdictFixturePaths().filter((path) => !(path in VENDORED_FIXTURE_HASHES))).toEqual([]);
  });

  test("an authored-lane snapshot's drift remedy permits updating the digest", () => {
    expect(driftRemedy("fixtures/authored/persist.persist.d.ts").digestMayBeUpdated).toBe(true);
    expect(driftRemedy("fixtures/markdown/persist.persist.md").digestMayBeUpdated).toBe(false);
  });

  test("the two lanes do not share a remedy", () => {
    expect(driftRemedy("fixtures/authored/persist.persist.d.ts").message).not.toBe(
      driftRemedy("fixtures/markdown/persist.persist.md").message,
    );
  });

  test("every pinned authored-lane path is a target the repo declares as its own", () => {
    const declared = new Set(readAuthoredTargets(PACKAGE_ROOT).map((target) => target.authored));
    expect(
      Object.keys(VENDORED_FIXTURE_HASHES).filter(
        (path) => path.startsWith("fixtures/authored/") && !declared.has(path),
      ),
    ).toEqual([]);
  });
});

describe("defold-input surface-loss evidence at tag 4.7.1", () => {
  test("in.cursor loses all but one ts-defold member", async () => {
    const { markdownMembers, missingMembers, decision } = await inputComparison("cursor");
    // The README documents exactly one function; every constant and the rest of
    // the script surface is invisible to a flat signature parse.
    expect(markdownMembers).toEqual(["listen"]);
    for (const member of ["DRAG_START", "OVER", "PRESSED", "init", "final", "reset"]) {
      expect(missingMembers).toContain(member);
    }
    expect(decision).toBe("no-go");
  });

  test("in.state loses a documented member and drops every parameter", async () => {
    const { emitted, missingMembers, decision } = await inputComparison("state");
    expect(missingMembers).toEqual(["update"]);
    // The `# API` headers declare arguments but the sections carry no
    // `**PARAMETERS**` bullets, so the flat parse emits every function zero-arity
    // — `state.on_input(action_id, action, [instance])` becomes `on_input()`.
    expect(emitted).toContain("function on_input(): void;");
    expect(emitted).toContain("function is_pressed(): void;");
    expect(decision).toBe("no-go");
  });

  test("the emitter cannot express an in.<mod> namespace: `in` is a reserved word", async () => {
    const { emitted } = await inputComparison("cursor");
    // `namespace in.cursor` is not parseable TypeScript, so even a module that
    // cleared the surface gate could not be published under this namespace
    // without an emitter change. Recorded here as the structural blocker.
    expect(emitted).toContain("namespace in.cursor {");
  });
});

describe("monarch surface-loss evidence at tag 6.0.2", () => {
  test("monarch.monarch parses after the header-level widening", async () => {
    const { markdownMembers } = await comparisonFor(MONARCH, "monarch");
    // Exactly the `## monarch.<fn>(...)` signature sections of README_API.md. The
    // four `## monarch.SCREEN_TRANSITION_*` constant headings carry no parens and
    // stay out of the surface, which is why they show up as missing members below.
    expect(markdownMembers).toEqual([
      "add_listener",
      "back",
      "bottom",
      "clear",
      "data",
      "debug",
      "hide",
      "is_busy",
      "is_preloading",
      "is_top",
      "is_visible",
      "on_focus_change",
      "on_post",
      "on_transition",
      "post",
      "preload",
      "remove_listener",
      "replace",
      "screen_exists",
      "set_timestep_below_popup",
      "show",
      "top",
      "unload",
      "when_preloaded",
    ]);
  });

  test("the README documents none of the screen-registration surface", async () => {
    const { missingMembers, decision } = await comparisonFor(MONARCH, "monarch");
    for (const fn of [
      "register_proxy",
      "register_factory",
      "unregister",
      "get_stack",
      "queue_size",
      "is_loaded",
      "is_popup",
      "on_message",
    ]) {
      expect(missingMembers).toContain(fn);
    }
    // Every ts-defold constant is invisible to a flat signature parse.
    for (const constant of ["TRANSITION", "FOCUS", "SCREEN_TRANSITION_FAILED"]) {
      expect(missingMembers).toContain(constant);
    }
    expect(decision).toBe("no-go");
  });

  // The field correction grew this fork by eight names — the seven live transition and
  // focus hashes upstream defines flat at `monarch.lua:25-33`, and the `register` alias
  // at `:292`. README_API.md documents none of them, so each widens the loss the
  // recorded `surface-loss` verdict rests on rather than narrowing it.
  test("the eight names the field correction declared all widen the recorded loss", async () => {
    const { missingMembers, addedMembers, decision } = await comparisonFor(MONARCH, "monarch");
    for (const name of [
      "FOCUS_GAINED",
      "FOCUS_LOST",
      "TRANSITION_BACK_IN",
      "TRANSITION_BACK_OUT",
      "TRANSITION_DONE",
      "TRANSITION_SHOW_IN",
      "TRANSITION_SHOW_OUT",
      "register",
    ]) {
      expect(missingMembers).toContain(name);
      expect(addedMembers).not.toContain(name);
    }
    expect(decision).toBe("no-go");
    expect(decisionFor(MONARCH, "monarch").reason).toBe("surface-loss");
  });

  // The `addedMembers`/`missingMembers` pair below is a README typo, not an
  // upstream rename. Measured at the pin: `monarch/monarch.lua:1295` is
  // `function M.on_focus_changed(id, fn)`, the file's only `on_focus` definition,
  // and it is the spelling the fork carries. Only `README_API.md:206` writes
  // `## monarch.on_focus_change(screen_id, fn)`. So no correction is owed to our
  // types — binding `on_focus_change` would bind a function that does not exist
  // at runtime — and the divergence counts as evidence for the `surface-loss`
  // verdict rather than a defect in the surface being compared.
  test("the README misspells on_focus_changed, so the markdown surface adds a member the runtime lacks", async () => {
    const { addedMembers, missingMembers } = await comparisonFor(MONARCH, "monarch");
    expect(addedMembers).toContain("on_focus_change");
    expect(missingMembers).toContain("on_focus_changed");
    // Pinned together with the terms above: a later "fix" to the README spelling,
    // or a rename of the export to match it, reds this in one edit.
    const fork = readFileSync(
      join(PACKAGE_ROOT, targetFor("monarch.monarch", severedFor(MONARCH, "monarch")).fixture),
      "utf8",
    );
    expect(fork).toContain("on_focus_changed");
    expect(fork).not.toContain("on_focus_change(");
  });

  test("monarch.transitions.easings has no upstream doc anywhere in the repo", () => {
    expect(
      existsSync(join(PACKAGE_ROOT, "fixtures/markdown", "monarch.transitions.easings.md")),
    ).toBe(false);
  });

  test("monarch.transitions.gui documents its signatures only in prose bullets", () => {
    const text = readFileSync(
      join(PACKAGE_ROOT, "fixtures/markdown", "monarch.transitions.gui.md"),
      "utf8",
    );
    expect(() => parseMarkdownApi(text, "monarch.transitions.gui")).toThrow(
      /monarch\.transitions\.gui/,
    );
    expect(() => parseMarkdownApi(text, "monarch.transitions.gui")).toThrow(/signature/);
  });

  // Without the dropped rows the lookups would throw, so the three recorded
  // verdicts are only resolvable because each decision's own `severedSource`
  // supplies both fields it used to read. One value per module: a single
  // record-level override would score all three against one snapshot.
  test("each of the three verdicts still resolves once its ts-defold row is gone", () => {
    const MODULES = ["monarch", "transitions.easings", "transitions.gui"];
    const fixtures = MODULES.map((mod) => {
      const moduleId = `monarch.${mod}`;
      const severed = severedFor(MONARCH, mod);
      expect(severed).toBeDefined();
      const { fixture } = targetFor(moduleId, severed);
      expect(fixture).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(existsSync(join(PACKAGE_ROOT, fixture))).toBe(true);
      expect(classificationModule(moduleId, severed)).toBe(moduleId);
      return fixture;
    });
    expect(new Set(fixtures).size).toBe(3);
  });
});

describe("richtext surface-loss evidence at tag 5.22.1", () => {
  test("richtext.richtext parses cleanly to exactly the 8 documented functions", async () => {
    const { markdownMembers } = await comparisonFor(RICHTEXT, "richtext");
    // The `# API` section's `### richtext.<fn>(...)` sections. Unlike every prior
    // Bucket-C module this one neither loud-fails nor parses empty.
    expect(markdownMembers).toEqual([
      "characters",
      "create",
      "length",
      "on_click",
      "plaintext",
      "remove",
      "tagged",
      "truncate",
    ]);
  });

  test("the 7 paren-less constant headings stay out of the surface", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(RICHTEXT, "richtext");
    expect(missingMembers).toEqual([
      "ALIGN_CENTER",
      "ALIGN_JUSTIFY",
      "ALIGN_LEFT",
      "ALIGN_RIGHT",
      "VALIGN_BOTTOM",
      "VALIGN_MIDDLE",
      "VALIGN_TOP",
    ]);
    // Every documented function still exists under the same name upstream.
    expect(addedMembers).toEqual([]);
  });

  test("the hand-crafted structural surface collapses to the README's bare tables", async () => {
    const { emitted, downgradedMembers, decision } = await comparisonFor(RICHTEXT, "richtext");
    // ts-defold declares `create(text, font, settings?): LuaMultiReturn<[Word[],
    // TextMetrics]>`. The README's header is `richtext.create(text, font,
    // settings)` — unbracketed — so `settings` comes back required, and while the
    // multi-return *shape* survives, both of its element types degrade to the bare
    // table token. This is why lifting the constant headings would not flip the
    // decision: the downgrade is independent of the missing members.
    expect(emitted).toContain(
      "function create(text: string, font: string, settings: Record<string | number, unknown>): LuaMultiReturn<[Record<string | number, unknown>, Record<string | number, unknown>]>;",
    );
    // None of ts-defold's named structural types survives the flat parse.
    for (const type of ["Word[]", ": Settings", "TextMetrics", "Alignment", "FontsTable"]) {
      expect(emitted).not.toContain(type);
    }
    expect(downgradedMembers).toContain("create");
    expect(decision).toBe("no-go");
  });

  test("richtext.richtext's decision is no-go", async () => {
    const { decision } = await comparisonFor(RICHTEXT, "richtext");
    expect(decision).toBe("no-go");
  });

  // Without the dropped rows the lookups would throw, so the three recorded
  // verdicts are only resolvable because each decision's own `severedSource`
  // supplies both fields it used to read. One value per module: a single
  // record-level override would score all three against one snapshot.
  test("each of the three verdicts still resolves once its ts-defold row is gone", () => {
    const MODULES = ["color", "richtext", "tags"];
    const fixtures = MODULES.map((mod) => {
      const moduleId = `richtext.${mod}`;
      const severed = severedFor(RICHTEXT, mod);
      expect(severed).toBeDefined();
      const { fixture } = targetFor(moduleId, severed);
      expect(fixture).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(existsSync(join(PACKAGE_ROOT, fixture))).toBe(true);
      expect(classificationModule(moduleId, severed)).toBe(moduleId);
      return fixture;
    });
    expect(new Set(fixtures).size).toBe(3);
  });

  // `namespace === moduleId` for all three, so the dotted golden the fork emits is
  // the one the ts-defold row already published — the arm of the severance
  // assertion that requires the file to survive rather than die with its row.
  test("each fork registers and re-emits the dotted golden it published before", () => {
    for (const mod of ["color", "richtext", "tags"]) {
      const moduleId = `richtext.${mod}`;
      const target = readAuthoredTargets(PACKAGE_ROOT).find((t) => t.moduleId === moduleId);
      expect(target?.namespace).toBe(moduleId);
      expect(target?.generated).toBe(`generated/${moduleId}.d.ts`);
      expect(existsSync(join(PACKAGE_ROOT, `generated/${moduleId}.d.ts`))).toBe(true);
    }
  });

  // No upstream correction landed with this cutover — `addedMembers` is `[]`, so
  // the markdown surface names nothing our types lack. What makes that an
  // assertion rather than an absence is the surface the verbatim fork preserves:
  // the exact structure the flat parse collapses, and the whole of the
  // `surface-loss` case. A later "simplification" of the fork that erased any of
  // it would red here alongside the `addedMembers` term it invalidates.
  test("the fork still declares every name the markdown emit loses", () => {
    const fork = readFileSync(
      join(PACKAGE_ROOT, targetFor("richtext.richtext", severedFor(RICHTEXT, "richtext")).fixture),
      "utf8",
    );
    for (const constant of [
      "ALIGN_CENTER",
      "ALIGN_JUSTIFY",
      "ALIGN_LEFT",
      "ALIGN_RIGHT",
      "VALIGN_BOTTOM",
      "VALIGN_MIDDLE",
      "VALIGN_TOP",
    ]) {
      expect(fork).toContain(`export const ${constant}:`);
    }
    for (const named of [
      "Alignment",
      "VAlignment",
      "Word",
      "Settings",
      "FontsTable",
      "TextMetrics",
    ]) {
      expect(fork).toContain(`type ${named} =`);
    }
  });
});

describe("persist signature-loss evidence at pin b37f61040740f232d86f68e2606f27b6f1bd15c4", () => {
  test("the README parses cleanly to exactly the 6 documented functions", async () => {
    const { markdownMembers } = await comparisonFor(PERSIST, "persist");
    expect(markdownMembers).toEqual(["create", "exists", "flush", "load", "save", "write"]);
  });

  // `exists` used to be the one name the README documented and the fork did not
  // declare. Correcting the fork against the pinned Lua empties `addedMembers` and
  // makes `exists` a shared member, which the parameter-less headings then collapse
  // like the other five.
  test("the two surfaces name the same six functions", async () => {
    const { addedMembers, missingMembers } = await comparisonFor(PERSIST, "persist");
    expect(addedMembers).toEqual([]);
    expect(missingMembers).toEqual([]);
  });

  test("the signature collapse is the whole decision", async () => {
    const { emitted, signatureLossMembers } = await comparisonFor(PERSIST, "persist");
    // ts-defold declares `create(file_name, data, overwrite?)` and
    // `load(file_name): {} | undefined`. The README's `### persist.<fn>(...)`
    // headings carry no `**PARAMETERS**` bullets, so every function emits
    // zero-arity and every return collapses to `void`.
    expect(emitted).toContain("function create(): void;");
    expect(emitted).toContain("function load(): void;");
    expect(signatureLossMembers).toEqual(["create", "exists", "flush", "load", "save", "write"]);
  });

  test("persist.persist is no-go on signature-loss, not on the richtext unknown-downgrade class", async () => {
    const { decision, downgradedMembers } = await comparisonFor(PERSIST, "persist");
    expect(decision).toBe("no-go");
    // No emitted signature carries an `unknown` token — a zero-arity stub has no
    // tokens at all — so the record cannot be misread as a type downgrade.
    expect(downgradedMembers).toEqual([]);
  });

  test("the recorded reason matches the term that actually drove the decision", async () => {
    const { signatureLossMembers, missingMembers, downgradedMembers } = await comparisonFor(
      PERSIST,
      "persist",
    );
    expect(decisionFor(PERSIST, "persist").reason).toBe("signature-loss");
    expect(signatureLossMembers.length).toBeGreaterThan(0);
    expect([...missingMembers, ...downgradedMembers]).toEqual([]);
  });
});

describe("yagames doc-dialect evidence at tag 0.19.0", () => {
  const readme = () => fixtureText(YAGAMES, decisionFor(YAGAMES, "yagames"));
  const HEADING = /^#### `([A-Za-z_]\w*)\.([A-Za-z_]\w*)\((.*)\)`\s*$/;
  const headings = () =>
    readme()
      .split("\n")
      .map((line) => line.match(HEADING))
      .filter((match): match is RegExpMatchArray => match !== null);

  // The retired ts-defold snapshot is gone, so the recorded verdict resolves
  // through `severedSource` at the vendored fork — which carries the upstream
  // corrections on top of it, and is therefore what the numbers below read.
  const tsSurface = () =>
    tsDefoldMembers(
      readFileSync(
        join(PACKAGE_ROOT, targetFor("yagames.yagames", severedFor(YAGAMES, "yagames")).fixture),
        "utf8",
      ),
    );

  // The refusal is a dialect gap, not an absent API doc: the snapshot carries 70
  // backticked `#### <recv>.<fn>(...)` headings (66 `yagames.`, 4 `sitelock.`),
  // 47 `**Parameters:**` and 22 `**Returns:**` markers, and 76 typed bullets in
  // the `` `x` <kbd>type</kbd> `` form — never the `` `x` (type) `` spelling
  // `TYPED_BULLET` accepts, so the parser reads zero of them. Those figures are
  // properties of the vendored fixture rather than of the parser, and the digest
  // pin above is what holds them; the record's header comment reads the same.
  test("the front-end refuses the snapshot", () => {
    expect(() => parseMarkdownApi(readme(), "yagames.yagames")).toThrow(/signature/);
  });

  // Exact rather than a count, because this is also what gates the sticky-banner
  // correction: the three replacement members are documented under `yagames.`, so
  // any misspelling of one lands it in this list and reds the test.
  test("dialect support could not flip the decision — 2 documented-member gaps remain", () => {
    // The generous reading: every heading regardless of receiver, which is more
    // than the parser's uniform-prefix rule would allow through.
    const documented = new Set(headings().map(([, , member]) => member as string));
    expect(tsSurface().filter((member) => !documented.has(member))).toEqual([
      "leaderboards_init",
      "player_get_id",
    ]);
  });

  test("reading only the `yagames.` prefix the parser would enforce, the gap is the same 2", () => {
    const documented = new Set(
      headings()
        .filter(([, receiver]) => receiver === "yagames")
        .map(([, , member]) => member as string),
    );
    // Exact rather than a count for the same reason as the test above, and it is
    // what makes the record's "the prefix restriction costs nothing" reading
    // checkable rather than asserted. The restriction used to widen this to 6 by
    // stranding the four `sitelock.`-receiver members; the fork no longer declares
    // them, so the two readings now agree.
    expect(tsSurface().filter((member) => !documented.has(member))).toEqual([
      "leaderboards_init",
      "player_get_id",
    ]);
  });

  test("the comment-strip fix is load-bearing: the fixture surface is 68 members", () => {
    // `tsDefoldMembers` — the comparator's own surface reader — over the forked
    // snapshot; too long to write out, so the samples below carry the specifics.
    const surface = tsSurface();
    expect(surface.length).toBe(68);
    // Members a `//*`-blind stripper silently dropped, sampled at both ends.
    expect(surface).toContain("adv_show_fullscreen_adv");
    expect(surface).toContain("player_get_data");
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    expect(targetFor("yagames.yagames", severedFor(YAGAMES, "yagames")).fixture).toBe(
      "fixtures/authored/yagames.yagames.d.ts",
    );
    expect(classificationModule("yagames.yagames", severedFor(YAGAMES, "yagames"))).toBe(
      "yagames.yagames",
    );
  });
});

describe("gooey surface-loss evidence at tag 10.5.3", () => {
  const readme = () => fixtureText(GOOEY, decisionFor(GOOEY, "gooey"));
  const PARSED_MEMBERS = [
    "button",
    "checkbox",
    "radio",
    "static_list",
    "dynamic_list",
    "vertical_scrollbar",
    "input",
    "group",
  ];

  test("the front-end accepts the snapshot — this is a fidelity judgment, not a dialect gap", () => {
    const doc = parseMarkdownApi(readme(), "gooey.gooey");
    expect(doc.elements.map((e) => e.name)).toEqual(PARSED_MEMBERS.map((m) => `gooey.${m}`));
    expect(doc.info.namespace).toBe("gooey");
  });

  test("gooey.gooey is no-go", async () => {
    const { decision } = await comparisonFor(GOOEY, "gooey");
    expect(decision).toBe("no-go");
  });

  // The four `#####` list variants, plus the eight members the parity correction added
  // from `gooey.lua` — the README documents none of them under any header level.
  test("the undocumented members are the leading term — 12 missing members", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(GOOEY, "gooey");
    expect(missingMembers).toEqual([
      "acquire_input",
      "create_theme",
      "horizontal_dynamic_list",
      "horizontal_scrollbar",
      "horizontal_static_list",
      "is_enabled",
      "mask_text",
      "radiogroup",
      "release_input",
      "set_focus",
      "vertical_dynamic_list",
      "vertical_static_list",
    ]);
    // Upstream adds no member the fork lacks, so the loss is one-directional.
    expect(addedMembers).toEqual([]);
  });

  test("every one of the 8 parsed members downgrades on the README's bare Lua tokens", async () => {
    const { downgradedMembers } = await comparisonFor(GOOEY, "gooey");
    expect([...downgradedMembers].sort()).toEqual([...PARSED_MEMBERS].sort());
  });

  // The term moved with the correction, and both ends of that move are the README
  // trailing `gooey.lua`. It used to fire on `dynamic_list`, whose `###` heading named
  // 11 arguments while its `**PARAMETERS**` run documented 10 — but `root_id` was never
  // in `gooey.lua` either, so the fork dropped it and the heading is now the wider side
  // by one, which this term does not score. It now fires on `vertical_scrollbar`: the
  // pinned source takes `config` between `action` and `fn` (`gooey.lua:149`) and the
  // README documents the six-parameter form the library shipped before it.
  test("vertical_scrollbar's documented signature is one parameter short of upstream's", async () => {
    const { signatureLossMembers } = await comparisonFor(GOOEY, "gooey");
    expect(signatureLossMembers).toEqual(["vertical_scrollbar"]);
  });

  // Read through `targetFor` rather than a hard-coded `fixtures/ts-defold/` path
  // so the severance moves the snapshot with it. The parity correction took the fork
  // from the 12 ts-defold functions to the 20 `gooey.lua` defines.
  test("the surface the comparison runs against is the fork's 20 functions", () => {
    const surface = tsDefoldMembers(
      readFileSync(
        join(PACKAGE_ROOT, targetFor("gooey.gooey", severedFor(GOOEY, "gooey")).fixture),
        "utf8",
      ),
    );
    expect(surface).toEqual([
      "acquire_input",
      "button",
      "checkbox",
      "create_theme",
      "dynamic_list",
      "group",
      "horizontal_dynamic_list",
      "horizontal_scrollbar",
      "horizontal_static_list",
      "input",
      "is_enabled",
      "mask_text",
      "radio",
      "radiogroup",
      "release_input",
      "set_focus",
      "static_list",
      "vertical_dynamic_list",
      "vertical_scrollbar",
      "vertical_static_list",
    ]);
  });

  test("widening the header range would trade surface-loss for signature-loss, not fix it", () => {
    const lines = readme().split("\n");
    // The README writes its 8 parsed members as `###` and the 4 missing list
    // variants as `#####`; the missing four are already pinned by name above.
    // The `#####` sections carry no documented parameters or return at all, so
    // parsing them would emit four zero-arity `(): void` stubs.
    const firstH5 = lines.findIndex((line) => /^#####\s+gooey\.\w+\(.*\)\s*$/.test(line));
    const nextH3 = lines.findIndex((line, i) => i > firstH5 && /^###\s/.test(line));
    const body = lines.slice(firstH5 + 1, nextH3 === -1 ? undefined : nextH3);
    expect(body.some((line) => /^\*\*PARAMETERS\*\*\s*$/.test(line))).toBe(false);
    expect(body.some((line) => /^\*\*RETURN\*\*\s*$/.test(line))).toBe(false);
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  // The bare namespace is what makes the dotted golden a dead path here, so the
  // namespace-conditional golden assertion takes its absence arm.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    const severed = severedFor(GOOEY, "gooey");
    expect(targetFor("gooey.gooey", severed).fixture).toBe("fixtures/authored/gooey.gooey.d.ts");
    expect(existsSync(join(PACKAGE_ROOT, targetFor("gooey.gooey", severed).fixture))).toBe(true);
    expect(classificationModule("gooey.gooey", severed)).toBe("gooey.gooey");
    expect(existsSync(join(PACKAGE_ROOT, "generated/gooey.gooey.d.ts"))).toBe(false);
  });
});

describe("metrics shared-README evidence at tag 1.2.1", () => {
  const readme = (module: string) => fixtureText(METRICS, decisionFor(METRICS, module));

  const receiverComparison = (module: string) =>
    comparisonForMarkdown(
      filterToReceiver(readme(module), module),
      `metrics.${module}`,
      severedFor(METRICS, module),
    );

  test("both snapshots are the one upstream README, byte for byte", () => {
    expect(readme("fps")).toBe(readme("mem"));
  });

  test("the parser refuses the shared document for either moduleId, naming both receivers", () => {
    for (const module of ["fps", "mem"]) {
      expect(() => parseMarkdownApi(readme(module), `metrics.${module}`)).toThrow(
        /non-uniform module prefix across headers: fps, mem/,
      );
    }
  });

  // `addedMembers` is `[]` here only because the authored correction landed: the
  // three module-level members the README documents are now in the fork this
  // comparison reads. `missingMembers` is the three constants the later field
  // correction declared, which the README documents nowhere — a growing missing
  // set only reinforces a verdict already `no-go`. Every other term is the one
  // recorded before the severance, and the verdict still rests on `create`'s
  // `table` return rather than on the constants.
  test.each([
    "fps",
    "mem",
  ])("a receiver-filtered metrics.%s still lands no-go on create's table return", async (module) => {
    const { doc, decision, missingMembers, signatureLossMembers, downgradedMembers, addedMembers } =
      await receiverComparison(module);

    expect(doc.elements.map((e) => e.name.split(".").pop()).sort()).toEqual(
      ["create", "draw", module, "update"].sort(),
    );

    expect(decision).toBe("no-go");
    expect(missingMembers).toEqual(["COLOR", "FORMAT", "POSITION"]);
    expect(signatureLossMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["create"]);
    expect(addedMembers).toEqual([]);
  });

  test.each([
    "fps",
    "mem",
  ])("metrics.%s loses every optional create parameter — the term that would have hidden a false go", async (module) => {
    const { optionalityLossMembers } = await receiverComparison(module);
    expect(optionalityLossMembers).toContain("create");
  });

  // The snapshot this reads is the authored fork the severance moved the verdict
  // onto, so the surface is the corrected one: the factory, the three
  // module-level members, and the three drawing defaults the field correction
  // declared. `Metrics` is still outside `MEMBER_DECL`'s surface and still never
  // enters the comparison, which is why it is absent from the list.
  test.each([
    ["fps", ["COLOR", "FORMAT", "POSITION", "create", "draw", "fps", "update"]],
    ["mem", ["COLOR", "FORMAT", "POSITION", "create", "draw", "mem", "update"]],
  ])("the severed surface of metrics.%s is the factory plus the corrected members", (module, members) => {
    const fixture = targetFor(`metrics.${module}`, severedFor(METRICS, module as string)).fixture;
    expect(tsDefoldMembers(readFileSync(join(PACKAGE_ROOT, fixture), "utf8"))).toEqual(
      members as string[],
    );
  });
});

// Re-measured against the authored fork once rendy severed. The fork is the
// *mapped* golden, so it respells types the retired ts-defold snapshot wrote in
// engine spelling (`hash` -> `Hash`, `url` -> `Url`, `vmath.vector3` ->
// `Vector3`, and the quaternion/vector4 pair). That respelling is provably
// term-neutral: every predicate `compareFidelityToTsDefold` scores keys on
// parameter count, a literal `void` return, a literal `unknown` token, or a `?`
// on a parameter name — never on a type name. So all six terms below must read
// exactly as they did before the lane move; a moved term is a bug to stop and
// record, never a digest or expectation to re-baseline.
//
// One term has since moved, and only by a deliberate authored edit: the field
// correction declared upstream's five exposed variables, which the README
// documents nowhere, so `missingMembers` is those five. `MEMBER_DECL` matches a
// bare `const`, which is why they reach this comparison at all, and no other term
// can follow them — the signature, downgrade and optionality predicates each
// return early unless both sides hold the name as a function. The recorded
// `signature-loss` reason is unchanged, still resting on the 11 zero-arity stubs.
describe("rendy signature-loss evidence at pin b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3", () => {
  const readme = () => fixtureText(RENDY, decisionFor(RENDY, "rendy"));

  // Every member of the parsed surface; nine of these headings carry the
  // `function ` keyword upstream, which is what the header widening lifted.
  const MEMBERS = [
    "cancel_shake",
    "create_camera",
    "destroy_camera",
    "get",
    "get_display_size",
    "get_stack",
    "get_window_size",
    "screen_to_world",
    "set",
    "shake",
    "world_to_screen",
  ];

  test("the keyword-prefixed headings are read — the snapshot parses to all 11 members", async () => {
    const { markdownMembers } = await comparisonFor(RENDY, "rendy");
    expect(markdownMembers).toEqual(MEMBERS);
  });

  // The fork used to declare `animate` and `cancel_animations`, which the README
  // documents nowhere and `rendy.lua` defines in no form at this pin; correcting
  // the fork against the Lua emptied both name-set terms rather than moving them.
  // `missingMembers` then took upstream's five exposed variables, which the field
  // correction declared and the README documents nowhere either — the one term a
  // `const` can move, `MEMBER_DECL` matching a bare `const` and every other
  // predicate requiring a function on both sides.
  test("the two go.animate stand-ins are gone, and only the five variables are missing", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(RENDY, "rendy");
    expect(missingMembers).toEqual([
      "cameras",
      "display_height",
      "display_width",
      "window_height",
      "window_width",
    ]);
    expect(addedMembers).toEqual([]);
    // Neither name appears anywhere in the README — not as a heading, not in
    // prose. The only near-match is the word "animated" in the shake section.
    expect(/\brendy\.(animate|cancel_animations)\b/.test(readme())).toBe(false);
  });

  test("the signature collapse covers every shared member and is the leading term", async () => {
    const { emitted, signatureLossMembers } = await comparisonFor(RENDY, "rendy");
    // No `**PARAMETERS**` and no `**RETURN**` block anywhere in the README, so
    // `get_stack(screen_x, screen_y): CameraId[]` and `screen_to_world(camera_id,
    // screen_position): vmath.vector3` both emit as zero-arity `(): void`.
    expect(/^\*\*(PARAMETERS?|RETURNS?)\*\*\s*$/m.test(readme())).toBe(false);
    expect(emitted).toContain("function get_stack(): void;");
    expect(emitted).toContain("function screen_to_world(): void;");
    expect(signatureLossMembers).toEqual(MEMBERS);
  });

  test("no other term fires, so the record cannot be misread as gooey's or metrics' class", async () => {
    const { decision, downgradedMembers, optionalityLossMembers } = await comparisonFor(
      RENDY,
      "rendy",
    );
    expect(decision).toBe("no-go");
    // A zero-arity stub carries no type tokens, so there is no downgrade; and
    // with no parameters at all there is no optionality to lose.
    expect(downgradedMembers).toEqual([]);
    expect(optionalityLossMembers).toEqual([]);
    expect(decisionFor(RENDY, "rendy").reason).toBe("signature-loss");
  });

  test("the header widening is what lifted the surface: stripping the keyword changes nothing", () => {
    const asCommitted = parseMarkdownApi(readme(), "rendy.rendy");
    const stripped = parseMarkdownApi(
      readme().replace(/^(#{2,3}\s+)function\s+/gm, "$1"),
      "rendy.rendy",
    );
    expect(stripped.elements.map((e) => e.name)).toEqual(asCommitted.elements.map((e) => e.name));
    // Naming the surface keeps the equality above from being two empty parses
    // agreeing, and pins that the widening is what recovers the keyword headings.
    expect([...asCommitted.elements.map((e) => e.name)].sort()).toEqual(
      MEMBERS.map((m) => `rendy.${m}`),
    );
  });

  test("a keyword-prefixed heading closes the preceding section", () => {
    // Before the widening the 9 unmatched headings did not end a section, so the
    // rest of the API section pooled into `destroy_camera`'s description.
    const doc = parseMarkdownApi(readme(), "rendy.rendy");
    const destroy = doc.elements.find((e) => e.name === "rendy.destroy_camera");
    expect(destroy?.description).toBe(
      "Destroys a camera. This function is called automatically by the *rendy.go* game object.",
    );
  });
});

describe("platypus shared-document evidence at tag 4.3.1", () => {
  const readme = () => fixtureText(PLATYPUS, decisionFor(PLATYPUS, "platypus"));
  const severed = severedFor(PLATYPUS, "platypus");

  // The 14 fork constants, sorted as `compareFidelityToTsDefold` reports them: the 7
  // message hashes, the 5 `DIR_*` direction values, and the 2 `SEPARATION_*` modes the
  // field correction declared from `platypus.lua:27-28`.
  const CONSTANTS = [
    "DIR_ALL",
    "DIR_DOWN",
    "DIR_LEFT",
    "DIR_RIGHT",
    "DIR_UP",
    "DOUBLE_JUMP",
    "FALLING",
    "GROUND_CONTACT",
    "JUMP",
    "SEPARATION_RAYS",
    "SEPARATION_SHAPES",
    "WALL_CONTACT",
    "WALL_JUMP",
    "WALL_SLIDE",
  ];

  // The 19 `instance.` methods, sorted the same way.
  const INSTANCE_METHODS = [
    "abort_jump",
    "abort_wall_slide",
    "down",
    "force_jump",
    "has_ground_contact",
    "has_wall_contact",
    "is_falling",
    "is_jumping",
    "is_wall_jumping",
    "is_wall_sliding",
    "jump",
    "left",
    "move",
    "on_message",
    "right",
    "set_collisions",
    "toggle_debug",
    "up",
    "update",
  ];

  // The most generous reading available: rewrite the instance receiver to the
  // module's own so the uniform-prefix invariant accepts the whole document.
  const unified = () => readme().replace(/^(#{2,3}\s+)instance\./gm, "$1platypus.");

  test("the parser refuses the shared document, naming both receivers", () => {
    expect(() => parseMarkdownApi(readme(), "platypus.platypus")).toThrow(
      /non-uniform module prefix across headers: instance, platypus/,
    );
  });

  test("the dialect is not the blocker — it is the one the front-end already reads", () => {
    const text = readme();
    expect(/^\*\*PARAMETERS\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*RETURN\*\*\s*$/m.test(text)).toBe(true);
    expect(text).not.toContain("<kbd>");
    // Every signature heading is a bare `###` — none carries rendy's `function`
    // keyword, and none is demoted to `##`.
    // The document writes 20 of them, one per member the unified reading below
    // recovers; what matters here is the level and receiver, not the tally.
    const headings = text.split("\n").filter((line) => /^#{1,6}\s+\w+\.\w+\(.*\)\s*$/.test(line));
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every((line) => /^### (?:platypus|instance)\./.test(line))).toBe(true);
  });

  test("the platypus receiver alone parses to just `create` and loses every constant", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(
        filterToReceiver(readme(), "platypus"),
        "platypus.platypus",
        severed,
      );
    expect(doc.elements.map((e) => e.name.split(".").pop())).toEqual(["create"]);
    expect(missingMembers).toEqual(CONSTANTS);
    expect(addedMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["create"]);
    expect(decision).toBe("no-go");
  });

  test("the generous unified reading adds only hoisted instance methods, and still loses the constants", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(unified(), "platypus.platypus", severed);
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(
      ["create", ...INSTANCE_METHODS].sort(),
    );
    expect(missingMembers).toEqual(CONSTANTS);
    // Not a surface gain: these are `create`'s returned-instance methods lifted
    // into module scope, which is wrong rather than incomplete.
    expect(addedMembers).toEqual(INSTANCE_METHODS);
    expect(downgradedMembers).toEqual(["create"]);
    expect(decision).toBe("no-go");
  });

  test("the instance receiver alone loses the whole ts-defold surface", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(
        filterToReceiver(readme(), "instance").replace(/^(#{2,3}\s+)instance\./gm, "$1platypus."),
        "platypus.platypus",
        severed,
      );
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(INSTANCE_METHODS);
    expect(missingMembers).toEqual(["create", ...CONSTANTS].sort());
    expect(addedMembers).toEqual(INSTANCE_METHODS);
    expect(downgradedMembers).toEqual([]);
    expect(decision).toBe("no-go");
  });

  test("the constants are unreachable under every reading", () => {
    const text = readme();
    // The 5 direction values appear only inside a code example, never as a
    // heading; the 7 message hashes are paren-less `### platypus.<NAME>`
    // headings under `## Messages` that `HEADER` does not match.
    for (const constant of CONSTANTS) {
      expect(new RegExp(`^#{2,3}\\s+platypus\\.${constant}\\(`, "m").test(text)).toBe(false);
    }
    for (const message of ["FALLING", "GROUND_CONTACT", "JUMP", "WALL_SLIDE"]) {
      expect(text).toContain(`### platypus.${message}\n`);
    }
  });

  test("neither loss class rendy and metrics recorded fires here", async () => {
    for (const markdown of [filterToReceiver(readme(), "platypus"), unified()]) {
      const { signatureLossMembers, optionalityLossMembers } = await comparisonForMarkdown(
        markdown,
        "platypus.platypus",
        severed,
      );
      expect(signatureLossMembers).toEqual([]);
      expect(optionalityLossMembers).toEqual([]);
    }
  });

  test("the comparator never sees the config and instance interfaces, so the recorded loss is a floor", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, targetFor("platypus.platypus", severed).fixture),
      "utf8",
    );
    // `MEMBER_DECL` reads top-level `function`/`const` only, so the 12-field
    // `PlatypusConfig` and the 19-method `PlatypusInstance` are outside the
    // comparison even though the markdown emit collapses both to a bare record.
    expect(tsDefold).toContain("interface PlatypusConfig");
    expect(tsDefold).toContain("interface PlatypusInstance");
    expect(tsDefoldMembers(tsDefold).sort()).toEqual(["create", ...CONSTANTS].sort());
  });

  test("the recorded reason is the widened shared-document class", () => {
    expect(decisionFor(PLATYPUS, "platypus").reason).toBe("shared-document");
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  // The bare namespace is what makes the dotted golden a dead path here, so the
  // namespace-conditional golden assertion takes its absence arm.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    expect(targetFor("platypus.platypus", severed).fixture).toBe(
      "fixtures/authored/platypus.platypus.d.ts",
    );
    expect(existsSync(join(PACKAGE_ROOT, targetFor("platypus.platypus", severed).fixture))).toBe(
      true,
    );
    expect(classificationModule("platypus.platypus", severed)).toBe("platypus.platypus");
    expect(existsSync(join(PACKAGE_ROOT, "generated/platypus.platypus.d.ts"))).toBe(false);
  });

  // The PRD's standing rule for the forked instance surface: upstream's 19
  // documented `instance.` headings are what `PlatypusInstance` is kept current
  // against. Both sides are production output — the api-doc is `extractApiDoc`'s
  // typedef member reader over the fork, and `INSTANCE_METHODS` is the same list
  // the generous-reading test above derives from the pinned README through
  // `parseMarkdownApi`. A divergence is a stop-and-record against
  // `platypus/platypus.lua` at the pin, never a re-baseline of either side.
  test("the pinned README stays the reference for the forked instance surface", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/platypus.json"), "utf8")) as {
      elements: { name: string; functions?: { name: string }[] }[];
    };
    const instance = doc.elements.find((e) => e.name === "PlatypusInstance");
    expect(instance).toBeDefined();
    expect((instance?.functions ?? []).map((f) => f.name).sort()).toEqual(INSTANCE_METHODS);
  });
});

describe("starly doc-dialect evidence at commit 85d1b2a", () => {
  const readme = () => fixtureText(STARLY, decisionFor(STARLY, "starly"));

  // The 14 documented functions, sorted as `compareFidelityToTsDefold` reports
  // them.
  const FUNCTIONS = [
    "activate",
    "cancel_shake",
    "create",
    "destroy",
    "get_offset",
    "get_projection",
    "get_tight_world_area",
    "get_view",
    "get_viewport",
    "get_world_area",
    "is_shaking",
    "screen_to_world",
    "shake",
    "world_to_screen",
  ];

  // The 7 constants `CoreModule` declares, sorted as the comparator reports them.
  const CONSTANT_MEMBERS = [
    "c_behavior_center",
    "c_behavior_expand",
    "c_behavior_mixed",
    "c_behavior_stretch",
    "c_display_height",
    "c_display_ratio",
    "c_display_width",
  ];

  // The most generous reading available: rewrite all five dialect axes and reduce
  // `[name = default]` to `[name]` so `bracketedArgs` reads the optional slots.
  // Test-local for gooey's reason — the verdict this produces shows a
  // dialect-aware front-end would buy five new parser branches and no decision
  // change.
  const generous = () =>
    readme()
      .split("\n")
      .map((line) =>
        line
          .replace(/^(#{2,3}\s+)`(.+)`\s*$/, "$1$2")
          .replace(/^(#{2,3}\s+.*)$/, (heading) =>
            heading.replace(/\[\s*([A-Za-z_]\w*)\s*=[^\]]*\]/g, "[$1]"),
          )
          .replace(/^\*\*Parameters\*\*\s*$/, "**PARAMETERS**")
          .replace(/^\*\*Returns\*\*\s*$/, "**RETURN**")
          .replace(/^\*\s+`([^`]+)`:\s*`([^`]+)`\s*(.*)$/, "* `$1` ($2) - $3")
          .replace(/^\*\s+`([^`]+)`(?:\s+or\s+`([^`]+)`)?\s*$/, (_match, first, second) =>
            second === undefined
              ? `* \`result\` (${first}) - `
              : `* \`result\` (${first}|${second}) - `,
          ),
      )
      .join("\n")
      .replace(/^(\*\*(?:PARAMETERS|RETURN)\*\*)\n\n/gm, "$1\n");

  test("the front-end refuses the snapshot — no heading reads as a signature", () => {
    expect(() => parseMarkdownApi(readme(), "starly.starly")).toThrow(/no .*API signature section/);
  });

  test("the dialect, not the content, is the blocker — 14 wrapped headings for 14 functions", () => {
    const wrapped = readme()
      .split("\n")
      .filter((line) => /^#{2,3}\s+`[A-Za-z_]\w*\.[A-Za-z_]\w*\(.*\)`\s*$/.test(line));
    // Tied to `FUNCTIONS` by name rather than by tally, so this reading of the
    // snapshot has to agree with the surface the generous parse below recovers.
    expect(wrapped.map((line) => line.replace(/^#{2,3}\s+`\w+\.(\w+)\(.*$/, "$1")).sort()).toEqual(
      FUNCTIONS,
    );
    expect(wrapped.every((line) => line.startsWith("### `m_starly."))).toBe(true);
  });

  test("the marker and bullet axes are the corpus concepts in spellings the parser does not match", () => {
    const text = readme();
    expect(/^\*\*Parameters\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*Returns\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*PARAMETERS\*\*\s*$/m.test(text)).toBe(false);
    expect(/^\*\*RETURN\*\*\s*$/m.test(text)).toBe(false);
    // Typed bullets are colon-typed, never the `(type) - ` form `TYPED_BULLET`
    // accepts.
    expect(/^\*\s+`id`:\s*`hash`/m.test(text)).toBe(true);
    expect(/^\*\s+`[^`]+`\s*\([^)]*\)/m.test(text)).toBe(false);
  });

  test("every marker is separated from its bullets by a blank line, which closes the list", () => {
    const lines = readme().split("\n");
    const markers = lines.filter((line) => /^\*\*(?:Parameters|Returns)\*\*\s*$/.test(line));
    expect(markers.length).toBeGreaterThan(0);
    lines.forEach((line, index) => {
      if (/^\*\*(?:Parameters|Returns)\*\*\s*$/.test(line)) expect(lines[index + 1]).toBe("");
    });
  });

  test("the generous reading lifts all 14 functions and is still no-go", async () => {
    const {
      doc,
      decision,
      missingMembers,
      addedMembers,
      downgradedMembers,
      signatureLossMembers,
      optionalityLossMembers,
    } = await comparisonForMarkdown(generous(), "starly.starly", severedFor(STARLY, "starly"));
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
    // The README documents the constants as prose bullets only, so no reading of
    // it reaches them; the 14 lifted headings match `CoreModule`'s 14 methods by
    // name, which is why nothing is added.
    expect(missingMembers).toEqual(CONSTANT_MEMBERS);
    expect(addedMembers).toEqual([]);
    // `positions: vmath.vector3[]` emits as `Record<string | number, unknown>`.
    expect(downgradedMembers).toEqual(["get_tight_world_area"]);
    // Both drop their coordinate parameters — 4 and 3 slots emit as 2.
    expect(signatureLossMembers).toEqual(["screen_to_world", "world_to_screen"]);
    // `durationScalar?`/`radiusScalar?` emit as required `arg4`/`arg5`.
    expect(optionalityLossMembers).toEqual(["shake"]);
    expect(decision).toBe("no-go");
  });

  test("the `export =` handle resolves, so the verdict rests on named loss terms", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, targetFor("starly.starly", severedFor(STARLY, "starly")).fixture),
      "utf8",
    );
    expect(tsDefold).toContain("export = exportThis;");
    // `Starley = CameraMap & Readonly<CoreModule>`: the 21 real members live
    // inside `CoreModule` and reach the comparison through the handle, while the
    // 8 fields inside `CameraMap`'s `LuaMap` value stay out of it.
    expect(tsDefoldMembers(tsDefold)).toEqual([...FUNCTIONS, ...CONSTANT_MEMBERS].sort());
    const { opaqueTsDefoldSurface } = compareFidelityToTsDefold(
      "function create(): void;",
      tsDefold,
    );
    expect(opaqueTsDefoldSurface).toBe(false);
  });

  test("the constants and the camera map are unreachable under every reading", () => {
    const text = readme();
    for (const constant of [
      "display_width",
      "display_height",
      "display_ratio",
      "behavior_center",
      "behavior_expand",
      "behavior_mixed",
      "behavior_stretch",
    ]) {
      expect(text).toContain(`* \`starly.${constant}\`:`);
      expect(new RegExp(`^#{2,3}.*starly\\.${constant}\\(`, "m").test(text)).toBe(false);
    }
    for (const field of ["behavior", "viewport_x", "near", "far", "zoom"]) {
      expect(text).toContain(`* \`starly[id].${field}\`:`);
    }
  });

  test("even the generous emit drops 3 parameters across 2 members", async () => {
    const { emitted } = await comparisonForMarkdown(
      generous(),
      "starly.starly",
      severedFor(STARLY, "starly"),
    );
    // Both headings declare more arguments than their `**Parameters**` list
    // documents, so the emit keeps only the documented ones.
    expect(emitted).toContain("function screen_to_world(id: Hash, visible?: boolean)");
    expect(emitted).toContain("function world_to_screen(id: Hash, visible?: boolean)");
    expect(readme()).toContain("screen_to_world(id, screen_x, screen_y, [visible = false])");
    expect(readme()).toContain("world_to_screen(id, world_position, [visible = false])");
  });

  test("`shake`'s bracketed bullet names cost both their identity and their optionality", async () => {
    const { emitted } = await comparisonForMarkdown(
      generous(),
      "starly.starly",
      severedFor(STARLY, "starly"),
    );
    // The bullets repeat the heading's brackets in the name — `* \`[duration_scalar]\`:
    // \`number\`` — which is no identifier, so the emitter synthesizes positional
    // names and `bracketedArgs` never marks the slots optional.
    expect(readme()).toContain("* `[duration_scalar]`: `number`");
    expect(emitted).toContain(
      "function shake(id: Hash, count: number, duration: number, radius: number, arg4: number, arg5: number)",
    );
  });

  test("`get_tight_world_area` downgrades its `table` parameter", async () => {
    const { emitted } = await comparisonForMarkdown(
      generous(),
      "starly.starly",
      severedFor(STARLY, "starly"),
    );
    expect(emitted).toContain("positions: Record<string | number, unknown>");
    // The forked snapshot is the mapped golden, so the surface the downgrade is
    // measured against spells the upstream `vmath.vector3[]` as `Vector3[]`. The
    // comparison scores no type token, so the term itself is unmoved.
    expect(
      readFileSync(
        join(PACKAGE_ROOT, targetFor("starly.starly", severedFor(STARLY, "starly")).fixture),
        "utf8",
      ),
    ).toContain("positions: Vector3[]");
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    expect(targetFor("starly.starly", severedFor(STARLY, "starly")).fixture).toBe(
      "fixtures/authored/starly.starly.d.ts",
    );
    expect(classificationModule("starly.starly", severedFor(STARLY, "starly"))).toBe(
      "starly.starly",
    );
  });

  test("the recorded reason is doc-dialect", () => {
    expect(decisionFor(STARLY, "starly").reason).toBe("doc-dialect");
  });
});

describe("dicebag type-downgrade evidence at tag 0.3", () => {
  const readme = () => fixtureText(DICEBAG, decisionFor(DICEBAG, "dicebag"));
  const severed = severedFor(DICEBAG, "dicebag");

  // The 11 documented functions, sorted as `compareFidelityToTsDefold` reports
  // them. The whole markdown surface, and the callable half of the fork's.
  const FUNCTIONS = [
    "bag_create",
    "bag_draw",
    "bag_reset",
    "flip_coin",
    "roll_custom_dice",
    "roll_dice",
    "roll_special_dice",
    "set_up_rng",
    "table_create",
    "table_reset",
    "table_roll",
  ];

  const DOWNGRADED = ["roll_custom_dice", "table_create", "table_roll"];

  // The one remaining fixable gap rewritten, and only it: the `set_up_rng` heading
  // bracketed so `bracketedArgs` reads the optionality the bullet states only in
  // prose. Test-local for `filterToReceiver`'s reason — what it measures is that
  // the front-end change would not move the verdict.
  const generous = () =>
    readme().replace(/^(#{2,3}\s+dicebag\.set_up_rng\()seed(\)\s*)$/m, "$1[seed]$2");

  test("the front-end reads the snapshot as-is — 11 elements, no refusal", () => {
    const doc = parseMarkdownApi(readme(), "dicebag.dicebag");
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
  });

  // The callable surfaces match one-for-one; the two names that do not are the
  // state tables the field correction declared, which the README documents
  // nowhere. A `const` reaches this comparison because `MEMBER_DECL` matches one,
  // and it can move no term but the name set: the signature, downgrade and
  // optionality predicates all require the name to be a function on both sides.
  test("the callable surfaces match one-for-one, the two declared tables aside", async () => {
    const {
      missingMembers,
      addedMembers,
      markdownMembers,
      tsDefoldMembers: tsMembers,
    } = await comparisonFor(DICEBAG, "dicebag");
    expect(missingMembers).toEqual(["bags", "tables"]);
    expect(addedMembers).toEqual([]);
    expect(tsMembers).toEqual([...FUNCTIONS, "bags", "tables"].sort());
    expect(markdownMembers).toEqual(FUNCTIONS);
  });

  test("no member's signature collapses and the ts-defold surface is not opaque", async () => {
    const { signatureLossMembers, opaqueTsDefoldSurface } = await comparisonFor(DICEBAG, "dicebag");
    expect(signatureLossMembers).toEqual([]);
    expect(opaqueTsDefoldSurface).toBe(false);
  });

  test("type precision alone drives the no-go — three downgrades and one optionality loss", async () => {
    const { downgradedMembers, optionalityLossMembers, decision } = await comparisonFor(
      DICEBAG,
      "dicebag",
    );
    expect(downgradedMembers).toEqual(DOWNGRADED);
    expect(optionalityLossMembers).toEqual(["set_up_rng"]);
    expect(decision).toBe("no-go");
  });

  test("the comma split recovers the `id` union the document always stated", async () => {
    expect(readme()).toContain("* `id` (string, number, hash) - ");
    const { emitted } = await comparisonFor(DICEBAG, "dicebag");
    // ts-defold spells the third alternative with its own ambient `hash`; the
    // shared emitter maps the token to this repo's `Hash`, which the comparator
    // reads as the same precision rather than a downgrade.
    expect(emitted).toContain("function bag_draw(id: string | number | Hash)");
  });

  test("the generous reading clears the one fixable gap and is still no-go", async () => {
    const { doc, decision, downgradedMembers, optionalityLossMembers } =
      await comparisonForMarkdown(generous(), "dicebag.dicebag", severed);
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
    expect(optionalityLossMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["roll_custom_dice", "table_create", "table_roll"]);
    expect(decision).toBe("no-go");
  });

  test("the residue is upstream underspecification no parser can fix", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "dicebag.dicebag", severed);
    // `sides` and `rollable_table` are documented `(table)`, and `table_roll`
    // returns `(any)`; ts-defold types all three concretely.
    expect(emitted).toContain("sides: Record<string | number, unknown>");
    expect(emitted).toContain("rollable_table: Record<string | number, unknown>");
    // Read off the fork, not the retired ts-defold snapshot. The fork is the
    // *mapped* golden, whose only difference is `hash` -> `Hash` on the `id`
    // parameters — provably term-neutral, because `compareFidelityToTsDefold`
    // keys `downgradedMembers` on the literal `unknown` token alone, never on a
    // core-type spelling.
    const snapshot = readFileSync(
      join(PACKAGE_ROOT, targetFor("dicebag.dicebag", severed).fixture),
      "utf8",
    );
    expect(snapshot).toContain("sides: Array<[number, number]>");
    expect(snapshot).toContain("rollable_table: Array<[number, any, boolean?]>");
  });

  test("the recorded reason is type-downgrade", () => {
    expect(decisionFor(DICEBAG, "dicebag").reason).toBe("type-downgrade");
  });
});

describe("bzAnim no-signature-section evidence at tag v.1.2", () => {
  const readme = () => fixtureText(BZANIM, decisionFor(BZANIM, "bzLibrary"));
  const severed = severedFor(BZANIM, "bzLibrary");

  // The heading form `parse-markdown-api` reads as a signature section.
  const SIGNATURE_HEADING = /^#{2,3}\s+[A-Za-z_]\w*\.[A-Za-z_]\w*\(.*\)\s*$/;

  // The 3 constants and 9 functions of the retained surface, sorted as
  // `compareFidelityToTsDefold` reports them. The last three arrived when the fork
  // was corrected against the pinned Lua; the README names none of them.
  const TS_DEFOLD_MEMBERS = [
    "DEBUG_LEVEL",
    "INFO_LEVEL",
    "TRACE_LEVEL",
    "animate",
    "animateSequence",
    "cancel",
    "info",
    "isReady",
    "registerController",
    "setDebugLevel",
    "setMaxPoints",
    "unregisterController",
  ];

  const SHARED_FUNCTIONS = [
    "animate",
    "animateSequence",
    "cancel",
    "info",
    "isReady",
    "setDebugLevel",
  ];

  // The most generous reading available: hoist every function the README names
  // anywhere — its Lua snippets call them as `bz.<fn>(...)` — into the signature
  // headings the document itself never writes. Test-local for `filterToReceiver`'s
  // reason: what it measures is that the verdict holds even against a front-end
  // that could read this document, so the decision does not rest on the dialect
  // gap being fixable.
  const generous = () => {
    const named = [
      ...new Set([...readme().matchAll(/\bbz\.([A-Za-z_]\w*)\(/g)].map((m) => m[1] as string)),
    ].sort();
    return [readme(), "", ...named.map((fn) => `### bzAnim.${fn}()\n`)].join("\n");
  };

  test("the front-end refuses the snapshot for the right reason — no signature section", () => {
    // Not `/non-uniform module prefix/`: there is no receiver to disagree about.
    expect(() => parseMarkdownApi(readme(), "bzAnim.bzLibrary")).toThrow(
      /no .*API signature section/,
    );
  });

  test("not one heading reads as a signature, and the prose headings are all there is", () => {
    const headings = readme()
      .split("\n")
      .filter((line) => /^#{1,6}\s/.test(line));
    expect(headings.filter((line) => SIGNATURE_HEADING.test(line))).toEqual([]);
    // The snapshot is refused because the document documents prose, not because
    // the fixture is empty.
    expect(headings).toContain("## Helper Functions");
    expect(headings).toContain("## Usage");
    expect(headings.length).toBeGreaterThan(1);
  });

  test("the retained surface is 12 members and its entry points take an options table", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, targetFor("bzAnim.bzLibrary", severed).fixture),
      "utf8",
    );
    expect(tsDefoldMembers(tsDefold)).toEqual(TS_DEFOLD_MEMBERS);
    // The shape a flat signature table is structurally unable to express, which
    // is why this is a stronger no-go than the dialect gap alone.
    for (const shape of ["AnimateArgs", "AnimateSequenceArgs", "type Path", "type Segment"]) {
      expect(tsDefold).toContain(shape);
    }
    expect(tsDefold).toContain("function animate(args: AnimateArgs): string;");
  });

  test("the generous reading lifts the 7 README-named functions and is still no-go", async () => {
    const {
      doc,
      decision,
      missingMembers,
      addedMembers,
      downgradedMembers,
      signatureLossMembers,
      optionalityLossMembers,
    } = await comparisonForMarkdown(generous(), "bzAnim.bzLibrary", severed);
    expect(doc.elements.map((e) => e.name.split(".").pop())).toEqual([
      ...SHARED_FUNCTIONS,
      "setMaxPts",
    ]);
    // Every constant is invisible to a flat signature parse, and `setMaxPts` is
    // the README's own name for what upstream calls `setMaxPoints` — so the three
    // functions the document never mentions go missing beside the three constants.
    expect(missingMembers).toEqual([
      "DEBUG_LEVEL",
      "INFO_LEVEL",
      "TRACE_LEVEL",
      "registerController",
      "setMaxPoints",
      "unregisterController",
    ]);
    expect(addedMembers).toEqual(["setMaxPts"]);
    // Not a precision loss and not a lost optional — the document carries no
    // parameter bullets at all, so every shared function collapses whole.
    expect(signatureLossMembers).toEqual(SHARED_FUNCTIONS);
    expect(downgradedMembers).toEqual([]);
    expect(optionalityLossMembers).toEqual([]);
    expect(decision).toBe("no-go");
  });

  test("every generously hoisted function emits a zero-arity void stub", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "bzAnim.bzLibrary", severed);
    for (const fn of SHARED_FUNCTIONS) {
      expect(emitted).toContain(`function ${fn}(): void;`);
    }
  });

  test("the README names a function upstream does not export", () => {
    // `bzAnim/bzLibrary.lua` defines `bz.setMaxPoints`, so the document is not a
    // faithful surface even on its own terms.
    expect(readme()).toContain("bz.setMaxPts");
    expect(readme()).not.toContain("bz.setMaxPoints");
  });

  test("the recorded reason is no-signature-section", () => {
    expect(decisionFor(BZANIM, "bzLibrary").reason).toBe("no-signature-section");
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  // The bare namespace is what makes the dotted golden a dead path here, so the
  // namespace-conditional golden assertion takes its absence arm.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    expect(targetFor("bzAnim.bzLibrary", severed).fixture).toBe(
      "fixtures/authored/bzAnim.bzLibrary.d.ts",
    );
    expect(existsSync(join(PACKAGE_ROOT, targetFor("bzAnim.bzLibrary", severed).fixture))).toBe(
      true,
    );
    expect(existsSync(join(PACKAGE_ROOT, "generated/bzAnim.bzLibrary.d.ts"))).toBe(false);
  });

  // The one target in the corpus whose classification name is not its moduleId,
  // and the reason the shared severed-branch assertion is prefix-shaped rather
  // than an identity. Recorded with its real value; a fabricated
  // `bzAnim.bzLibrary.d.ts` path would satisfy the old form by destroying the
  // provenance `severedSource.path` exists to carry.
  test("the upstream filename divergence is recorded, not papered over", () => {
    expect(classificationModule("bzAnim.bzLibrary", severed)).toBe("bzAnim.bzAnim");
    expect(severed?.path).toBe("packages/bzAnim/bzAnim.bzAnim.d.ts");
  });
});
