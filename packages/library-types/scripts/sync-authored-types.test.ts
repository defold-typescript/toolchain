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

// The committed api-doc JSON's element list — what the docs-site consumes for a
// namespace, produced by `lowerAuthoredApiDoc` -> `extractApiDoc` over the
// vendored fork.
function apiDocElements(namespace: string): Record<string, unknown>[] {
  const { elements } = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "api-doc", `${namespace}.json`), "utf8"),
  ) as { elements: Record<string, unknown>[] };
  return elements;
}

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

// A fork's emit is lossless by construction: the emitted surface IS the vendored
// `.d.ts`. The go/no-go gate is therefore a forked-vs-generated identity diff,
// not a coverage comparison — it proves emission fidelity, not that the vendored
// surface matches upstream.
describe("fork identity (lossless emit by construction)", () => {
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

  test("the lowered api-doc publishes the ambient test DSL alongside the unmarked module members", () => {
    const elements = apiDocElements("deftest");
    const byName = (name: string) => elements.find((e) => e.name === name);
    for (const name of ["describe", "test", "assert_equal", "assert_error"]) {
      expect(byName(name)).toMatchObject({ type: "FUNCTION", global: true });
    }
    for (const name of ["add", "run"]) {
      expect(byName(name)).toMatchObject({ type: "FUNCTION" });
      expect(Object.hasOwn(byName(name) ?? {}, "global")).toBe(false);
    }
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

  test("the golden carries the core-type-renamed ambient engine types", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/defmath.d.ts"), "utf8");
    expect(golden).toContain("Vector3 | Vector4");
    expect(golden).toContain(": Quaternion");
  });

  test("the golden references no dotted vmath engine types", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/defmath.d.ts"), "utf8");
    expect(golden).not.toContain("vmath.");
  });
});

describe("zzfx.api migration integrity", () => {
  test("zzfx is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "zzfx")).toBe(true);
  });

  test("zzfx.api is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "zzfx.api")).toBe(false);
  });

  test("the defold-zzfx dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-zzfx")).toBe(false);
  });

  test("the retired ts-defold fixture and dotted generated golden are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/zzfx.api.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/zzfx.api.d.ts"))).toBe(false);
  });

  test("the golden carries the module-external opaque handle declaration", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/zzfx.d.ts"), "utf8");
    expect(golden).toContain("type ZzFXSample = LuaUserdata");
    expect(golden).toContain("declare module 'zzfx.api' {");
  });
});

describe("nakama helpers migration integrity", () => {
  test("both hand-written helpers are registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "nakama.engine.defold")).toBe(true);
    expect(targets.some((t) => t.namespace === "nakama.util.log")).toBe(true);
  });

  test("neither helper is a ts-defold library-targets row any longer", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "nakama.engine.defold")).toBe(false);
    expect(targets.some((t) => t.module === "nakama.util.log")).toBe(false);
  });

  // This severance only dropped the helpers from the dir, which survived on its
  // one remaining live row; that row has since severed too, so the dir is gone
  // and the surviving claim is that no classification entry anywhere still owns
  // a helper — which is what a regen resurrecting the dir would violate.
  test("no classification entry claims either helper, and the dir they shared is gone", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string; modules: string[] }[] };
    expect(dirs.some((c) => c.dir === "nakama-defold")).toBe(false);
    const modules = dirs.flatMap((c) => c.modules);
    expect(modules.length).toBeGreaterThan(0);
    expect(modules).not.toContain("nakama.engine.defold");
    expect(modules).not.toContain("nakama.util.log");
  });

  test("the retired ts-defold helper fixtures are gone (authored copies replace them)", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/nakama.engine.defold.d.ts"))).toBe(
      false,
    );
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/nakama.util.log.d.ts"))).toBe(false);
  });
});

describe("boom.boom migration integrity", () => {
  test("boom is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "boom")).toBe(true);
  });

  test("boom.boom is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "boom.boom")).toBe(false);
  });

  test("the boom dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "boom")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, and dotted api-doc are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/boom.boom.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/boom.boom.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/boom.boom.json"))).toBe(false);
  });

  test("the golden carries the core-type-renamed Hash/Url at every site ts-defold spelled lowercase", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/boom.d.ts"), "utf8");
    expect(golden).toContain("readonly __url?: Url;");
    expect(golden).toContain("readonly id: Hash;");
    expect(golden).toContain("readonly ids: LuaMap<Hash, Hash>;");
    expect(golden).toContain("readonly tags: LuaMap<string | Hash, boolean>;");
    expect(golden).toContain("readonly area_url: Url | undefined;");
    expect(golden).toContain("atlas?: string | Hash;");
    for (const lowercase of [": hash", ": url", "<hash", "| hash", "| url"]) {
      expect(golden).not.toContain(lowercase);
    }
  });

  test("the lowered api-doc publishes boom's ambient globals and component members", () => {
    const elements = apiDocElements("boom");
    const byName = (name: string) => elements.find((e) => e.name === name);
    for (const name of ["add", "vec2", "rand", "on_collide"]) {
      expect(byName(name)).toMatchObject({ type: "FUNCTION", global: true });
    }
    for (const name of ["rgb.RED", "vec2.UP"]) {
      expect(byName(name)).toMatchObject({ type: "VARIABLE", global: true });
    }
    for (const [shape, member] of [
      ["AreaComp", "has_point"],
      ["BodyComp", "jump"],
      ["SpriteComp", "play"],
    ]) {
      const typedef = byName(shape ?? "") as
        | { global?: true; functions?: { name: string }[] }
        | undefined;
      expect(typedef).toMatchObject({ type: "TYPEDEF", global: true });
      expect(typedef?.functions?.map((f) => f.name)).toContain(member);
    }
    // The one symbol the page's `import * as boom from "boom.boom"` reaches.
    expect(byName("boom")).toMatchObject({ type: "FUNCTION" });
    expect(Object.hasOwn(byName("boom") ?? {}, "global")).toBe(false);
  });
});

describe("defsave.defsave migration integrity", () => {
  test("defsave is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    expect(targets.some((t) => t.namespace === "defsave")).toBe(true);
  });

  test("defsave.defsave is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "defsave.defsave")).toBe(false);
  });

  test("the defsave dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defsave")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, and dotted api-doc are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/defsave.defsave.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/defsave.defsave.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/defsave.defsave.json"))).toBe(false);
  });

  test("the golden declares the members ts-defold omitted and corrects the wrong returns", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/defsave.d.ts"), "utf8");
    for (const added of [
      "function obfuscate(",
      "function get_file_path(",
      "function key_exists(",
      "function isset(",
      "function reset_to_default(",
      "function is_loaded(",
      "function final(",
    ]) {
      expect(golden).toContain(added);
    }
    expect(golden).toContain("let enable_obfuscation: boolean;");
    expect(golden).toContain("function save(file: string, force?: boolean): boolean | undefined;");
    expect(golden).toContain(
      "function set(file: string, key: string, value: any): boolean | undefined;",
    );
    expect(golden).not.toContain("function save(config: string): void;");
    expect(golden).not.toContain("function set(config: string, name: string, value: any): void;");
  });
});

