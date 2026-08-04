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

// The eight `in/<mod>.md` files defold-input ships at tag 4.7.1, snapshotted under
// `fixtures/markdown/in.<mod>.md`. They are the committed evidence behind each
// module's recorded no-go: six document usage prose with no API signature section
// at all, and the two that do carry `### <recv>.<fn>(...)` headers document almost
// none of the surface. `in.keyboard` and `in.triggers` ship no `.md` upstream, so
// they have no fixture here at all.
const SIGNATURELESS = ["accelerometer", "button", "gesture", "mapper", "onscreen", "textbox"];

function inputFixture(mod: string): string {
  return readFileSync(join(PACKAGE_ROOT, "fixtures/markdown", `in.${mod}.md`), "utf8");
}

describe("defold-input module docs at the pinned 4.7.1 snapshot", () => {
  test.each(
    SIGNATURELESS,
  )("in.%s carries no signature section and loud-fails rather than emitting an empty namespace", (mod) => {
    const parse = () => parseMarkdownApi(inputFixture(mod), `in.${mod}`);
    expect(parse).toThrow(new RegExp(`in\\.${mod}`));
    expect(parse).toThrow(/signature/);
  });

  test("in.cursor lifts the one documented function", () => {
    const doc = parseMarkdownApi(inputFixture("cursor"), "in.cursor");
    expect(doc.info.namespace).toBe("cursor");
    expect(doc.elements.map((e) => e.name)).toEqual(["cursor.listen"]);
  });

  test("in.state lifts its six documented functions", () => {
    const doc = parseMarkdownApi(inputFixture("state"), "in.state");
    expect(doc.info.namespace).toBe("state");
    expect(doc.elements.map((e) => e.name).sort()).toEqual([
      "state.acquire",
      "state.clear",
      "state.create",
      "state.is_pressed",
      "state.on_input",
      "state.release",
    ]);
  });
});

describe("parseMarkdownApi accepts both ## and ### signature header levels", () => {
  const body = [
    "Show a screen.",
    "",
    "**PARAMETERS**",
    "* `screen_id` (hash|string) - Id of the screen to show",
    "* `options` (table) - Table with options",
    "",
    "**RETURN**",
    "* `success` (boolean) - Whether the screen was shown",
    "",
  ];

  test("a ## heading yields the same element as the identical ### heading", () => {
    const signature = "monarch.show(screen_id, [options])";
    const two = parseMarkdownApi([`## ${signature}`, ...body].join("\n"));
    const three = parseMarkdownApi([`### ${signature}`, ...body].join("\n"));
    const shown = element(two, "monarch.show");
    expect(shown).toEqual(element(three, "monarch.show") as MarkdownElement);
    expect(shown?.parameters.map((p) => p.name)).toEqual(["screen_id", "options"]);
    expect(shown?.parameters[0]?.types).toEqual(["hash", "string"]);
    expect(shown?.parameters[1]?.is_optional).toBe("True");
    expect(shown?.returnvalues.map((r) => r.types)).toEqual([["boolean"]]);
  });

  test.each([
    ["#", "h1"],
    ["####", "h4"],
  ])("a %s (%s) heading shaped like a signature stays invisible", (marker) => {
    const doc = [`${marker} monarch.show(screen_id)`, ...body].join("\n");
    expect(() => parseMarkdownApi(doc, "monarch.monarch")).toThrow(/monarch\.monarch/);
    expect(() => parseMarkdownApi(doc, "monarch.monarch")).toThrow(/signature/);
  });

  test("a ## heading with no parens is a constant, not an element", () => {
    // monarch's README_API.md documents its four `## monarch.SCREEN_TRANSITION_*`
    // constants as headings; the required parens keep them out of the surface.
    const doc = [
      "## monarch.SCREEN_TRANSITION_IN_STARTED",
      "Message sent when a transition starts.",
      "",
      "## monarch.show(screen_id)",
      "**PARAMETERS**",
      "* `screen_id` (hash) - Id",
      "",
    ].join("\n");
    expect(parseMarkdownApi(doc).elements.map((e) => e.name)).toEqual(["monarch.show"]);
  });

  test("a ## prose heading that merely mentions a dotted call stays invisible", () => {
    // `in.cursor.md` ships `## Combine with physics.set_event_listener()`. The
    // header anchor is what keeps the widening from lifting prose like this.
    const doc = [
      "## Combine with physics.set_event_listener()",
      "Some prose.",
      "",
      "### cursor.listen(url)",
      "**PARAMETERS**",
      "* `url` (url) - Target",
      "",
    ].join("\n");
    expect(parseMarkdownApi(doc).elements.map((e) => e.name)).toEqual(["cursor.listen"]);
  });

  test("mixed ## and ### signature headings still loud-fail on a non-uniform prefix", () => {
    const mixed = [
      "## camera.a(x)",
      "**PARAMETERS**",
      "* `x` (number) n",
      "",
      "### other.b(y)",
      "**PARAMETERS**",
      "* `y` (number) n",
      "",
    ].join("\n");
    expect(() => parseMarkdownApi(mixed)).toThrow(/non-uniform module prefix/);
  });
});

