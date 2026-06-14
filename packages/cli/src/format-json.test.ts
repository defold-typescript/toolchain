import { describe, expect, test } from "bun:test";
import { formatJsonLikeBiome } from "./format-json";
import { BIOME_JSON_CONTENT } from "./init";

function biomeFormat(value: unknown): string {
  const proc = Bun.spawnSync(["bunx", "biome", "format", "--stdin-file-path=x.json"], {
    stdin: Buffer.from(JSON.stringify(value)),
  });
  if (proc.exitCode !== 0) {
    throw new Error(`biome format failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}

describe("formatJsonLikeBiome", () => {
  test("short array collapses inline", () => {
    expect(formatJsonLikeBiome({ lib: ["ES2022"] })).toBe('{ "lib": ["ES2022"] }');
  });

  test("short nested object collapses inline", () => {
    expect(formatJsonLikeBiome({ a: { k: "v" } })).toBe('{ "a": { "k": "v" } }');
  });

  test("empty object and array stay collapsed", () => {
    expect(formatJsonLikeBiome({})).toBe("{}");
    expect(formatJsonLikeBiome([])).toBe("[]");
    expect(formatJsonLikeBiome({ a: {}, b: [] })).toBe('{ "a": {}, "b": [] }');
  });

  test("overflowing object breaks while inner single-entry arrays stay inline", () => {
    const value = {
      compilerOptions: {
        paths: {
          "@defold-typescript/types": ["../../../packages/types/src/index.ts"],
          "@game/shared": ["./src/shared/index.ts"],
          "@game/entities": ["./src/entities/index.ts"],
        },
      },
    };
    expect(formatJsonLikeBiome(value)).toBe(
      [
        "{",
        '  "compilerOptions": {',
        '    "paths": {',
        '      "@defold-typescript/types": ["../../../packages/types/src/index.ts"],',
        '      "@game/shared": ["./src/shared/index.ts"],',
        '      "@game/entities": ["./src/entities/index.ts"]',
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  test("overflowing array breaks one element per line", () => {
    const value = {
      arr: [
        "aaaaaaaaaa",
        "bbbbbbbbbb",
        "cccccccccc",
        "dddddddddd",
        "eeeeeeeeee",
        "ffffffffff",
        "gggggggggg",
      ],
    };
    expect(formatJsonLikeBiome(value)).toBe(
      [
        "{",
        '  "arr": [',
        '    "aaaaaaaaaa",',
        '    "bbbbbbbbbb",',
        '    "cccccccccc",',
        '    "dddddddddd",',
        '    "eeeeeeeeee",',
        '    "ffffffffff",',
        '    "gggggggggg"',
        "  ]",
        "}",
      ].join("\n"),
    );
  });

  test("lineWidth is honored", () => {
    const value = { tags: ["alpha", "beta", "gamma"] };
    expect(formatJsonLikeBiome(value)).toBe('{ "tags": ["alpha", "beta", "gamma"] }');
    expect(formatJsonLikeBiome(value, { lineWidth: 20 })).toBe(
      ["{", '  "tags": [', '    "alpha",', '    "beta",', '    "gamma"', "  ]", "}"].join("\n"),
    );
  });

  test("scalars and escaping match JSON.stringify", () => {
    const value = { s: 'a\nb\t"q" é 😀', n: -1.5, b: true, z: null, big: 1e10 };
    const out = formatJsonLikeBiome(value);
    expect(out).toBe(
      '{ "s": "a\\nb\\t\\"q\\" é 😀", "n": -1.5, "b": true, "z": null, "big": 10000000000 }',
    );
  });

  describe("biome-consistency guard", () => {
    const fixtures: Record<string, unknown> = {
      tsconfig: {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          lib: ["ES2022"],
          strict: true,
          paths: {
            "@defold-typescript/types": ["../../../packages/types/src/index.ts"],
            "@defold-typescript/types/script": [
              "../../../packages/types/generated/kinds/script.d.ts",
            ],
          },
        },
        include: ["src/**/*.ts", "src/**/*.d.ts"],
      },
      packageJson: {
        name: "demo",
        version: "0.0.0",
        devDependencies: {
          "@defold-typescript/cli": "0.5.0",
          "@defold-typescript/types": "0.5.0",
          "@biomejs/biome": "2.4.16",
        },
      },
      biomeJson: BIOME_JSON_CONTENT,
    };

    for (const [name, value] of Object.entries(fixtures)) {
      test(`matches Biome for ${name}`, () => {
        expect(`${formatJsonLikeBiome(value)}\n`).toBe(biomeFormat(value));
      });
    }
  });
});