// The first Bucket-C library to sever: its markdown `no-go` retired the markdown
// front-end as a regeneration path but left the ts-defold dependency untouched,
// and the authored lane answers that second question. The fork is verbatim, so
// the generic regen-drift and fork-identity loops above already cover fidelity.
describe("persist.persist migration integrity", () => {
  test("persist is registered in authored-targets.json", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const persist = targets.find((t) => t.namespace === "persist");
    expect(persist).toBeDefined();
    expect(persist?.moduleId).toBe("persist.persist");
    expect(persist?.repo).toBe("https://github.com/whiteboxdev/library-defold-persist");
    expect(persist?.ref).toBe("b37f61040740f232d86f68e2606f27b6f1bd15c4");
    expect(persist?.license).toBe("Zlib");
  });

  test("persist.persist is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "persist.persist")).toBe(false);
  });

  test("the library-defold-persist dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "library-defold-persist")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, and dotted api-doc are deleted", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/persist.persist.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/persist.persist.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/persist.persist.json"))).toBe(false);
  });

  // The dts-check gate compiles whatever the include lists, so a golden left out
  // of it is silently never type-checked — the compile proof the retired
  // `test-d/library-types.test-d.ts` block used to provide would just be gone.
  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/persist.d.ts");
    expect(include).not.toContain("generated/persist.persist.d.ts");
  });
});

// The second Bucket-C severance, and the first whose publish namespace must stay
// dotted: the markdown lane's `no-go` proof already owns the bare `orthographic`
// namespace (`generated/orthographic.d.ts`, `api-doc/orthographic.json`) and is
// hidden from page enumeration, so forking under `orthographic` would collide
// with the proof artifacts and render no page. The dotted namespace overwrites
// the retired ts-defold golden in place instead, keeping route and import string
// byte-identical.
describe("orthographic.camera migration integrity", () => {
  test("orthographic is registered in authored-targets.json under its dotted namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const orthographic = targets.find((t) => t.namespace === "orthographic.camera");
    expect(orthographic).toBeDefined();
    expect(orthographic?.moduleId).toBe("orthographic.camera");
    expect(orthographic?.repo).toBe("https://github.com/britzl/defold-orthographic");
    expect(orthographic?.ref).toBe("3.6.3");
    expect(orthographic?.license).toBe("MIT");
    expect(orthographic?.authored).toBe("fixtures/authored/orthographic.camera.d.ts");
    expect(orthographic?.generated).toBe("generated/orthographic.camera.d.ts");
    expect(orthographic?.apiDoc).toBe("api-doc/orthographic.camera.json");
  });

  test("orthographic.camera is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "orthographic.camera")).toBe(false);
  });

  test("the defold-orthographic dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-orthographic")).toBe(false);
  });

  test("the retired ts-defold fixture and package subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/orthographic.camera.d.ts"))).toBe(
      false,
    );
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./orthographic.camera" in exports).toBe(false);
  });

  test("the dotted golden joins the dts-check include and the markdown proof stays inert", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/orthographic.camera.d.ts");
    expect(include).not.toContain("generated/orthographic.d.ts");
  });

  test("the golden widens follow to accept one target or an array of targets", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/orthographic.camera.d.ts"), "utf8");
    expect(golden).toContain("targets: Hash | Url | (Hash | Url)[],");
    expect(golden).not.toContain("target: Hash | Url,");
  });
});

// The third Bucket-C severance, and the second to take the bare namespace. The
// bare `yagames` is both free and required: nothing owns `generated/yagames.d.ts`
// or `api-doc/yagames.json` and yagames is not a markdown target, while the
// shared severed branch asserts a no-go module has no `generated/<moduleId>.d.ts`
// — the dotted overwrite-in-place shape orthographic used would fail it. The
// import string survives byte-identical (the alias comes from the namespace's
// trailing segment, the path from `moduleId`); only the route and the dropped
// export subpath move.
//
// Unlike persist and orthographic the fork does not stay verbatim: upstream
// 0.19.0 replaced the whole `banner_*` family with the sticky-banner API, so the
// golden assertions below gate a correction rather than a copy.
describe("yagames.yagames migration integrity", () => {
  test("yagames is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const yagames = targets.find((t) => t.namespace === "yagames");
    expect(yagames).toBeDefined();
    expect(yagames?.moduleId).toBe("yagames.yagames");
    expect(yagames?.repo).toBe("https://github.com/indiesoftby/defold-yagames");
    expect(yagames?.ref).toBe("0.19.0");
    expect(yagames?.license).toBe("MIT");
    expect(yagames?.authored).toBe("fixtures/authored/yagames.yagames.d.ts");
    expect(yagames?.generated).toBe("generated/yagames.d.ts");
    expect(yagames?.apiDoc).toBe("api-doc/yagames.json");
  });

  test("yagames.yagames is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "yagames.yagames")).toBe(false);
  });

  test("the defold-yagames dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-yagames")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/yagames.yagames.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/yagames.yagames.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/yagames.yagames.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./yagames.yagames" in exports).toBe(false);
  });

  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/yagames.d.ts");
    expect(include).toContain("test-d/yagames-usage.test-d.ts");
    expect(include).not.toContain("generated/yagames.yagames.d.ts");
  });

  test("the sticky-banner API replaced the banner_* family in the golden", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/yagames.d.ts"), "utf8");
    for (const fn of ["adv_show_banner_adv", "adv_hide_banner_adv", "adv_get_banner_adv_status"]) {
      expect(golden).toContain(`export function ${fn}(`);
    }
    for (const fn of [
      "banner_init",
      "banner_create",
      "banner_delete",
      "banner_refresh",
      "banner_set",
    ]) {
      expect(golden).not.toContain(fn);
    }
  });

  // `player_get_id` is deprecated upstream, not removed, so the correction is the
  // misspelling in the existing tag — asserting only that the text names the
  // replacement would pass with `unqiue` still sitting beside it.
  test("player_get_id survives with a correctly spelled deprecation", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/yagames.d.ts"), "utf8");
    expect(golden).toContain("export function player_get_id(): string;");
    expect(golden).toContain("Use `player_get_unique_id` instead.");
    expect(golden).not.toContain("unqiue");
  });

  // Removal needs positive evidence, and upstream supplies the opposite: at tag
  // 0.19.0 `M.leaderboards_init` still exists and prints its own deprecation
  // notice. The README simply stopped documenting it.
  test("leaderboards_init survives, marked deprecated as upstream marks it", () => {
    const golden = readFileSync(join(PACKAGE_ROOT, "generated/yagames.d.ts"), "utf8");
    expect(golden).toContain("export function leaderboards_init(");
    // Anchored on the declaration so the tag cannot drift onto a neighbour.
    expect(golden).toMatch(/@deprecated[\s\S]{0,200}?\*\/\s*export function leaderboards_init\(/);
  });

  // The shipped api-doc is what the docs-site loads, so the deprecation has to
  // survive lowering — not just sit in the `.d.ts` the site never reads.
  test("the committed api-doc carries both deprecations with their text", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/yagames.json"), "utf8")) as {
      elements: Array<{ name: string; deprecated?: string }>;
    };
    const named = (name: string) => doc.elements.find((e) => e.name === name);

    expect(named("player_get_id")?.deprecated).toBe("Use `player_get_unique_id` instead.");

    const leaderboards = named("leaderboards_init")?.deprecated ?? "";
    expect(leaderboards).toStartWith("The leaderboards subsystem no longer needs initializing");
    expect(leaderboards).toContain("functions work without it.");

    // An untagged neighbour must stay clean, so the key tracks the tag rather
    // than every element.
    expect(Object.hasOwn(named("player_get_unique_id") ?? {}, "deprecated")).toBe(false);
  });
});

