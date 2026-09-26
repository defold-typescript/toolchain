import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import type { TranslationStore } from "@defold-typescript/types";
import { transpile } from "./transpile";

const TYPES_ROOT = path.dirname(
  createRequire(import.meta.url).resolve("@defold-typescript/types/package.json"),
);

const translations = JSON.parse(
  readFileSync(path.join(TYPES_ROOT, "examples/translations.json"), "utf8"),
) as TranslationStore;

describe("newtry multi-return forwarding", () => {
  for (const fqn of ["socket.newtry", "socket.protect"]) {
    test(`${fqn} examples forward each multi-return value as its own argument`, () => {
      const entries = translations[fqn] ?? [];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        const result = transpile(`${entry.ts}\nexport {};\n`);
        expect(result.diagnostics).toEqual([]);
        expect(result.lua).toMatchSnapshot();
      }
    });
  }
});
