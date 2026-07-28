import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AuthoredTarget,
  emitAuthoredDeclaration,
  lowerAuthoredApiDoc,
  readAuthoredTargets,
} from "./sync-authored-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The defcon.console target as it appears in a validated config. An authored
// target vendors a first-party/forked `.d.ts` and pins the publish namespace it
// is emitted under plus the canonical golden paths. Unlike the markdown/luals/
// script_api lanes the source is already a `declare module` ambient, so the lane
// vendors + `extractApiDoc`s it rather than parsing a foreign source.
const DEFCON: AuthoredTarget = {
  repo: "https://github.com/britzl/defcon",
  ref: "2.6.0",
  license: "MIT",
  authored: "fixtures/authored/defcon.console.d.ts",
  moduleId: "defcon.console",
  namespace: "defcon",
  generated: "generated/defcon.d.ts",
  apiDoc: "api-doc/defcon.json",
  fidelity: "fidelity/defcon.json",
};

function writeConfig(config: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "authored-targets-config-"));
  writeFileSync(join(root, "authored-targets.json"), JSON.stringify(config));
  return root;
}

describe("readAuthoredTargets", () => {
  test("parses the committed defcon entry into a typed target", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const defcon = targets.find((t) => t.moduleId === "defcon.console");
    expect(defcon).toBeDefined();
    expect(defcon?.namespace).toBe("defcon");
    expect(defcon?.repo).toBe("https://github.com/britzl/defcon");
    expect(defcon?.ref).toBe("2.6.0");
    expect(defcon?.authored).toBe("fixtures/authored/defcon.console.d.ts");
    expect(defcon?.generated).toBe("generated/defcon.d.ts");
    expect(defcon?.apiDoc).toBe("api-doc/defcon.json");
    expect(defcon?.license).toBe("MIT");
  });

  test("throws naming the missing field and the offending entry", () => {
    const { authored: _drop, ...missingAuthored } = DEFCON;
    const root = writeConfig({ targets: [missingAuthored] });
    expect(() => readAuthoredTargets(root)).toThrow(/authored/);
    expect(() => readAuthoredTargets(root)).toThrow(/defcon\.console/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = DEFCON;
    const root = writeConfig({ targets: [missingModuleId] });
    expect(() => readAuthoredTargets(root)).toThrow(/moduleId/);
    expect(() => readAuthoredTargets(root)).toThrow(/0/);
  });

  test("defaults fidelity to fidelity/<namespace>.json and license to '' when omitted", () => {
    const { fidelity: _f, license: _l, ...bare } = DEFCON;
    const root = writeConfig({ targets: [bare] });
    const [target] = readAuthoredTargets(root);
    expect(target?.fidelity).toBe("fidelity/defcon.json");
    expect(target?.license).toBe("");
  });
});

describe("emitAuthoredDeclaration", () => {
  test("emits the vendored authored .d.ts as the bare-namespace generated golden", () => {
    const contents = emitAuthoredDeclaration(PACKAGE_ROOT, DEFCON);
    // The forked ambient module keyed by moduleId, exported symbols intact
    // (assert on symbols, never the whole blob).
    expect(contents).toContain("declare module 'defcon.console' {");
    expect(contents).toContain("function start(");
    expect(contents).toContain("function register_command(");
  });
});

describe("lowerAuthoredApiDoc", () => {
  test("extractApiDoc lowers the fork under the publish namespace", () => {
    const json = lowerAuthoredApiDoc(PACKAGE_ROOT, DEFCON);
    const doc = JSON.parse(json) as { info: { namespace: string }; elements: { name: string }[] };
    expect(doc.info.namespace).toBe("defcon");
    const names = doc.elements.map((e) => e.name);
    expect(names).toContain("start");
    expect(names).toContain("register_command");
  });
});

describe("authored goldens regenerate byte-for-byte", () => {
  test("each target's .d.ts matches its committed generated golden", () => {
    for (const target of readAuthoredTargets(PACKAGE_ROOT)) {
      const regenerated = emitAuthoredDeclaration(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.generated), "utf8");
      expect(regenerated).toBe(committed);
    }
  });

  test("each target's lowered api-doc matches its committed api-doc golden", () => {
    for (const target of readAuthoredTargets(PACKAGE_ROOT)) {
      const regenerated = lowerAuthoredApiDoc(PACKAGE_ROOT, target);
      const committed = readFileSync(join(PACKAGE_ROOT, target.apiDoc), "utf8");
      expect(regenerated).toBe(committed);
    }
  });
});

// A fork's fidelity is 100% by construction: the emitted surface IS the vendored
// `.d.ts`. The go/no-go gate is therefore a forked-vs-generated identity diff,
// not a coverage comparison.
describe("fork identity (100% by construction)", () => {
  test("the generated golden is byte-identical to its vendored authored source", () => {
    for (const target of readAuthoredTargets(PACKAGE_ROOT)) {
      const vendored = readFileSync(join(PACKAGE_ROOT, target.authored), "utf8");
      const generated = readFileSync(join(PACKAGE_ROOT, target.generated), "utf8");
      expect(generated).toBe(vendored);
    }
  });
});

describe("defcon.console migration integrity", () => {
  test("defcon is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "defcon")).toBe(true);
  });

  test("defcon.console is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "defcon.console")).toBe(false);
  });

  test("the defcon dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defcon")).toBe(false);
  });

  test("the retired ts-defold fixture and dotted generated golden are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/defcon.console.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/defcon.console.d.ts"))).toBe(false);
  });
});

describe("deftest.deftest migration integrity", () => {
  test("deftest is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "deftest")).toBe(true);
  });

  test("deftest.deftest is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "deftest.deftest")).toBe(false);
  });

  test("the deftest dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "deftest")).toBe(false);
  });

  test("the retired ts-defold fixture and dotted generated golden are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/deftest.deftest.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/deftest.deftest.d.ts"))).toBe(false);
  });
});

describe("defmath.defmath migration integrity", () => {
  test("defmath is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "defmath")).toBe(true);
  });

  test("defmath.defmath is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "defmath.defmath")).toBe(false);
  });

  test("the defmath dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defmath")).toBe(false);
  });

  test("the retired ts-defold fixture and dotted generated golden are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/defmath.defmath.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/defmath.defmath.d.ts"))).toBe(false);
  });
});