// The fourth Bucket-C severance and the third to take the bare namespace. Two
// things make starly the library where the fork-the-golden rule bites: the
// ts-defold fixture and the golden are *not* byte-identical (the golden maps
// `hash` -> `Hash`, `vmath.vector3` -> `Vector3`, `vmath.matrix4` -> `Matrix4`
// across ~21 sites), so forking the raw snapshot would ship the unmapped
// spelling to every consumer; and the surface publishes through `const
// exportThis: CameraMap & Readonly<CoreModule>; export = exportThis;`, the only
// `export =` in the corpus, so its 21 members reach `extractApiDoc` through the
// handle rather than as top-level declarations.
//
// The fork is verbatim — starly has no recorded upstream divergences — so unlike
// yagames there are no correction assertions, only the mapped-spelling proof.
describe("starly.starly migration integrity", () => {
  test("starly is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const starly = targets.find((t) => t.namespace === "starly");
    expect(starly).toBeDefined();
    expect(starly?.moduleId).toBe("starly.starly");
    expect(starly?.repo).toBe("https://github.com/VowSoftware/starly");
    expect(starly?.ref).toBe("85d1b2af8bf0618e7f297da41d03eb55d27e49b6");
    expect(starly?.license).toBe("Zlib");
    expect(starly?.authored).toBe("fixtures/authored/starly.starly.d.ts");
    expect(starly?.generated).toBe("generated/starly.d.ts");
    expect(starly?.apiDoc).toBe("api-doc/starly.json");
  });

  test("starly.starly is no longer a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "starly.starly")).toBe(false);
  });

  test("the starly dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "starly")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/starly.starly.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/starly.starly.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/starly.starly.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./starly.starly" in exports).toBe(false);
  });

  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/starly.d.ts");
    expect(include).toContain("test-d/starly-usage.test-d.ts");
    expect(include).not.toContain("generated/starly.starly.d.ts");
  });

  // The lane-guidance rule in its one load-bearing instance: a fork copies the
  // *golden*, so the mapped spelling is what ships. Asserting only that the
  // mapped names appear would pass on the raw ts-defold snapshot too if it were
  // ever appended to, so the unmapped spellings are excluded as well.
  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const authored = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/starly.starly.d.ts"),
      "utf8",
    );
    expect(authored).toContain("c_behavior_center: Hash;");
    expect(authored).toContain("positions: Vector3[]");
    expect(authored).toContain("export = exportThis;");
    expect(authored).not.toContain(": hash;");
    expect(authored).not.toContain("vmath.vector3");
  });

  // `export =` is the reason this one is worth asserting: the 21 members live
  // behind the handle's alias and intersection, so a lowering that only reads
  // top-level declarations would emit an api-doc of two typedefs and nothing
  // else — and the page would render empty rather than fail.
  test("the api-doc carries all 21 members, so the `export =` surface survives lowering", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/starly.json"), "utf8")) as {
      elements: Array<{ name: string; type: string }>;
    };
    const named = (type: string) =>
      doc.elements
        .filter((e) => e.type === type)
        .map((e) => e.name)
        .sort();

    expect(named("VARIABLE")).toEqual([
      "c_behavior_center",
      "c_behavior_expand",
      "c_behavior_mixed",
      "c_behavior_stretch",
      "c_display_height",
      "c_display_ratio",
      "c_display_width",
    ]);
    expect(named("FUNCTION")).toEqual([
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
    ]);
  });
});

// The fifth Bucket-C severance and the first multi-module one: ten `in.<mod>`
// modules move at once, keeping `namespace === moduleId` so every `/api` route,
// export subpath and import string stays byte-identical and the goldens are
// overwritten in place rather than renamed. `in` is a reserved word, which is
// why a bare `in` namespace is not an option here the way `starly` was.
//
// Nine of the ten ts-defold fixtures differ from their goldens (`in.triggers` on
// 171 lines), so this is also the severance where forking the raw snapshot would
// have shipped `hash`/`url`/`vmath.vector3` to every consumer.
describe("defold-input migration integrity", () => {
  const MODULES = [
    "accelerometer",
    "button",
    "cursor",
    "gesture",
    "keyboard",
    "mapper",
    "onscreen",
    "state",
    "textbox",
    "triggers",
  ];

  test("all ten modules are registered in authored-targets.json under their dotted namespaces", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    for (const mod of MODULES) {
      const moduleId = `in.${mod}`;
      const target = targets.find((t) => t.moduleId === moduleId);
      expect(target).toBeDefined();
      expect(target?.namespace).toBe(moduleId);
      expect(target?.repo).toBe("https://github.com/britzl/defold-input");
      expect(target?.ref).toBe("4.7.1");
      expect(target?.license).toBe("MIT");
      expect(target?.authored).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(target?.generated).toBe(`generated/${moduleId}.d.ts`);
      expect(target?.apiDoc).toBe(`api-doc/${moduleId}.json`);
    }
  });

  test("none of the ten is a ts-defold library-targets row and the defold-input dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    for (const mod of MODULES) {
      expect(targets.some((t) => t.module === `in.${mod}`)).toBe(false);
    }
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-input")).toBe(false);
  });

  // `namespace === moduleId`, so unlike every prior severance nothing is renamed:
  // only the ts-defold snapshots die, and the goldens, api-docs and the subpaths
  // consumers import stay exactly where they were.
  test("the ts-defold fixtures are gone while the goldens, api-docs and subpaths are untouched", () => {
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    for (const mod of MODULES) {
      const moduleId = `in.${mod}`;
      expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`))).toBe(false);
      expect(existsSync(join(PACKAGE_ROOT, "generated", `${moduleId}.d.ts`))).toBe(true);
      expect(existsSync(join(PACKAGE_ROOT, "api-doc", `${moduleId}.json`))).toBe(true);
      expect(`./${moduleId}` in exports).toBe(true);
    }
  });

  // The lane-guidance rule on the largest surface it applies to: a fork copies the
  // *golden*, so the mapped spelling ships. Asserting the mapped names alone would
  // also pass on the raw ts-defold snapshot, so the unmapped ones are excluded too.
  test("the authored forks took the mapped goldens, not the ts-defold spelling", () => {
    const triggers = readFileSync(join(PACKAGE_ROOT, "fixtures/authored/in.triggers.d.ts"), "utf8");
    expect(triggers).toContain("KEY_SPACE: Hash;");
    expect(triggers).not.toContain(": hash;");

    const accelerometer = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/in.accelerometer.d.ts"),
      "utf8",
    );
    expect(accelerometer).toContain("Vector3");
    expect(accelerometer).not.toContain("vmath.vector3");
  });

  test("all ten goldens joined the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    for (const mod of MODULES) {
      expect(include).toContain(`generated/in.${mod}.d.ts`);
    }
    expect(include).toContain("test-d/defold-input-usage.test-d.ts");
  });
});

// The sixth Bucket-C severance and the second multi-module one: three
// `monarch.<mod>` modules move at once under their existing dotted namespaces, so
// every `/api` route, export subpath and import string stays byte-identical and
// the goldens are overwritten in place. Unlike `in`, monarch's classification dir
// and its top namespace segment are the same string, so the nav group survives on
// `libraryGroupKey` alone.
//
// Two of the three ts-defold fixtures differ from their goldens (`monarch.monarch`
// on `hash`/`url`, `transitions.gui` on `node`/`vmath.vector3`), so forking the
// raw snapshot would again have shipped unresolvable ambients.
describe("monarch migration integrity", () => {
  const MODULES = ["monarch", "transitions.easings", "transitions.gui"];

  test("all three modules are registered in authored-targets.json under their dotted namespaces", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    for (const mod of MODULES) {
      const moduleId = `monarch.${mod}`;
      const target = targets.find((t) => t.moduleId === moduleId);
      expect(target).toBeDefined();
      expect(target?.namespace).toBe(moduleId);
      expect(target?.repo).toBe("https://github.com/britzl/monarch");
      expect(target?.ref).toBe("6.0.2");
      expect(target?.license).toBe("MIT");
      expect(target?.authored).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(target?.generated).toBe(`generated/${moduleId}.d.ts`);
      expect(target?.apiDoc).toBe(`api-doc/${moduleId}.json`);
    }
  });

  // The surviving-row count is deliberately not re-asserted here: it is a global
  // figure every later severance moves, so it lives once, with the most recent
  // cutover (richtext's, below), rather than as a copy per library that each new
  // severance has to re-pin.
  test("none of the three is a ts-defold library-targets row and the monarch dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    for (const mod of MODULES) {
      expect(targets.some((t) => t.module === `monarch.${mod}`)).toBe(false);
    }
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "monarch")).toBe(false);
  });

  test("the ts-defold fixtures are gone while the goldens, api-docs and subpaths are untouched", () => {
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    for (const mod of MODULES) {
      const moduleId = `monarch.${mod}`;
      expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`))).toBe(false);
      expect(existsSync(join(PACKAGE_ROOT, "generated", `${moduleId}.d.ts`))).toBe(true);
      expect(existsSync(join(PACKAGE_ROOT, "api-doc", `${moduleId}.json`))).toBe(true);
      expect(`./${moduleId}` in exports).toBe(true);
    }
  });

  // Asserting the mapped names alone would also pass on the raw ts-defold
  // snapshot, so each check excludes the unmapped spelling too.
  test("the authored forks took the mapped goldens, not the ts-defold spelling", () => {
    const monarch = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/monarch.monarch.d.ts"),
      "utf8",
    );
    expect(monarch).toContain("DONE: Hash");
    expect(monarch).toContain("add_listener(url?: Url)");
    expect(monarch).not.toContain(": hash;");
    expect(monarch).not.toContain(": url,");

    const gui = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/monarch.transitions.gui.d.ts"),
      "utf8",
    );
    expect(gui).toContain('Opaque<"node">');
    expect(gui).toContain("Vector3");
    expect(gui).not.toContain("node: node");
    expect(gui).not.toContain("vmath.vector3");
  });

  // The goal was captured expecting an `on_focus_changed` -> `on_focus_change`
  // rename. Upstream contradicts it: `monarch/monarch.lua:1295` at tag 6.0.2
  // defines `M.on_focus_changed` and nothing else, so the fork stays verbatim and
  // the README heading is recorded as the defect instead.
  test("the fork is verbatim where the goal proposed changing it", () => {
    const monarch = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/monarch.monarch.d.ts"),
      "utf8",
    );
    expect(monarch).toContain("on_focus_changed");
    expect(monarch).not.toContain("on_focus_change(");
  });

  test("all three goldens joined the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    for (const mod of MODULES) {
      expect(include).toContain(`generated/monarch.${mod}.d.ts`);
    }
    expect(include).toContain("test-d/monarch-usage.test-d.ts");
  });
});

