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

  test("the nakama-defold dir drops both helpers but retains nakama.nakama", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string; modules: string[] }[] };
    const nakama = dirs.find((c) => c.dir === "nakama-defold");
    expect(nakama).toBeDefined();
    expect(nakama?.modules).toContain("nakama.nakama");
    expect(nakama?.modules).not.toContain("nakama.engine.defold");
    expect(nakama?.modules).not.toContain("nakama.util.log");
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
