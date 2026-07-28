import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type MarkdownDoc, type MarkdownElement, parseMarkdownApi } from "./parse-markdown-api";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const FIXTURE = readFileSync(
  join(PACKAGE_ROOT, "fixtures/markdown/orthographic.camera.md"),
  "utf8",
);

function element(doc: MarkdownDoc, name: string): MarkdownElement | undefined {
  return doc.elements.find((e) => e.name === name);
}

describe("parseMarkdownApi on the committed orthographic README", () => {
  const doc = parseMarkdownApi(FIXTURE);

  test("info.namespace is the README's own module prefix, not the target namespace", () => {
    // The parser is faithful to the source: orthographic's README documents its
    // API under the `camera.` require alias, so elements keep that prefix. The
    // markdown front-end retargets to the pinned `orthographic` namespace later.
    expect(doc.info.namespace).toBe("camera");
  });

  test("lifts every documented function and no message-section header", () => {
    // 21 `### camera.<fn>(...)` API headers; the `### <verb>` message headers
    // (no dotted receiver, no parens) must not become elements.
    expect(doc.elements.length).toBe(21);
    expect(doc.elements.every((e) => e.type === "FUNCTION")).toBe(true);
    expect(doc.elements.some((e) => e.name === "camera.enable")).toBe(false);
    expect(doc.elements.some((e) => e.name === "camera.zoom_to")).toBe(false);
  });

  test("parses camera.follow parameters with names and split type tokens", () => {
    const follow = element(doc, "camera.follow");
    expect(follow).toBeDefined();
    expect(follow?.parameters.map((p) => p.name)).toEqual(["camera_id", "targets", "options"]);
    const cameraId = follow?.parameters[0];
    // A `(hash|url|nil)` annotation splits into three single mappable tokens so
    // each resolves and the `nil` token drives optionality in the emitter.
    expect(cameraId?.types).toEqual(["hash", "url", "nil"]);
  });

  test("parses a return value with name and type", () => {
    const s2w = element(doc, "camera.screen_to_world");
    expect(s2w?.parameters.map((p) => p.name)).toEqual(["camera_id", "screen"]);
    expect(s2w?.returnvalues).toEqual([
      { name: "world_coords", doc: "World coordinates", types: ["vector3"] },
    ]);
  });

  test("keeps every return slot of a multi-return function", () => {
    const viewport = element(doc, "camera.get_viewport");
    expect(viewport?.returnvalues.map((r) => r.name)).toEqual(["x", "y", "w", "h"]);
    expect(viewport?.returnvalues.every((r) => r.types.length > 0)).toBe(true);
  });

  test("marks a bracketed header argument optional via is_optional", () => {
    const shake = element(doc, "camera.shake");
    const intensity = shake?.parameters.find((p) => p.name === "intensity");
    expect(intensity?.is_optional).toBe("True");
    // A non-bracketed leading argument is not flagged optional by the bracket rule.
    const cameraId = shake?.parameters.find((p) => p.name === "camera_id");
    expect(cameraId?.is_optional).toBeUndefined();
  });

  test("camera.unfollow parses as a single-parameter, no-return function", () => {
    const unfollow = element(doc, "camera.unfollow");
    expect(unfollow?.parameters.map((p) => p.name)).toEqual(["camera_id"]);
    expect(unfollow?.returnvalues).toEqual([]);
  });
});

describe("parseMarkdownApi loud-fails on an unresolvable row", () => {
  test("throws naming the function and parameter when a bullet has no (type)", () => {
    const bad = [
      "### camera.jump(height)",
      "Jump the camera.",
      "",
      "**PARAMETERS**",
      "* `height` how far to jump",
      "",
    ].join("\n");
    expect(() => parseMarkdownApi(bad)).toThrow(/camera\.jump/);
    expect(() => parseMarkdownApi(bad)).toThrow(/height/);
  });

  test("throws when the module prefix is not uniform across headers", () => {
    const mixed = [
      "### camera.a(x)",
      "**PARAMETERS**",
      "* `x` (number) n",
      "",
      "### other.b(y)",
      "**PARAMETERS**",
      "* `y` (number) n",
      "",
    ].join("\n");
    expect(() => parseMarkdownApi(mixed)).toThrow(/prefix/);
  });
});