// The second three-module dotted severance, and the one that regroups: the
// classification dir is `defold-richtext` while the top namespace segment is
// `richtext`, so dropping the dir moves the nav group key the way defold-input's
// did rather than leaving it in place the way monarch's did.
//
// Two of the three ts-defold fixtures differ from their goldens (`richtext.color`
// on 22 `vmath.vector4` -> `Vector4` renames, `richtext.richtext` on `hash`,
// `node` and both vector tokens), so forking the raw snapshot would once more
// have shipped unresolvable ambients.
describe("richtext migration integrity", () => {
  const MODULES = ["color", "richtext", "tags"];

  test("all three modules are registered in authored-targets.json under their dotted namespaces", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    for (const mod of MODULES) {
      const moduleId = `richtext.${mod}`;
      const target = targets.find((t) => t.moduleId === moduleId);
      expect(target).toBeDefined();
      expect(target?.namespace).toBe(moduleId);
      expect(target?.repo).toBe("https://github.com/britzl/defold-richtext");
      expect(target?.ref).toBe("5.22.1");
      expect(target?.license).toBe("MIT");
      expect(target?.authored).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(target?.generated).toBe(`generated/${moduleId}.d.ts`);
      expect(target?.apiDoc).toBe(`api-doc/${moduleId}.json`);
    }
  });

  test("none of the three is a ts-defold library-targets row and the defold-richtext dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    for (const mod of MODULES) {
      expect(targets.some((t) => t.module === `richtext.${mod}`)).toBe(false);
    }
    // The global row count is pinned once, in the newest cutover's describe, so
    // it does not need an edit in every severance that came before.
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-richtext")).toBe(false);
  });

  test("the ts-defold fixtures are gone while the goldens, api-docs and subpaths are untouched", () => {
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    for (const mod of MODULES) {
      const moduleId = `richtext.${mod}`;
      expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`))).toBe(false);
      expect(existsSync(join(PACKAGE_ROOT, "generated", `${moduleId}.d.ts`))).toBe(true);
      expect(existsSync(join(PACKAGE_ROOT, "api-doc", `${moduleId}.json`))).toBe(true);
      expect(`./${moduleId}` in exports).toBe(true);
    }
  });

  // Asserting the mapped names alone would also pass on the raw ts-defold
  // snapshot, so each check excludes the unmapped spelling too.
  test("the authored forks took the mapped goldens, not the ts-defold spelling", () => {
    const color = readFileSync(join(PACKAGE_ROOT, "fixtures/authored/richtext.color.d.ts"), "utf8");
    expect(color).toContain("Vector4");
    expect(color).not.toContain("vmath.vector4");

    const richtext = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/richtext.richtext.d.ts"),
      "utf8",
    );
    expect(richtext).toContain('Opaque<"node">');
    expect(richtext).toContain("Vector3");
    expect(richtext).toContain("LuaMap<Hash, Hash>");
    expect(richtext).not.toContain("vmath.vector");
    expect(richtext).not.toContain(": hash;");
    expect(richtext).not.toContain("parent?: node;");
  });

  // The fork is verbatim, so the hand-written structure a flat markdown parse
  // collapses survives intact — the surface the recorded `surface-loss` verdict
  // is a judgment about.
  test("the fork keeps the constants and named types the markdown emit loses", () => {
    const richtext = readFileSync(
      join(PACKAGE_ROOT, "fixtures/authored/richtext.richtext.d.ts"),
      "utf8",
    );
    for (const constant of [
      "ALIGN_LEFT",
      "ALIGN_CENTER",
      "ALIGN_RIGHT",
      "ALIGN_JUSTIFY",
      "VALIGN_TOP",
      "VALIGN_MIDDLE",
      "VALIGN_BOTTOM",
    ]) {
      expect(richtext).toContain(`export const ${constant}:`);
    }
    for (const named of [
      "Alignment",
      "VAlignment",
      "Word",
      "Settings",
      "FontsTable",
      "TextMetrics",
    ]) {
      expect(richtext).toContain(`type ${named} =`);
    }
  });

  test("all three goldens joined the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    for (const mod of MODULES) {
      expect(include).toContain(`generated/richtext.${mod}.d.ts`);
    }
    expect(include).toContain("test-d/richtext-usage.test-d.ts");
  });
});

// The third dotted severance that regroups (`defold-metrics` -> `metrics`), and
// the first whose fork is a strict improvement on the surface rather than a lane
// move: both ts-defold fixtures are byte-identical to their goldens, so nothing
// was at stake in *which* copy was forked, but each module really exports three
// module-level members upstream that ts-defold never hand-wrote. The fork is
// where they land, so the assertions below read the vendored copy — a correction
// applied to `generated/` alone would survive here and die at the next regen.
describe("metrics migration integrity", () => {
  const MODULES = ["fps", "mem"];

  test("both modules are registered in authored-targets.json under their dotted namespaces", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    for (const mod of MODULES) {
      const moduleId = `metrics.${mod}`;
      const target = targets.find((t) => t.moduleId === moduleId);
      expect(target).toBeDefined();
      expect(target?.namespace).toBe(moduleId);
      expect(target?.repo).toBe("https://github.com/britzl/defold-metrics");
      expect(target?.ref).toBe("1.2.1");
      expect(target?.license).toBe("MIT");
      expect(target?.authored).toBe(`fixtures/authored/${moduleId}.d.ts`);
      expect(target?.generated).toBe(`generated/${moduleId}.d.ts`);
      expect(target?.apiDoc).toBe(`api-doc/${moduleId}.json`);
    }
  });

  test("neither is a ts-defold library-targets row and the defold-metrics dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    for (const mod of MODULES) {
      expect(targets.some((t) => t.module === `metrics.${mod}`)).toBe(false);
    }
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "defold-metrics")).toBe(false);
  });

  test("the ts-defold fixtures are gone while the goldens, api-docs and subpaths survive", () => {
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    for (const mod of MODULES) {
      const moduleId = `metrics.${mod}`;
      expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`))).toBe(false);
      expect(existsSync(join(PACKAGE_ROOT, "generated", `${moduleId}.d.ts`))).toBe(true);
      expect(existsSync(join(PACKAGE_ROOT, "api-doc", `${moduleId}.json`))).toBe(true);
      expect(`./${moduleId}` in exports).toBe(true);
    }
  });

  // `<mod>()` is the reading accessor and differs per module, so asserting it by
  // name is what separates a real per-module correction from one module's block
  // pasted into both.
  test("the correction landed on both forks and left the factory intact", () => {
    for (const mod of MODULES) {
      const fork = readFileSync(
        join(PACKAGE_ROOT, "fixtures/authored", `metrics.${mod}.d.ts`),
        "utf8",
      );
      expect(fork).toContain("export function update(): void;");
      expect(fork).toContain("export function draw(): void;");
      expect(fork).toContain(`export function ${mod}(): number;`);
      expect(fork).toContain("export interface Metrics {");
      expect(fork).toContain("): Metrics;");
    }
  });

  test("both goldens joined the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    for (const mod of MODULES) {
      expect(include).toContain(`generated/metrics.${mod}.d.ts`);
    }
    expect(include).toContain("test-d/metrics-usage.test-d.ts");
  });
});

