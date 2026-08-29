import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type MarkdownDoc,
  type MarkdownElement,
  type MarkdownParam,
  parseMarkdownApi,
} from "./parse-markdown-api";

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
    // Every `### camera.<fn>(...)` API header, in document order; the
    // `### <verb>` message headers (no dotted receiver, no parens) must not
    // become elements.
    expect(doc.elements.map((e) => e.name)).toEqual([
      "camera.get_view",
      "camera.get_viewport",
      "camera.get_projection",
      "camera.shake",
      "camera.stop_shaking",
      "camera.recoil",
      "camera.get_offset",
      "camera.get_zoom",
      "camera.set_zoom",
      "camera.get_automatic_zoom",
      "camera.set_automatic_zoom",
      "camera.follow",
      "camera.follow_offset",
      "camera.unfollow",
      "camera.deadzone",
      "camera.bounds",
      "camera.screen_to_world",
      "camera.screen_to_world_bounds",
      "camera.world_to_screen",
      "camera.get_window_size",
      "camera.get_display_size",
    ]);
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

describe("parseMarkdownApi reads escaped and comma-spanning header brackets", () => {
  function paramsOf(signature: string, names: string[], bullets?: string[]): MarkdownParam[] {
    const doc = parseMarkdownApi(
      [
        `### ${signature}`,
        "Do a thing.",
        "",
        "**PARAMETERS**",
        ...(bullets ?? names.map((name) => `* \`${name}\` (number) - The ${name}`)),
        "",
      ].join("\n"),
    );
    return element(doc, signature.slice(0, signature.indexOf("(")))?.parameters ?? [];
  }

  function optionalNames(params: MarkdownParam[]): string[] {
    return params.filter((p) => p.is_optional === "True").map((p) => p.name);
  }

  test("an escaped single argument is optional under a clean bare name", () => {
    const params = paramsOf("mod.fn(a, \\[b])", ["a", "b"]);
    expect(params.map((p) => p.name)).toEqual(["a", "b"]);
    expect(optionalNames(params)).toEqual(["b"]);
  });

  test("an escaped comma-spanning group marks only the bracketed argument optional", () => {
    // rendy writes `### function rendy.shake(camera_id, radius, intensity, duration \[, scaler])`;
    // the backslash is a README rendering artifact and must not reach a slot name.
    const params = paramsOf("mod.fn(a, b \\[, c])", ["a", "b", "c"]);
    expect(params.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(params.some((p) => p.name.includes("\\"))).toBe(false);
    expect(optionalNames(params)).toEqual(["c"]);
  });

  test("an unescaped comma-spanning group marks only the bracketed argument optional", () => {
    // persist writes `### persist.create(file_name, data [, overwrite])`.
    const params = paramsOf("mod.fn(a, b [, c])", ["a", "b", "c"]);
    expect(optionalNames(params)).toEqual(["c"]);
  });

  test("every argument inside a multi-argument group is optional", () => {
    const params = paramsOf("mod.fn(a, [b, c])", ["a", "b", "c"]);
    expect(optionalNames(params)).toEqual(["b", "c"]);
  });

  test("separately bracketed arguments stay optional", () => {
    const params = paramsOf("mod.fn(a, [b], [c])", ["a", "b", "c"]);
    expect(optionalNames(params)).toEqual(["b", "c"]);
  });

  test("a lone bracketed argument is optional", () => {
    const params = paramsOf("mod.fn([a])", ["a"]);
    expect(optionalNames(params)).toEqual(["a"]);
  });

  test("a `[` inside a bullet's (type) group is not an optionality marker", () => {
    const params = paramsOf(
      "mod.fn(opts)",
      ["opts"],
      ["* `opts` (table[string, number]) - a lookup"],
    );
    expect(params.map((p) => p.types)).toEqual([["table[string, number]"]]);
    expect(params[0]?.is_optional).toBeUndefined();
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

/** Name, ordered slots, their types and their optionality, as one readable line
 * per element — the projection a dialect widening must leave untouched. */
function signature(e: MarkdownElement): string {
  const slot = (p: MarkdownParam) => `${p.name}${p.is_optional ? "?" : ""}:${p.types.join("|")}`;
  const returns = e.returnvalues.map(slot).join(", ");
  return `${e.name}(${e.parameters.map(slot).join(", ")}) -> ${returns.length > 0 ? returns : "()"}`;
}

describe("the marker and row dialect widening leaves the orthographic parse unchanged", () => {
  const doc = parseMarkdownApi(FIXTURE);

  test("every element keeps its name, order, slot names, types and optionality", () => {
    expect(doc.elements.map(signature)).toEqual([
      "camera.get_view(camera_id:hash|url|nil) -> view:matrix",
      "camera.get_viewport(camera_id:hash|url|nil) -> x:number, y:number, w:number, h:number",
      "camera.get_projection(camera_id:hash|url|nil) -> projection:matrix",
      "camera.shake(camera_id:hash|url, intensity?:number, duration?:number, direction?:hash, cb?:function) -> ()",
      "camera.stop_shaking(camera_id:hash|url) -> ()",
      "camera.recoil(camera_id:hash|url, offset:vector3, duration?:number) -> ()",
      "camera.get_offset(camera_id:hash|url|nil) -> offset:vector3",
      "camera.get_zoom(camera_id:hash|url|nil) -> zoom:number",
      "camera.set_zoom(camera_id:hash|url|nil, zoom:number) -> ()",
      "camera.get_automatic_zoom() -> auto_zoom:boolean",
      "camera.set_automatic_zoom(enabled:boolean) -> ()",
      "camera.follow(camera_id:hash|url|nil, targets:hash|url|table, options?:table) -> ()",
      "camera.follow_offset(camera_id:hash|url|nil, offset:vector3) -> ()",
      "camera.unfollow(camera_id:hash|url|nil) -> ()",
      "camera.deadzone(camera_id:hash|url|nil, left:number, top:number, right:number, bottom:number) -> ()",
      "camera.bounds(camera_id:hash|url|nil, left:number, top:number, right:number, bottom:number) -> ()",
      "camera.screen_to_world(camera_id:hash|url|nil, screen:vector3) -> world_coords:vector3",
      "camera.screen_to_world_bounds(camera_id:hash|url|nil) -> bounds:vector4",
      "camera.world_to_screen(camera_id:hash|url|nil, world:vector3) -> screen_coords:vector3",
      "camera.get_window_size() -> width:number, height:number",
      "camera.get_display_size() -> width:number, height:number",
    ]);
  });

  test("the whole parsed doc, slot prose included, is byte-identical", () => {
    // The signature projection above is deliberately lossy — it drops every
    // slot's `doc` and the module description. This digest closes that gap: it
    // moves for any parse change at all, so a widening that rewords a slot's
    // prose cannot pass while the readable projection still matches.
    const digest = createHash("sha256").update(JSON.stringify(doc)).digest("hex");
    expect(digest).toBe("8e22469c8e386f0b3d5edb5923d7d77afa830ececdffb80c6940c94bc9751143");
  });
});

describe("the marker dialect accepts every spelling the corpus vendors", () => {
  const withMarker = (marker: string) =>
    [
      "### mod.load(path)",
      "Load a file.",
      "",
      marker,
      "* `path: string` - the path to load",
      "",
    ].join("\n");

  test("a backticked `name: type` row under `**Parameters**` reads as a typed slot", () => {
    const doc = parseMarkdownApi(withMarker("**Parameters**"));
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0]?.parameters).toEqual([
      { name: "path", doc: "the path to load", types: ["string"] },
    ]);
  });

  test("the colon-suffixed and lowercase spellings parse identically", () => {
    const bare = parseMarkdownApi(withMarker("**Parameters**"));
    expect(parseMarkdownApi(withMarker("**Parameters:**"))).toEqual(bare);
    expect(parseMarkdownApi(withMarker("**parameters**"))).toEqual(bare);
    expect(parseMarkdownApi(withMarker("**PARAMETERS**"))).toEqual(bare);
  });

  test("the mixed-case return spellings are recognised too", () => {
    const returns = (marker: string) =>
      parseMarkdownApi(["### mod.get()", marker, "* `value: number` - the value", ""].join("\n"))
        .elements[0]?.returnvalues;
    expect(returns("**Returns:**")).toEqual([
      { name: "value", doc: "the value", types: ["number"] },
    ]);
    expect(returns("**Return**")).toEqual(returns("**Returns:**"));
    expect(returns("**RETURNS**")).toEqual(returns("**Returns:**"));
  });

  test("both row forms coexist in one section, neither shadowing the other", () => {
    const doc = parseMarkdownApi(
      [
        "### mod.fn(a, b)",
        "**PARAMETERS**",
        "* `a` (number) - the parenthesised arm",
        "* `b: string` - the colon arm",
        "",
      ].join("\n"),
    );
    expect(doc.elements[0]?.parameters).toEqual([
      { name: "a", doc: "the parenthesised arm", types: ["number"] },
      { name: "b", doc: "the colon arm", types: ["string"] },
    ]);
  });

  test("a colon row's union splits through the shared splitTypes", () => {
    const doc = parseMarkdownApi(
      ["### mod.fn(a)", "**Parameters:**", "* `a: string|nil` - maybe a string", ""].join("\n"),
    );
    expect(doc.elements[0]?.parameters[0]?.types).toEqual(["string", "nil"]);
  });

  test("a bracketed header argument still marks a colon row optional", () => {
    const doc = parseMarkdownApi(
      ["### mod.fn([a])", "**Parameters:**", "* `a: number` - maybe", ""].join("\n"),
    );
    expect(doc.elements[0]?.parameters[0]?.is_optional).toBe("True");
  });
});

describe("parseMarkdownApi loud-fails on a marker whose list it cannot read", () => {
  const dashRows = [
    "### mod.get(x)",
    "Get a thing.",
    "",
    "**RETURN**",
    "- value (number)",
    "",
  ].join("\n");

  test("throws naming the function and the offending row", () => {
    expect(() => parseMarkdownApi(dashRows)).toThrow(/mod\.get/);
    expect(() => parseMarkdownApi(dashRows)).toThrow(/- value \(number\)/);
  });

  test("the refusal is distinguishable from the no-signature refusal", () => {
    // The empty-document refusal matches /signature/ and several recorded
    // verdicts key on that matcher; this one must not be swallowed by it.
    expect(() => parseMarkdownApi("# Just prose\n")).toThrow(/signature/);
    expect(() => parseMarkdownApi(dashRows)).not.toThrow(/signature/);
  });

  test("a marker followed by prose alone throws the same refusal", () => {
    const proseOnly = ["### mod.get(x)", "**PARAMETERS**", "See the table below.", ""].join("\n");
    expect(() => parseMarkdownApi(proseOnly)).toThrow(/mod\.get/);
    expect(() => parseMarkdownApi(proseOnly)).not.toThrow(/signature/);
  });

  test("a signature documented with no marker at all stays legal", () => {
    // rendy documents all 11 of its functions this way; refusing on slot count
    // alone rather than on "marker seen, zero slots" would red 30 sections.
    const markerless = ["### mod.tick()", "Advance one frame.", ""].join("\n");
    expect(parseMarkdownApi(markerless).elements[0]?.parameters).toEqual([]);
  });
});
