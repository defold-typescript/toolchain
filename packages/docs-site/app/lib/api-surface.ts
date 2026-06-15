import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ApiModule, parseDefoldApiDoc } from "@defold-typescript/types";

export interface ApiPage {
  namespace: string;
  route: string;
  brief: string;
  module: ApiModule;
}

interface ApiTarget {
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string }[];
}

export function loadApiSurface(typesDir: string): ApiPage[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };

  const target = targets.find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }

  return target.modules
    .map((mod): ApiPage => {
      const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
      const module = parseDefoldApiDoc(raw);
      return {
        namespace: mod.namespace,
        route: `/api/${mod.namespace}`,
        brief: module.brief,
        module,
      };
    })
    .sort((a, b) => a.namespace.localeCompare(b.namespace));
}