// The ninth Bucket-C severance, on the starly bare-namespace template: the
// ts-defold fixture and the golden are *not* byte-identical (the golden maps
// `hash` -> `Hash`, `node` -> `Opaque<"node">` and `vmath.vector3` -> `Vector3`
// across the seven state interfaces), so the fork has to be taken from the
// golden or it ships the unmapped spelling.
//
// The correction is `group`'s arity. Upstream `gooey/gooey.lua:191` at tag
// 10.5.3 declares `function M.group(id, action_id, action, fn)`; ts-defold bound
// the two parameters its LDoc block lists instead, so the three-argument call
// every README example writes does not type-check. Unlike yagames the correction
// moves no recorded comparison term, so the fork's own content is what proves it
// landed — assert on the vendored fork, not only the emitted golden, because a
// correction applied to `generated/` alone is erased by the next regen.
describe("gooey.gooey migration integrity", () => {
  const OTHER_FUNCTIONS = [
    "button",
    "checkbox",
    "radio",
    "static_list",
    "dynamic_list",
    "horizontal_dynamic_list",
    "vertical_dynamic_list",
    "horizontal_static_list",
    "vertical_static_list",
    "vertical_scrollbar",
    "input",
  ];

  test("gooey is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const gooey = targets.find((t) => t.namespace === "gooey");
    expect(gooey).toBeDefined();
    expect(gooey?.moduleId).toBe("gooey.gooey");
    expect(gooey?.repo).toBe("https://github.com/britzl/gooey");
    expect(gooey?.ref).toBe("10.5.3");
    expect(gooey?.license).toBe("MIT");
    expect(gooey?.authored).toBe("fixtures/authored/gooey.gooey.d.ts");
    expect(gooey?.generated).toBe("generated/gooey.d.ts");
    expect(gooey?.apiDoc).toBe("api-doc/gooey.json");
  });

  test("gooey.gooey is no longer a ts-defold library-targets row and the gooey dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "gooey.gooey")).toBe(false);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "gooey")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/gooey.gooey.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/gooey.gooey.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/gooey.gooey.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./gooey.gooey" in exports).toBe(false);
  });

  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/gooey.d.ts");
    expect(include).toContain("test-d/gooey-usage.test-d.ts");
    expect(include).not.toContain("generated/gooey.gooey.d.ts");
  });

  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const authored = readFileSync(join(PACKAGE_ROOT, "fixtures/authored/gooey.gooey.d.ts"), "utf8");
    expect(authored).toContain('node: Opaque<"node">;');
    expect(authored).toContain("node_id: Hash;");
    expect(authored).toContain('LuaMap<Hash, Opaque<"node">>');
    expect(authored).toContain("scroll: Vector3;");
    expect(authored).not.toContain(": hash;");
    expect(authored).not.toContain("vmath.vector3");
  });

  test("the group correction landed on the vendored fork, leaving the other declarations intact", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, "fixtures/authored/gooey.gooey.d.ts"), "utf8");
    expect(fork).toMatch(
      /export function group\(\s*group_id: Hash \| string,\s*action_id: Hash,\s*action: table,\s*group_fn: \(\) => void,\s*\): table;/,
    );
    expect(fork).not.toContain("export function group(group_id: string, fn: () => void): table;");
    for (const fn of OTHER_FUNCTIONS) {
      expect(fork).toContain(`export function ${fn}(`);
    }
  });
});

