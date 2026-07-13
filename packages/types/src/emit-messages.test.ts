import { describe, expect, test } from "bun:test";
import {
  applyMessageDeprecations,
  emitBuiltinMessages,
  MESSAGE_DEPRECATIONS,
  type MessageCatalog,
  parseMessagesDoc,
} from "./emit-messages";

const TWO_ENTRY_RAW: unknown = {
  info: { namespace: "builtin_messages" },
  messages: [
    {
      name: "acquire_input_focus",
      origin: "go",
      description: "",
      payload: [],
    },
    {
      name: "set_parent",
      origin: "go",
      description: "",
      payload: [
        { name: "parent_id", types: ["hash"], optional: true, doc: "" },
        { name: "keep_world_transform", types: ["0", "1"], optional: true, doc: "" },
      ],
    },
  ],
};

describe("parseMessagesDoc", () => {
  test("returns entries with name, origin, and payload", () => {
    const catalog = parseMessagesDoc(TWO_ENTRY_RAW);
    expect(catalog.entries).toHaveLength(2);
    const acquire = catalog.entries[0];
    if (!acquire) throw new Error("missing entry");
    expect(acquire.name).toBe("acquire_input_focus");
    expect(acquire.origin).toBe("go");
    expect(acquire.payload).toEqual([]);

    const setParent = catalog.entries[1];
    if (!setParent) throw new Error("missing entry");
    expect(setParent.name).toBe("set_parent");
    expect(setParent.payload).toHaveLength(2);
    expect(setParent.payload[0]).toEqual({
      name: "parent_id",
      types: ["hash"],
      optional: true,
      doc: "",
    });
  });

  test("rejects non-object input", () => {
    expect(() => parseMessagesDoc(null)).toThrow();
    expect(() => parseMessagesDoc(42)).toThrow();
  });
});

describe("emitBuiltinMessages", () => {
  test("emits BuiltinMessages interface with literal-string keys and mapped payload shapes", () => {
    const catalog = parseMessagesDoc(TWO_ENTRY_RAW);
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain("interface BuiltinMessages");
    expect(out).toContain("acquire_input_focus: Record<string, never>;");
    expect(out).toContain("set_parent: { parent_id?: Hash; keep_world_transform?: 0 | 1 };");
    expect(out).toContain("type BuiltinMessageId = keyof BuiltinMessages;");
  });

  test("emits a Hash import when any payload uses hash", () => {
    const catalog = parseMessagesDoc(TWO_ENTRY_RAW);
    const out = emitBuiltinMessages(catalog);
    expect(out).toMatch(/import type \{[^}]*\bHash\b[^}]*\} from "\.\.\/src\/core-types";/);
  });

  test("emits empty-payload messages as Record<string, never>, not unknown or never", () => {
    const catalog: MessageCatalog = {
      entries: [{ name: "ping", origin: "go", description: "", payload: [] }],
    };
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain("ping: Record<string, never>;");
    expect(out).not.toContain("ping: unknown");
    expect(out).not.toContain("ping: never");
  });

  test("field-level mapping reuses DEFOLD_TYPE_MAP (hash -> Hash, vector3 -> Vector3)", () => {
    const catalog: MessageCatalog = {
      entries: [
        {
          name: "demo",
          origin: "physics",
          description: "",
          payload: [
            { name: "h", types: ["hash"], optional: false, doc: "" },
            { name: "v", types: ["vector3"], optional: false, doc: "" },
            { name: "b", types: ["boolean"], optional: false, doc: "" },
          ],
        },
      ],
    };
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain("demo: { h: Hash; v: Vector3; b: boolean };");
  });

  test("play_sound emits all five optional offset fields", () => {
    const catalog: MessageCatalog = {
      entries: [
        {
          name: "play_sound",
          origin: "sound",
          description: "",
          payload: [
            { name: "delay", types: ["number"], optional: true, doc: "" },
            { name: "gain", types: ["number"], optional: true, doc: "" },
            { name: "play_id", types: ["number"], optional: true, doc: "" },
            { name: "start_time", types: ["number"], optional: true, doc: "" },
            { name: "start_frame", types: ["number"], optional: true, doc: "" },
          ],
        },
      ],
    };
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain(
      "play_sound: { delay?: number; gain?: number; play_id?: number; start_time?: number; start_frame?: number };",
    );
  });

  test("output is syntactically-valid TypeScript", () => {
    const catalog = parseMessagesDoc(TWO_ENTRY_RAW);
    const out = emitBuiltinMessages(catalog);
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.scan(out)).not.toThrow();
  });

  test("emits an @deprecated JSDoc immediately above a message whose deprecatedSince is set", () => {
    const catalog: MessageCatalog = {
      entries: [
        {
          name: "acquire_camera_focus",
          origin: "camera",
          description: "",
          payload: [],
          deprecatedSince: "1.13.0",
        },
      ],
    };
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain(
      "    /** @deprecated since 1.13.0 */\n    acquire_camera_focus: Record<string, never>;",
    );
  });

  test("a deprecated message keeps its key quoting and payload shape unchanged", () => {
    const catalog: MessageCatalog = {
      entries: [
        {
          name: "release_camera_focus",
          origin: "camera",
          description: "",
          payload: [{ name: "id", types: ["hash"], optional: false, doc: "" }],
          deprecatedSince: "1.13.0",
        },
      ],
    };
    const out = emitBuiltinMessages(catalog);
    expect(out).toContain(
      "    /** @deprecated since 1.13.0 */\n    release_camera_focus: { id: Hash };",
    );
  });

  test("a non-deprecated message emits no @deprecated JSDoc", () => {
    const catalog = parseMessagesDoc(TWO_ENTRY_RAW);
    const out = emitBuiltinMessages(catalog);
    expect(out).not.toContain("@deprecated");
  });
});

describe("applyMessageDeprecations", () => {
  const catalog: MessageCatalog = {
    entries: [
      { name: "acquire_camera_focus", origin: "camera", description: "", payload: [] },
      { name: "release_camera_focus", origin: "camera", description: "", payload: [] },
      // Same message name under a different origin must not be matched by a camera key.
      { name: "acquire_camera_focus", origin: "go", description: "", payload: [] },
    ],
  };

  test("sets deprecatedSince on the exact (origin, name) match only", () => {
    const out = applyMessageDeprecations(catalog, [
      { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
    ]);
    const camera = out.entries.find(
      (e) => e.origin === "camera" && e.name === "acquire_camera_focus",
    );
    const go = out.entries.find((e) => e.origin === "go" && e.name === "acquire_camera_focus");
    expect(camera?.deprecatedSince).toBe("1.13.0");
    expect(go?.deprecatedSince).toBeUndefined();
  });

  test("fails closed when an overlay identity is absent from the catalog", () => {
    expect(() =>
      applyMessageDeprecations(catalog, [
        { origin: "camera", name: "no_such_message", deprecatedSince: "1.13.0" },
      ]),
    ).toThrow();
  });

  test("does not mutate the input catalog entries", () => {
    applyMessageDeprecations(catalog, [
      { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
    ]);
    expect(catalog.entries[0]?.deprecatedSince).toBeUndefined();
  });

  test("default MESSAGE_DEPRECATIONS curates exactly the two 1.13.0 camera-focus messages", () => {
    expect(MESSAGE_DEPRECATIONS.map((d) => `${d.origin} ${d.name}`).sort()).toEqual([
      "camera acquire_camera_focus",
      "camera release_camera_focus",
    ]);
    for (const dep of MESSAGE_DEPRECATIONS) expect(dep.deprecatedSince).toBe("1.13.0");
  });
});
