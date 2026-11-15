import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readEffectiveTsconfig } from "./tsconfig-effective";

// biome-ignore lint/suspicious/noTemplateCurlyInString: TypeScript's own config placeholder, written literally
const CONFIG_DIR = "${configDir}";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-tsconfig-effective-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function write(rel: string, value: unknown): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function readFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function effective() {
  return readEffectiveTsconfig(path.join(cwd, "tsconfig.json"), readFile);
}

describe("readEffectiveTsconfig", () => {
  test("include and exclude inherited from a base in another folder come back relative to the config", () => {
    write("configs/base.json", { include: ["../game/**/*.ts"], exclude: ["../game/wip"] });
    write("tsconfig.json", { extends: "./configs/base.json" });
    const config = effective();
    expect(config.include).toEqual(["game/**/*.ts"]);
    expect(config.exclude).toEqual(["game/wip"]);
    expect(config.includeRelative).toEqual(["game/**/*.ts"]);
    expect(config.excludeRelative).toEqual(["game/wip"]);
  });

  test("a UNC entry keeps its //server/share root", () => {
    write("tsconfig.json", { include: ["//server/share/game/../src/**/*.ts", "./src/**/*.ts"] });
    const config = effective();
    expect(config.include).toEqual(["//server/share/src/**/*.ts", "src/**/*.ts"]);
    expect(config.includeRelative).toEqual(["//server/share/src/**/*.ts", "src/**/*.ts"]);
  });

  test("a drive-letter entry keeps its drive", () => {
    write("tsconfig.json", { include: ["C:\\game\\.\\src\\**\\*.ts"] });
    const config = effective();
    expect(config.include).toEqual(["C:/game/src/**/*.ts"]);
    expect(config.includeRelative).toEqual(["C:/game/src/**/*.ts"]);
  });

  test(`a ${CONFIG_DIR} entry stays as written in include and comes back project-relative in includeRelative`, () => {
    write("tsconfig.json", { include: [`${CONFIG_DIR}/src/**/*.ts`], exclude: [`${CONFIG_DIR}`] });
    const own = effective();
    expect(own.include).toEqual([`${CONFIG_DIR}/src/**/*.ts`]);
    expect(own.includeRelative).toEqual(["src/**/*.ts"]);
    expect(own.exclude).toEqual([`${CONFIG_DIR}`]);
    expect(own.excludeRelative).toEqual(["."]);

    write("configs/base.json", { include: [`${CONFIG_DIR}/src/**/*.ts`] });
    write("tsconfig.json", { extends: "./configs/base.json" });
    const inherited = effective();
    expect(inherited.include).toEqual([`${CONFIG_DIR}/src/**/*.ts`]);
    expect(inherited.includeRelative).toEqual(["src/**/*.ts"]);
  });

  test("outDir inherited through extends comes back relative to the config, and the config's own outDir wins", () => {
    write("configs/base.json", { compilerOptions: { outDir: "../out\\lua" } });
    write("tsconfig.json", { extends: "./configs/base.json" });
    expect(effective().outDir).toBe("out/lua");

    write("tsconfig.json", {
      extends: "./configs/base.json",
      compilerOptions: { outDir: "build" },
    });
    expect(effective().outDir).toBe("build");

    write("tsconfig.json", { compilerOptions: { outDir: `${CONFIG_DIR}/gen` } });
    expect(effective().outDir).toBe("gen");
  });

  test('a syntax error and a missing base fail, and "no inputs" does not', () => {
    write("tsconfig.json", '{ "include": [ }');
    expect(() => effective()).toThrow();

    write("tsconfig.json", { extends: "./missing.json" });
    expect(() => effective()).toThrow("missing.json");

    write("tsconfig.json", '// commented\n{ "include": ["nothing/**/*.ts"], }\n');
    expect(effective().includeRelative).toEqual(["nothing/**/*.ts"]);
  });
});