// bzAnim severs under the bare namespace `bzAnim` and lands no correction. What
// makes it worth forking is the pair of hand-written options tables: both entry
// points take a single options table, which a flat signature table cannot
// express, so `AnimateArgs`/`AnimateSequenceArgs` are the only structured
// description of this library anywhere. `keep` would strand that surface in a
// lane no generation path can maintain.
describe("bzAnim.bzLibrary migration integrity", () => {
  const AUTHORED = "fixtures/authored/bzAnim.bzLibrary.d.ts";
  const FUNCTIONS = ["animate", "animateSequence", "cancel", "info", "isReady", "setDebugLevel"];

  test("bzAnim is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const bzAnim = targets.find((t) => t.namespace === "bzAnim");
    expect(bzAnim).toBeDefined();
    expect(bzAnim?.moduleId).toBe("bzAnim.bzLibrary");
    expect(bzAnim?.repo).toBe("https://github.com/jbp4444/bzAnim");
    expect(bzAnim?.ref).toBe("v.1.2");
    expect(bzAnim?.license).toBe("Apache-2.0");
    expect(bzAnim?.authored).toBe(AUTHORED);
    expect(bzAnim?.generated).toBe("generated/bzAnim.d.ts");
    expect(bzAnim?.apiDoc).toBe("api-doc/bzAnim.json");
  });

  test("bzAnim.bzLibrary is no longer a ts-defold library-targets row and the bzAnim dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "bzAnim.bzLibrary")).toBe(false);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "bzAnim")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    // The retired fixture is named for the *upstream filename*, not the module.
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/bzAnim.bzAnim.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/bzAnim.bzLibrary.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/bzAnim.bzLibrary.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./bzAnim.bzLibrary" in exports).toBe(false);
  });

  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/bzAnim.d.ts");
    expect(include).toContain("test-d/bzAnim-usage.test-d.ts");
    expect(include).not.toContain("generated/bzAnim.bzLibrary.d.ts");
  });

  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const authored = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(authored.match(/obj: Hash \| string \| undefined;/g)?.length).toBe(2);
    expect(authored).not.toContain("obj: hash");
  });

  test("the fork keeps the two options tables the severance exists to preserve", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(fork).toMatch(
      /type AnimateArgs = \{\s*obj: Hash \| string \| undefined;\s*easing: EASING_TYPES;\s*duration\?: number;\s*delay\?: number;\s*path\?: Array<Path>;\s*\};/,
    );
    expect(fork).toMatch(
      /type AnimateSequenceArgs = \{\s*obj: Hash \| string \| undefined;\s*easing: EASING_TYPES;\s*segments\?: Array<Segment>;\s*on_complete\?: boolean \| string;\s*\};/,
    );
    expect(fork).toMatch(/export type Path = \{\s*x: number;\s*y: number;\s*\};/);
    expect(fork).toMatch(
      /export type Segment = \{\s*duration: number;\s*delay: number;\s*path: Array<Path>;\s*\};/,
    );
    expect(fork).toContain("export const INFO_LEVEL = 1;");
    expect(fork).toContain("export const DEBUG_LEVEL = 2;");
    expect(fork).toContain("export const TRACE_LEVEL = 3;");
    for (const fn of FUNCTIONS) {
      expect(fork).toContain(`export function ${fn}(`);
    }
    // The easing union is a file-scope ambient global, declared before the module
    // block rather than inside it.
    expect(fork.indexOf("declare type EASING_TYPES")).toBeLessThan(
      fork.indexOf('declare module "bzAnim.bzLibrary"'),
    );
  });

  test("the api-doc publishes the options tables as member-bearing typedefs and omits the easing union", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/bzAnim.json"), "utf8")) as {
      info: { namespace: string };
      elements: { name: string; type: string; properties?: { name: string }[] }[];
    };
    expect(doc.info.namespace).toBe("bzAnim");
    for (const name of ["AnimateArgs", "AnimateSequenceArgs"]) {
      const typedef = doc.elements.find((e) => e.name === name);
      expect(typedef?.type).toBe("TYPEDEF");
      expect((typedef?.properties ?? []).map((p) => p.name)).toContain("easing");
    }
    // A string-literal union is neither member-bearing nor reachable as a
    // typedef, so the emitter publishes no element for it. Asserted so the gap
    // stays deliberate — widening the rule is a separate goal.
    expect(doc.elements.some((e) => e.name === "EASING_TYPES")).toBe(false);
  });
});

// platypus severs under the bare namespace `platypus` and lands no correction.
// The comparator that recorded its markdown `no-go` reads top-level
// `function`/`const` only, so it never scored the two interfaces that are the
// whole library: `PlatypusConfig` (a required nested `collisions` shape plus 11
// optional fields) and `PlatypusInstance extends PlatypusConfig` (19 methods plus
// `velocity`). No markdown, LuaLS or script_api lane can express a returned-object
// interface, so `keep` would freeze that structure in a lane nothing here
// maintains.
describe("platypus.platypus migration integrity", () => {
  const AUTHORED = "fixtures/authored/platypus.platypus.d.ts";
  const CONFIG_FIELDS = [
    "debug",
    "reparent",
    "gravity",
    "max_velocity",
    "wall_jump_power_ratio_x",
    "wall_jump_power_ratio_y",
    "allow_double_jump",
    "allow_wall_jump",
    "const_wall_jump",
    "allow_wall_slide",
    "wall_slide_velocity",
  ];
  const INSTANCE_METHODS = [
    "update",
    "on_message",
    "left",
    "right",
    "up",
    "down",
    "move",
    "jump",
    "force_jump",
    "abort_jump",
    "abort_wall_slide",
    "has_ground_contact",
    "has_wall_contact",
    "is_falling",
    "is_jumping",
    "is_wall_jumping",
    "is_wall_sliding",
    "toggle_debug",
    "set_collisions",
  ];
  const MESSAGE_HASHES = [
    "FALLING",
    "GROUND_CONTACT",
    "WALL_CONTACT",
    "JUMP",
    "WALL_JUMP",
    "DOUBLE_JUMP",
    "WALL_SLIDE",
  ];
  const DIRECTIONS = ["DIR_UP", "DIR_LEFT", "DIR_RIGHT", "DIR_DOWN", "DIR_ALL"];

  test("platypus is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const platypus = targets.find((t) => t.namespace === "platypus");
    expect(platypus).toBeDefined();
    expect(platypus?.moduleId).toBe("platypus.platypus");
    expect(platypus?.repo).toBe("https://github.com/britzl/platypus");
    expect(platypus?.ref).toBe("4.3.1");
    expect(platypus?.license).toBe("MIT");
    expect(platypus?.authored).toBe(AUTHORED);
    expect(platypus?.generated).toBe("generated/platypus.d.ts");
    expect(platypus?.apiDoc).toBe("api-doc/platypus.json");
  });

  test("platypus.platypus is no longer a ts-defold library-targets row and the platypus dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "platypus.platypus")).toBe(false);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "platypus")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/platypus.platypus.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/platypus.platypus.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/platypus.platypus.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./platypus.platypus" in exports).toBe(false);
  });

  test("the bare-namespace golden replaced the retired compile proof in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/platypus.d.ts");
    expect(include).toContain("test-d/platypus-usage.test-d.ts");
    expect(include).not.toContain("generated/platypus.platypus.d.ts");
  });

  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(fork).toContain("LuaMap<Hash, Direction>");
    expect(fork).toContain("velocity: Vector3;");
    expect(fork).toContain("move(velocity: Vector3): void;");
    expect(fork).toContain("offset?: Vector3;");
    expect(fork).toContain("on_message(message_id: Hash, message: AnyNotNil): void;");
    expect(fork.match(/export const \w+: Hash;/g)?.length).toBe(MESSAGE_HASHES.length);
    expect(fork).not.toContain(": hash");
    expect(fork).not.toContain("vmath.vector3");
  });

  test("the fork keeps the config and instance interfaces the severance exists to preserve", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    // The required nested shape: four numeric bounds plus the group map, and the
    // one optional inside it.
    expect(fork).toMatch(
      /\bcollisions: \{\s*groups: LuaMap<Hash, Direction>;\s*left: number;\s*right: number;\s*top: number;\s*bottom: number;\s*offset\?: Vector3;\s*\};/,
    );
    for (const field of CONFIG_FIELDS) {
      expect(fork).toMatch(new RegExp(`\\b${field}\\?: (?:boolean|number);`));
    }
    expect(fork).toContain("interface PlatypusInstance extends PlatypusConfig {");
    for (const method of INSTANCE_METHODS) {
      expect(fork).toMatch(new RegExp(`\\b${method}\\(`));
    }
    expect(fork).toContain("export function create(config: PlatypusConfig): PlatypusInstance;");
    for (const constant of MESSAGE_HASHES) {
      expect(fork).toContain(`export const ${constant}: Hash;`);
    }
    for (const constant of DIRECTIONS) {
      expect(fork).toContain(`export const ${constant}: Direction;`);
    }
  });

  test("the api-doc publishes the config and instance shapes as member-bearing typedefs", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/platypus.json"), "utf8")) as {
      info: { namespace: string; description?: string };
      elements: {
        name: string;
        type: string;
        properties?: { name: string; fields?: { name: string }[] }[];
      }[];
    };
    expect(doc.info.namespace).toBe("platypus");
    // The page intro comes from the fork's own module JSDoc, which is why this
    // severance owes no `library-description-overrides.json` key.
    expect((doc.info.description ?? "").length).toBeGreaterThan(0);

    const config = doc.elements.find((e) => e.name === "PlatypusConfig");
    expect(config?.type).toBe("TYPEDEF");
    const collisions = (config?.properties ?? []).find((p) => p.name === "collisions");
    expect(collisions).toBeDefined();
    expect((collisions?.fields ?? []).map((f) => f.name)).toContain("groups");

    const instance = doc.elements.find((e) => e.name === "PlatypusInstance");
    expect(instance?.type).toBe("TYPEDEF");
    expect((instance?.properties ?? []).map((p) => p.name)).toContain("velocity");
  });
});

