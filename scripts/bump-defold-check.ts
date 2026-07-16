import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildLlmsFull,
  buildLlmsTxt,
  PACKAGE_TARGET,
} from "../packages/docs-site/scripts/build-llms.ts";
import {
  buildSignaturesArtifact,
  type SignaturesArtifact,
} from "../packages/types/scripts/generate-api-signatures.ts";
import {
  collectEvidence,
  evaluateReleaseReadiness,
  type ReadinessProblem,
} from "./defold-release-readiness.ts";
import { RELEASE_MODEL } from "./release-model.ts";

// The offline completeness gate behind `bump:defold --check`. It is not a
// rebuild: it sources the expected release/baseline from the release model,
// reuses the release-readiness evaluator verbatim, then adds the two dimensions
// readiness does not cover — the committed llms corpus and api-signatures drift —
// plus a "version-coupled tests derive from the model" source scan. Every path is
// network-free and deterministic, so it is safe to run in CI.

export interface ReleaseModelView {
  readonly current: string;
  readonly previous: string;
}

export type CheckCategory = ReadinessProblem["category"] | "llms" | "signatures";

export interface CheckProblem {
  readonly category: CheckCategory;
  readonly message: string;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly problems: readonly CheckProblem[];
}

export function expectedFromModel(model: ReleaseModelView = RELEASE_MODEL): {
  release: string;
  baseline: string;
} {
  return { release: model.current, baseline: model.previous };
}

export interface DriftInputs {
  readonly llmsTxt: { readonly committed: string; readonly fresh: string };
  readonly llmsFull: { readonly committed: string; readonly fresh: string };
  readonly signatures: { readonly committed: unknown; readonly fresh: SignaturesArtifact };
}

// Compare the committed corpus/signatures bytes against a fresh in-memory build.
// The llms corpus is a byte comparison (the drift guard the build-llms tests
// enforce); the signatures artifact is compared by deep equality so key-order
// reformatting is not a false blocker.
export function driftProblems(inputs: DriftInputs): CheckProblem[] {
  const problems: CheckProblem[] = [];
  if (inputs.llmsTxt.committed !== inputs.llmsTxt.fresh) {
    problems.push({
      category: "llms",
      message: "committed packages/docs/llms.txt does not match a fresh build-llms output",
    });
  }
  if (inputs.llmsFull.committed !== inputs.llmsFull.fresh) {
    problems.push({
      category: "llms",
      message: "committed packages/docs/llms-full.txt does not match a fresh build-llms output",
    });
  }
  if (!Bun.deepEquals(inputs.signatures.fresh, inputs.signatures.committed)) {
    problems.push({
      category: "signatures",
      message: "committed packages/types/api-signatures.json does not match the generator output",
    });
  }
  return problems;
}

// Read the committed corpus/signatures from disk and pair each with its fresh
// in-memory generation. The generators resolve their own package-relative
// sources (matching the readiness collectors), so `root` locates only the
// committed bytes the fresh output is drift-checked against.
export function collectDriftInputs(root: string): DriftInputs {
  const docsDir = path.join(root, "packages/docs");
  const signaturesPath = path.join(root, "packages/types/api-signatures.json");
  const readOr = (abs: string): string => (existsSync(abs) ? readFileSync(abs, "utf8") : "");
  const committedSignatures: unknown = existsSync(signaturesPath)
    ? JSON.parse(readFileSync(signaturesPath, "utf8"))
    : null;
  return {
    llmsTxt: {
      committed: readOr(path.join(docsDir, "llms.txt")),
      fresh: buildLlmsTxt(PACKAGE_TARGET),
    },
    llmsFull: {
      committed: readOr(path.join(docsDir, "llms-full.txt")),
      fresh: buildLlmsFull(PACKAGE_TARGET),
    },
    signatures: { committed: committedSignatures, fresh: buildSignaturesArtifact() },
  };
}

// The version-coupled test files Step "release-model-single-source" rewired to
// derive their version literal from the single source rather than hardcode it.
// The scan keeps that guarantee enforced: each must reference a derived version
// symbol and carry no un-commented bare current-version literal.
export const MODEL_COUPLED_TEST_FILES: readonly string[] = [
  "packages/cli/src/defold-version.test.ts",
  "packages/types/scripts/sync-api-docs.test.ts",
  "packages/types/test/api-targets.test.ts",
  "packages/types/test/fixture-surface-enumerate.test.ts",
];

// The per-package rootDir boundary keeps most of these files from importing
// `release-model` directly, so any of the derived version symbols (the model's
// seed constants or the sync script's re-exported `DEFOLD_VERSION`) counts as
// deriving from the single source.
const DERIVED_VERSION_SYMBOLS: readonly string[] = [
  "release-model",
  "DEFOLD_VERSION",
  "CURRENT_STABLE_DEFOLD_VERSION",
  "DEFOLD_VERSIONS",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function testsModelCorrespondenceProblems(
  root: string,
  model: ReleaseModelView = RELEASE_MODEL,
  files: readonly string[] = MODEL_COUPLED_TEST_FILES,
): CheckProblem[] {
  const problems: CheckProblem[] = [];
  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) {
      problems.push({ category: "integration", message: `version-coupled test ${rel} is absent` });
      continue;
    }
    const source = readFileSync(abs, "utf8");
    const code = stripComments(source);
    if (!DERIVED_VERSION_SYMBOLS.some((symbol) => code.includes(symbol))) {
      problems.push({
        category: "integration",
        message: `version-coupled test ${rel} does not derive its version from the release model`,
      });
    }
    if (code.includes(model.current)) {
      problems.push({
        category: "integration",
        message: `version-coupled test ${rel} hardcodes the current version literal ${model.current}`,
      });
    }
  }
  return problems;
}

export function runBumpCheck(root: string, model: ReleaseModelView = RELEASE_MODEL): CheckResult {
  const expected = expectedFromModel(model);
  const readiness = evaluateReleaseReadiness(collectEvidence(root, expected));
  const problems: CheckProblem[] = [
    ...readiness.problems,
    ...driftProblems(collectDriftInputs(root)),
    ...testsModelCorrespondenceProblems(root, model),
  ];
  return { ok: problems.length === 0, problems };
}