describe("parseMarkdownApi accepts an optional `function` declaration keyword", () => {
  const body = [
    "Set a camera property.",
    "",
    "**PARAMETERS**",
    "* `camera_id` (hash) - Id of the camera",
    "* `property` (string) - Property to set",
    "",
  ];

  test.each([
    ["##"],
    ["###"],
  ])("a %s heading with the keyword yields the same element as the bare form", (marker) => {
    const signature = "rendy.set(camera_id, property)";
    const keyword = parseMarkdownApi([`${marker} function ${signature}`, ...body].join("\n"));
    const bare = parseMarkdownApi([`${marker} ${signature}`, ...body].join("\n"));
    const set = element(keyword, "rendy.set");
    expect(set).toEqual(element(bare, "rendy.set") as MarkdownElement);
    expect(set?.parameters.map((p) => p.name)).toEqual(["camera_id", "property"]);
    expect(keyword.info.namespace).toBe("rendy");
  });

  test("a keyword-prefixed section still ends at the next header", () => {
    // rendy writes 9 of its 11 headings with the keyword; before the widening the
    // unmatched ones did not close the preceding section, so the rest of the API
    // section landed inside the previous function's description.
    const doc = parseMarkdownApi(
      [
        "### rendy.destroy_camera(camera_id)",
        "Destroy a camera.",
        "",
        "### function rendy.set(camera_id, property)",
        "Set a camera property.",
        "",
      ].join("\n"),
    );
    expect(element(doc, "rendy.destroy_camera")?.description).toBe("Destroy a camera.");
    expect(element(doc, "rendy.set")?.description).toBe("Set a camera property.");
  });

  test("the keyword is not swallowed as the receiver in a mixed document", () => {
    const doc = parseMarkdownApi(
      [
        "### rendy.create_camera(camera_id)",
        "Create a camera.",
        "",
        "### function rendy.set(camera_id, property)",
        "Set a camera property.",
        "",
      ].join("\n"),
    );
    expect(doc.info.namespace).toBe("rendy");
    expect(doc.elements.map((e) => e.name)).toEqual(["rendy.create_camera", "rendy.set"]);
  });

  test("a keyword-prefixed prose heading with no dotted call stays invisible", () => {
    const doc = parseMarkdownApi(
      ["### function overview", "Some prose.", "", "### function rendy.set(camera_id)", ""].join(
        "\n",
      ),
    );
    expect(doc.elements.map((e) => e.name)).toEqual(["rendy.set"]);
  });

  test("a #### keyword heading stays outside the accepted range", () => {
    const doc = ["#### function rendy.set(camera_id)", ...body].join("\n");
    expect(() => parseMarkdownApi(doc, "rendy.rendy")).toThrow(/rendy\.rendy/);
    expect(() => parseMarkdownApi(doc, "rendy.rendy")).toThrow(/signature/);
  });

  test("only `function` is accepted — a prose keyword does not read as a signature", () => {
    // A general `\w+\s+` prefix would lift `### see rendy.set(...)` prose lines.
    const doc = parseMarkdownApi(
      ["### see rendy.get(camera_id)", "Prose.", "", "### function rendy.set(camera_id)", ""].join(
        "\n",
      ),
    );
    expect(doc.elements.map((e) => e.name)).toEqual(["rendy.set"]);
  });
});

describe("parseMarkdownApi splits a comma-listed type group into a union", () => {
  function typesOf(group: string): string[] | undefined {
    const doc = parseMarkdownApi(
      [
        "### dicebag.bag_draw(id)",
        "Draw from a bag.",
        "",
        "**PARAMETERS**",
        `* \`id\` (${group}) - The bag id`,
        "",
      ].join("\n"),
    );
    return element(doc, "dicebag.bag_draw")?.parameters[0]?.types;
  }

  test("a comma-listed group yields one token per alternative", () => {
    // dicebag documents six members as `(string, number, hash)`; before the split
    // the whole group reached the emitter as one unmappable token and fell to
    // `unknown`.
    expect(typesOf("string, number, hash")).toEqual(["string", "number", "hash"]);
  });

  test("commas and pipes compose as separators rather than replacing each other", () => {
    expect(typesOf("hash | url, nil")).toEqual(["hash", "url", "nil"]);
  });

  test("a comma inside a token's square brackets keeps it one token", () => {
    expect(typesOf("table[number, number]")).toEqual(["table[number, number]"]);
  });

  test("a comma inside a token's parentheses keeps it one token", () => {
    // `TYPED_BULLET`'s `([^)]*)` stops at the first `)`, so the splitter receives
    // the unbalanced `function(self, dt`; depth tracking on `(` is what keeps that
    // one token instead of two.
    expect(typesOf("function(self, dt)")).toEqual(["function(self, dt"]);
  });

  test("a comma inside a token's curly braces keeps it one token", () => {
    expect(typesOf("{number, string}, nil")).toEqual(["{number, string}", "nil"]);
  });

  test("an unmatched closing bracket does not disable splitting for the rest", () => {
    // Depth clamps at 0 rather than going negative, so a stray `]` cannot silently
    // swallow every separator that follows it.
    expect(typesOf("table], nil")).toEqual(["table]", "nil"]);
  });

  test("empty segments are dropped", () => {
    expect(typesOf("string, , number")).toEqual(["string", "number"]);
  });
});

describe("parseMarkdownApi loud-fails on a document with no API signature", () => {
  test("throws naming the module when prose carries no dotted signature header", () => {
    const prose = ["# Textbox", "", "# Usage", "Require the module and call it.", ""].join("\n");
    expect(() => parseMarkdownApi(prose, "in.textbox")).toThrow(/in\.textbox/);
    expect(() => parseMarkdownApi(prose, "in.textbox")).toThrow(/signature/);
  });

  test("falls back to a generic label when the caller names no module", () => {
    expect(() => parseMarkdownApi("# Just prose\n")).toThrow(/signature/);
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