// dicebag is the first severance whose recorded markdown verdict is
// `type-downgrade` — the two surfaces match one-for-one on names, and the no-go
// rests entirely on three types the README underspecifies. So the fork exists to
// keep exactly those three, and the assertions below name them rather than a
// structural shape no lane can express (platypus's case).
describe("dicebag.dicebag migration integrity", () => {
  const AUTHORED = "fixtures/authored/dicebag.dicebag.d.ts";
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
  // The six functions whose `id` parameter carries the core-type rename the
  // mapped golden applied.
  const ID_BEARING = [
    "bag_create",
    "bag_draw",
    "bag_reset",
    "table_create",
    "table_roll",
    "table_reset",
  ];

  test("dicebag is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const dicebag = targets.find((t) => t.namespace === "dicebag");
    expect(dicebag).toBeDefined();
    expect(dicebag?.moduleId).toBe("dicebag.dicebag");
    expect(dicebag?.repo).toBe("https://github.com/8bitskull/dicebag");
    expect(dicebag?.ref).toBe("0.3");
    expect(dicebag?.license).toBe("CC0-1.0");
    expect(dicebag?.authored).toBe(AUTHORED);
    expect(dicebag?.generated).toBe("generated/dicebag.d.ts");
    expect(dicebag?.apiDoc).toBe("api-doc/dicebag.json");
  });

  test("dicebag.dicebag is no longer a ts-defold library-targets row and the dicebag dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "dicebag.dicebag")).toBe(false);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "dicebag")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/dicebag.dicebag.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/dicebag.dicebag.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/dicebag.dicebag.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./dicebag.dicebag" in exports).toBe(false);
  });

  test("the bare-namespace golden and its compile proof are in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/dicebag.d.ts");
    expect(include).toContain("test-d/dicebag-usage.test-d.ts");
    expect(include).not.toContain("generated/dicebag.dicebag.d.ts");
  });

  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    for (const fn of ID_BEARING) {
      expect(fork).toMatch(new RegExp(`function ${fn}\\(id: string \\| number \\| Hash\\b`));
    }
    expect(fork).not.toContain("| hash");
  });

  test("the fork keeps the three types the recorded downgrades are about", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(fork).toContain("sides: Array<[number, number]>");
    expect(fork).toContain("rollable_table: Array<[number, any, boolean?]>");
    expect(fork).toContain("function set_up_rng(seed?: number): number;");
    for (const fn of FUNCTIONS) {
      expect(fork).toMatch(new RegExp(`export function ${fn}\\(`));
    }
  });

  test("the api-doc publishes the 11 functions under the bare namespace with its own description", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/dicebag.json"), "utf8")) as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("dicebag");
    // The page intro comes from the fork's own module JSDoc, which is why this
    // severance owes no `library-description-overrides.json` key.
    expect((doc.info.description ?? "").length).toBeGreaterThan(0);
    const functions = doc.elements.filter((e) => e.type === "FUNCTION").map((e) => e.name);
    expect([...functions].sort()).toEqual(FUNCTIONS);
  });
});

// rendy's recorded markdown verdict is `signature-loss`: the README documents 11
// members but carries no `**PARAMETERS**` or `**RETURN**` block anywhere, so a
// markdown emit would render every one of them as a zero-arity `(): void` stub.
// The fork therefore exists to keep the parameter lists themselves, and the
// assertions below name the five signatures that emit would have erased rather
// than a type the README merely underspecified (dicebag's case).
describe("rendy.rendy migration integrity", () => {
  const AUTHORED = "fixtures/authored/rendy.rendy.d.ts";
  const FUNCTIONS = [
    "animate",
    "cancel_animations",
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

  test("rendy is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const rendy = targets.find((t) => t.namespace === "rendy");
    expect(rendy).toBeDefined();
    expect(rendy?.moduleId).toBe("rendy.rendy");
    expect(rendy?.repo).toBe("https://github.com/whiteboxdev/library-defold-rendy");
    expect(rendy?.ref).toBe("b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3");
    expect(rendy?.license).toBe("Zlib");
    expect(rendy?.authored).toBe(AUTHORED);
    expect(rendy?.generated).toBe("generated/rendy.d.ts");
    expect(rendy?.apiDoc).toBe("api-doc/rendy.json");
  });

  test("rendy.rendy is no longer a ts-defold library-targets row and the dir is gone", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "rendy.rendy")).toBe(false);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "library-defold-rendy")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/rendy.rendy.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/rendy.rendy.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/rendy.rendy.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./rendy.rendy" in exports).toBe(false);
  });

  test("the bare-namespace golden and its compile proof are in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/rendy.d.ts");
    expect(include).toContain("test-d/rendy-usage.test-d.ts");
    expect(include).not.toContain("generated/rendy.rendy.d.ts");
  });

  test("the authored fork took the mapped golden, not the ts-defold spelling", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(fork).toContain("type CameraId = Hash | string;");
    expect(fork).toContain("function get_display_size(): Vector3;");
    expect(fork).toContain("complete_function?: (this: any, url: Url, property: Hash) => void,");
    expect(fork).not.toContain("| hash");
    expect(fork).not.toContain("vmath.vector3");
    expect(fork).not.toContain("vmath.quaternion");
    expect(fork).not.toContain("vmath.vector4");
  });

  test("the fork keeps the five signatures a zero-arity markdown emit would have discarded", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    expect(fork).toContain("function get_stack(screen_x: number, screen_y: number): CameraId[];");
    expect(fork).toMatch(
      /function screen_to_world\(\s*camera_id: CameraId,\s*screen_position: Vector3,\s*\): Vector3;/,
    );
    expect(fork).toMatch(
      /function world_to_screen\(\s*camera_id: CameraId,\s*world_position: Vector3,\s*\): Vector3;/,
    );
    expect(fork).toMatch(
      /function shake\(\s*camera_id: CameraId,\s*radius: number,\s*intensity: number,\s*duration: number,\s*scaler\?: number,\s*\): void;/,
    );
    // rendy is the corpus's only module written with zero `export` keywords —
    // inside an ambient `declare module` every declaration is exported anyway.
    for (const fn of FUNCTIONS) {
      expect(fork).toMatch(new RegExp(`\\n\\tfunction ${fn}\\(`));
    }
    expect(fork).not.toContain("export function");
  });

  test("the api-doc publishes the 13 functions and the CameraId typedef with its own description", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/rendy.json"), "utf8")) as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("rendy");
    // The page intro comes from the fork's own module JSDoc, which is why this
    // severance owes no `library-description-overrides.json` key.
    expect((doc.info.description ?? "").length).toBeGreaterThan(0);
    const functions = doc.elements.filter((e) => e.type === "FUNCTION").map((e) => e.name);
    expect([...functions].sort()).toEqual(FUNCTIONS);
    expect(doc.elements.find((e) => e.name === "CameraId")?.type).toBe("TYPEDEF");
  });
});

