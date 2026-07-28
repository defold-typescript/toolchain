import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { OpenApiDoc } from "./parse-openapi-api";
import {
  buildOpenApiFidelity,
  computeOpenApiFidelity,
  emitOpenApiDeclaration,
  type OpenApiTarget,
  readOpenApiTargets,
  retargetDoc,
} from "./sync-openapi-types";
import type { TypeResolver } from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function nakamaTarget(): OpenApiTarget {
  const target = readOpenApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === "nakama.nakama");
  if (target === undefined) throw new Error("nakama.nakama openapi target missing");
  return target;
}

describe("readOpenApiTargets", () => {
  test("parses the committed nakama entry into a typed target", () => {
    const target = nakamaTarget();
    expect(target.namespace).toBe("nakama");
    expect(target.swagger).toBe("apigrpc/apigrpc.swagger.json");
    expect(target.proto).toContain("realtime.proto");
    expect(target.decision).toBe("no-go");
  });

  test("loud-fails naming the missing field and the offending moduleId", () => {
    const bad = JSON.stringify({
      targets: [{ moduleId: "x.y", repo: "r", ref: "1", swagger: "s.json" }],
    });
    // A hand-rolled reader over a bad blob is exercised via the exported parser on
    // an in-memory config: the proto field is absent, so it must throw naming both.
    expect(() => readOpenApiTargets(PACKAGE_ROOT, bad)).toThrow(/proto/);
    expect(() => readOpenApiTargets(PACKAGE_ROOT, bad)).toThrow(/x\.y/);
  });
});

describe("emitOpenApiDeclaration routes the retargeted doc through the shared emitter", () => {
  test("produces an importable `declare module 'nakama.nakama'` body", async () => {
    const dts = await emitOpenApiDeclaration(PACKAGE_ROOT, nakamaTarget());
    expect(dts).toContain("declare module 'nakama.nakama'");
    // The swagger RPC and the proto realtime constructor both reach the surface.
    expect(dts).toContain("authenticate_custom");
    expect(dts).toContain("create_channel_message_send_message");
  });
});

describe("retargetDoc prepends the publish namespace to the bare element names", () => {
  test("bare `authenticate_custom` becomes `nakama.authenticate_custom`", () => {
    const doc: OpenApiDoc = {
      info: { namespace: "", brief: "", description: "" },
      elements: [
        {
          type: "FUNCTION",
          name: "authenticate_custom",
          description: "",
          parameters: [],
          returnvalues: [],
        },
      ],
    };
    const retargeted = retargetDoc(doc, "nakama");
    expect(retargeted.info.namespace).toBe("nakama");
    expect(retargeted.elements[0]?.name).toBe("nakama.authenticate_custom");
  });
});

describe("computeOpenApiFidelity loud-fails on an unmappable token", () => {
  const alwaysUnresolved: TypeResolver = { resolves: () => false };
  test("throws naming the offending token rather than emitting a silent unknown", () => {
    const doc: OpenApiDoc = {
      info: { namespace: "nakama", brief: "", description: "" },
      elements: [
        {
          type: "FUNCTION",
          name: "nakama.f",
          description: "d",
          parameters: [{ name: "p", doc: "", types: ["wildcard_token"] }],
          returnvalues: [],
        },
      ],
    };
    expect(() => computeOpenApiFidelity("nakama", doc, alwaysUnresolved)).toThrow(/wildcard_token/);
  });
});

describe("buildOpenApiFidelity on the committed nakama source", () => {
  test("returns a FidelityReport whose tokens all resolve (no unmappable token)", async () => {
    const report = await buildOpenApiFidelity(PACKAGE_ROOT, nakamaTarget());
    expect(report.namespace).toBe("nakama");
    expect(report.totalMembers).toBeGreaterThan(100);
    // Every token the parser emits is in the resolver's vocabulary, so the build
    // does not throw and coverage is complete.
    expect(report.unknownTokens).toEqual([]);
    expect(report.coverage).toBe(1);
  });
});
