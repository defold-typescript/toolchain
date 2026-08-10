import { describe, expect, test } from "bun:test";
import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

const FLAT_GO = `components {
  id: "board"
  component: "/main/board.gui"
  position {
    x: 0.0
    y: 0.0
    z: 0.0
  }
}
`;

const EMBEDDED_COLLECTION = `name: "game"
collection_instances {
  id: "player"
  collection: "/game/player.collection"
}
scale_along_z: 0
embedded_instances {
  id: "level"
  data: "components {\\n"
  "  id: \\"level\\"\\n"
  "  component: \\"/game/level.tilemap\\"\\n"
  "}\\n"
  "embedded_components {\\n"
  "  id: \\"collisionobject\\"\\n"
  "  type: \\"collisionobject\\"\\n"
  "  data: \\"collision_shape: \\\\\\"/game/level.tilemap\\\\\\"\\\\n"
  "type: COLLISION_OBJECT_TYPE_STATIC\\\\n"
  "mass: 0.0\\\\n"
  "mask: \\\\\\"player\\\\\\"\\\\n"
  "mask: \\\\\\"ground\\\\\\"\\\\n"
  "\\"\\n"
  "}\\n"
  ""
  position {
    x: 0.0
  }
}
`;

function must(message: SceneMessage | undefined): SceneMessage {
  if (message === undefined) throw new Error("expected a message");
  return message;
}

function field(message: SceneMessage | undefined, key: string): string {
  const values = must(message).fields.get(key);
  const value = values?.length === 1 ? values[0] : undefined;
  if (value === undefined) {
    throw new Error(`expected exactly one \`${key}\` value, got ${JSON.stringify(values)}`);
  }
  return value;
}

function sub(message: SceneMessage | undefined, key: string, index = 0): SceneMessage {
  return must(must(message).messages.get(key)?.[index]);
}

function thrownBy(text: string): unknown {
  try {
    parseSceneTextFormat(text);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("parseSceneTextFormat structural parse", () => {
  test("reads a flat .go into one components message with a nested position", () => {
    const document = parseSceneTextFormat(FLAT_GO);

    expect(document.messages.get("components")?.length).toBe(1);
    const component = sub(document, "components");
    expect(field(component, "id")).toBe("board");
    expect(field(component, "component")).toBe("/main/board.gui");
    expect(field(sub(component, "position"), "x")).toBe("0.0");
  });

  test("keeps repeated messages and repeated scalars in declaration order", () => {
    const document = parseSceneTextFormat(
      'components {\n  id: "first"\n}\ncomponents {\n  id: "second"\n}\n' +
        'mask: "player"\nmask: "ground"\n',
    );

    expect(document.messages.get("components")?.length).toBe(2);
    expect(field(sub(document, "components", 0), "id")).toBe("first");
    expect(field(sub(document, "components", 1), "id")).toBe("second");
    expect(document.fields.get("mask")).toEqual(["player", "ground"]);
  });

  test("keeps unquoted scalars verbatim", () => {
    const document = parseSceneTextFormat(
      "scale_along_z: 0\ntype: COLLISION_OBJECT_TYPE_STATIC\nlocked_rotation: false\n",
    );

    expect(field(document, "scale_along_z")).toBe("0");
    expect(field(document, "type")).toBe("COLLISION_OBJECT_TYPE_STATIC");
    expect(field(document, "locked_rotation")).toBe("false");
  });

  test("an empty trailing literal contributes nothing and is not an error", () => {
    const document = parseSceneTextFormat(
      'embedded_instances {\n  data: "id: \\"a\\"\\n"\n  ""\n}\n',
    );

    expect(field(sub(document, "embedded_instances"), "data")).toBe('id: "a"\n');
  });
});

describe("parseSceneTextFormat string decoding and recursion", () => {
  test("adjacent literals concatenate and one decode pass yields a re-parseable document", () => {
    const document = parseSceneTextFormat(EMBEDDED_COLLECTION);

    expect(field(document, "name")).toBe("game");
    expect(field(document, "scale_along_z")).toBe("0");
    expect(field(sub(document, "collection_instances"), "collection")).toBe(
      "/game/player.collection",
    );

    const inner = parseSceneTextFormat(field(sub(document, "embedded_instances"), "data"));

    expect(field(sub(inner, "components"), "id")).toBe("level");
    expect(field(sub(inner, "components"), "component")).toBe("/game/level.tilemap");
  });

  test("re-parsing the depth-2 payload proves exactly one decode pass per level", () => {
    const document = parseSceneTextFormat(EMBEDDED_COLLECTION);
    const inner = parseSceneTextFormat(field(sub(document, "embedded_instances"), "data"));
    const embeddedComponent = sub(inner, "embedded_components");
    expect(field(embeddedComponent, "id")).toBe("collisionobject");

    const shape = parseSceneTextFormat(field(embeddedComponent, "data"));

    expect(field(shape, "collision_shape")).toBe("/game/level.tilemap");
    expect(field(shape, "type")).toBe("COLLISION_OBJECT_TYPE_STATIC");
    expect(shape.fields.get("mask")).toEqual(["player", "ground"]);
  });

  test("decodes the escape set once and leaves every other backslash pair intact", () => {
    const document = parseSceneTextFormat('v: "a\\tb\\rc\\nd\\\\e\\"f\\qg"\n');

    expect(field(document, "v")).toBe('a\tb\rc\nd\\e"f\\qg');
  });
});

describe("parseSceneTextFormat error reporting", () => {
  test("an unterminated quoted literal throws with its 1-based line", () => {
    const error = thrownBy('a: "ok"\nb {\n  c: "oops\n}\n');

    expect(error).toBeInstanceOf(SceneTextFormatError);
    expect((error as SceneTextFormatError).line).toBe(3);
  });

  test("an unclosed brace throws with the opening line rather than returning a partial tree", () => {
    const error = thrownBy('a: "ok"\nb {\n  c: "fine"\n');

    expect(error).toBeInstanceOf(SceneTextFormatError);
    expect((error as SceneTextFormatError).line).toBe(2);
  });

  test("a stray closing brace throws with its line", () => {
    const error = thrownBy('a: "ok"\n}\n');

    expect(error).toBeInstanceOf(SceneTextFormatError);
    expect((error as SceneTextFormatError).line).toBe(2);
  });
});