// nakama.nakama's verdict comes from the openapi lane, not markdown: the REST
// swagger plus realtime proto carry no source for the Lua client's hand-written
// helpers and socket-lifecycle wrappers, so the recorded decision is `no-go` and
// the fork exists to keep exactly those members. The fork is a verbatim copy —
// the ts-defold codemod found nothing to rename in this binding — so the
// assertions below name the members the verdict counts as missing rather than a
// spelling the codemod moved.
describe("nakama.nakama migration integrity", () => {
  const AUTHORED = "fixtures/authored/nakama.nakama.d.ts";
  // Every member `compareFidelityToTsDefold` reports missing from the openapi
  // emit, measured at the severance. `openapi-fidelity-gate.test.ts` re-derives
  // the set from the real emitter; this list is what the fork must still carry
  // for that verdict to keep describing it.
  const VERDICT_MEMBERS = [
    "create_api_update_group_request",
    "create_client",
    "create_socket",
    "on_channelmessage",
    "on_channelpresence",
    "on_disconnect",
    "on_matchdata",
    "on_matchmakermatched",
    "on_matchpresence",
    "on_notification",
    "on_statuspresence",
    "on_streamdata",
    "on_streampresence",
    "set_bearer_token",
    "socket_connect",
    "socket_send",
    "sync",
  ];

  test("nakama is registered in authored-targets.json under its bare namespace", () => {
    const targets = readAuthoredTargets(PACKAGE_ROOT);
    const nakama = targets.find((t) => t.namespace === "nakama");
    expect(nakama).toBeDefined();
    expect(nakama?.moduleId).toBe("nakama.nakama");
    // The same repo/ref/license triple both sibling helpers already carry: the
    // upstream Lua library the types bind, not the ts-defold binding's own MIT.
    expect(nakama?.repo).toBe("https://github.com/heroiclabs/nakama-defold");
    expect(nakama?.ref).toBe("v3.4.0");
    expect(nakama?.license).toBe("Apache-2.0");
    expect(nakama?.authored).toBe(AUTHORED);
    expect(nakama?.generated).toBe("generated/nakama.d.ts");
    expect(nakama?.apiDoc).toBe("api-doc/nakama.json");
    for (const sibling of ["nakama.engine.defold", "nakama.util.log"]) {
      const helper = targets.find((t) => t.moduleId === sibling);
      expect(helper?.repo).toBe(nakama?.repo);
      expect(helper?.ref).toBe(nakama?.ref);
      expect(helper?.license).toBe(nakama?.license);
    }
  });

  test("nakama.nakama is the last ts-defold row to go, leaving 0 rows and no dir", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "nakama.nakama")).toBe(false);
    // The count catches a cutover that took a second row with it; the absence
    // check above cannot. This is the last cutover the pin will ever move to.
    expect(targets.length).toBe(0);
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(dirs.some((c) => c.dir === "nakama-defold")).toBe(false);
  });

  test("the retired ts-defold fixture, dotted golden, dotted api-doc and subpath are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/nakama.nakama.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/nakama.nakama.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/nakama.nakama.json"))).toBe(false);
    const { exports } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./nakama.nakama" in exports).toBe(false);
  });

  test("the bare-namespace golden and its compile proof are in the dts-check include", () => {
    const { include } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8"),
    ) as { include: string[] };
    expect(include).toContain("generated/nakama.d.ts");
    expect(include).toContain("test-d/nakama-usage.test-d.ts");
    expect(include).not.toContain("generated/nakama.nakama.d.ts");
    // nakama was the last block the shared compile proof held.
    expect(existsSync(join(PACKAGE_ROOT, "test-d/library-types.test-d.ts"))).toBe(false);
  });

  test("the fork keeps every member the recorded openapi no-go counts as missing", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    for (const member of VERDICT_MEMBERS) {
      expect(fork).toMatch(new RegExp(`\\bfunction ${member}\\(`));
    }
    expect(fork).toContain("export function create_client(config: ClientConfig): Client;");
    expect(fork).toContain("export function set_bearer_token(client: Client, token: SessionToken)");
    expect(fork).toContain("export function sync(fn: () => void): void;");
  });

  test("the fork declares the client brands and the config and session shapes", () => {
    const fork = readFileSync(join(PACKAGE_ROOT, AUTHORED), "utf8");
    // The `symbol` brands are what make `set_bearer_token` reject a bare string;
    // widening either to `unknown` would keep every signature above compiling.
    expect(fork).toContain("export type Client = symbol;");
    expect(fork).toContain("type SessionToken = symbol;");
    const config = fork.match(/export interface ClientConfig \{([^}]*)\}/)?.[1] ?? "";
    expect(
      config
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ).toEqual([
      "host: string;",
      "port: number;",
      "use_ssl?: boolean;",
      "username: string;",
      "password: string;",
      "engine: unknown;",
    ]);
    const session = fork.match(/interface Session \{([^}]*)\}/)?.[1] ?? "";
    expect(session).toContain("token: SessionToken;");
    expect(session).toContain("refresh_token: SessionToken;");
    expect(session).toContain("created: boolean;");
  });

  test("the api-doc publishes all 170 elements under the bare namespace with the override description", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/nakama.json"), "utf8")) as {
      info: { namespace: string; description?: string };
      elements: { name: string; type: string }[];
    };
    expect(doc.info.namespace).toBe("nakama");
    expect(doc.elements).toHaveLength(170);
    for (const member of VERDICT_MEMBERS) {
      expect(doc.elements.some((e) => e.name === member)).toBe(true);
    }
    // Unlike rendy and dicebag the module JSDoc is `@see` + `@noResolution`
    // only, so the page intro has to come from the description override the
    // dropped `nakama-defold` dir no longer supplies.
    const overrides = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-description-overrides.json"), "utf8"),
    ) as Record<string, string>;
    expect(overrides.nakama?.length).toBeGreaterThan(0);
  });
});
