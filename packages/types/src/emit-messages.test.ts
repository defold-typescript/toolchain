import { describe, expect, test } from "bun:test";
import messagesDoc from "../fixtures/messages_doc.json" with { type: "json" };
import {
  applyMessageDeprecations,
  applyMessageEngineCorrections,
  applyMessageFieldCorrections,
  emitBuiltinMessages,
  MESSAGE_DEPRECATIONS,
  MESSAGE_ENGINE_CORRECTIONS,
  MESSAGE_FIELD_CORRECTIONS,
  type MessageCatalog,
  type MessageEngineCorrection,
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

  test("throws an actionable error when two catalog entries share an (origin, name)", () => {
    const ambiguous: MessageCatalog = {
      entries: [
        { name: "acquire_camera_focus", origin: "camera", description: "", payload: [] },
        { name: "acquire_camera_focus", origin: "camera", description: "", payload: [] },
      ],
    };
    expect(() =>
      applyMessageDeprecations(ambiguous, [
        { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
      ]),
    ).toThrow(/duplicate catalog message identity.*origin=camera.*name=acquire_camera_focus/);
  });

  test("throws when two overlay entries share an (origin, name) rather than writing it twice", () => {
    expect(() =>
      applyMessageDeprecations(catalog, [
        { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
        { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
      ]),
    ).toThrow(/duplicate overlay message identity.*origin=camera.*name=acquire_camera_focus/);
  });

  test("equal names under different origins stay distinct and the two curated camera entries resolve", () => {
    const out = applyMessageDeprecations(catalog);
    const cameraAcquire = out.entries.find(
      (e) => e.origin === "camera" && e.name === "acquire_camera_focus",
    );
    const cameraRelease = out.entries.find(
      (e) => e.origin === "camera" && e.name === "release_camera_focus",
    );
    const goAcquire = out.entries.find(
      (e) => e.origin === "go" && e.name === "acquire_camera_focus",
    );
    expect(cameraAcquire?.deprecatedSince).toBe("1.13.0");
    expect(cameraRelease?.deprecatedSince).toBe("1.13.0");
    expect(goAcquire?.deprecatedSince).toBeUndefined();
  });

  test("applying the default overlays then emitting the fixture preserves the generated declaration bytes", async () => {
    const raw = JSON.parse(
      await Bun.file(new URL("../fixtures/messages_doc.json", import.meta.url)).text(),
    );
    const catalog = applyMessageEngineCorrections(
      applyMessageFieldCorrections(applyMessageDeprecations(parseMessagesDoc(raw))),
    );
    const emitted = emitBuiltinMessages(catalog);
    const generated = await Bun.file(
      new URL("../generated/builtin-messages.d.ts", import.meta.url),
    ).text();
    expect(emitted).toBe(generated);
  });
});

describe("applyMessageFieldCorrections", () => {
  const camera: MessageCatalog = {
    entries: [
      {
        name: "set_camera",
        origin: "camera",
        description: "",
        payload: [
          { name: "fov", types: ["number"], optional: false, doc: "" },
          { name: "orthographic_projection", types: ["boolean"], optional: false, doc: "" },
        ],
      },
    ],
  };
  const overlay = [
    {
      origin: "camera",
      name: "set_camera",
      field: "orthographic_projection",
      types: ["number"],
      upstream: ["boolean"],
      reason: "test",
    },
  ];

  test("retypes the corrected field and leaves its siblings alone", () => {
    const [entry] = applyMessageFieldCorrections(camera, overlay).entries;
    expect(entry?.payload.map((field) => [field.name, field.types])).toEqual([
      ["fov", ["number"]],
      ["orthographic_projection", ["number"]],
    ]);
    expect(camera.entries[0]?.payload[1]?.types).toEqual(["boolean"]);
  });

  test("throws once upstream no longer declares the corrected type, or the field is gone", () => {
    const fixed: MessageCatalog = {
      entries: [
        {
          ...(camera.entries[0] as MessageCatalog["entries"][number]),
          payload: [
            { name: "orthographic_projection", types: ["number"], optional: false, doc: "" },
          ],
        },
      ],
    };
    expect(() => applyMessageFieldCorrections(fixed, overlay)).toThrow(/upstream now declares/);
    expect(() => applyMessageFieldCorrections({ entries: [] }, overlay)).toThrow(
      /no catalog field/,
    );
  });

  test("every committed correction matches the committed catalog", () => {
    expect(MESSAGE_FIELD_CORRECTIONS.length).toBeGreaterThan(0);
    expect(() => applyMessageFieldCorrections(parseMessagesDoc(messagesDoc))).not.toThrow();
  });
});

describe("applyMessageEngineCorrections", () => {
  const sound: MessageCatalog = {
    entries: [
      {
        name: "play_sound",
        origin: "sound",
        description: "",
        payload: [
          { name: "gain", types: ["number"], optional: true, doc: "" },
          { name: "delay", types: ["number"], optional: false, doc: "" },
        ],
      },
      {
        name: "sound_done",
        origin: "sound",
        description: "",
        payload: [{ name: "play_id", types: ["number"], optional: true, doc: "" }],
      },
    ],
  };
  const pan = { name: "pan", types: ["number"], optional: true, doc: "" };
  const optionalDelay: MessageEngineCorrection = {
    kind: "optional",
    origin: "sound",
    name: "play_sound",
    fields: ["delay"],
    evidence: "test",
  };
  const requiredPlayId: MessageEngineCorrection = {
    kind: "required",
    origin: "sound",
    name: "sound_done",
    fields: ["play_id"],
    evidence: "test",
  };
  const addPan: MessageEngineCorrection = {
    kind: "add-field",
    origin: "sound",
    name: "play_sound",
    fields: [pan],
    evidence: "test",
  };
  const addSetPan: MessageEngineCorrection = {
    kind: "add-message",
    origin: "sound",
    name: "set_pan",
    description: "Set the pan.",
    fields: [pan],
    evidence: "test",
  };

  function payloadOf(catalog: MessageCatalog, name: string) {
    return catalog.entries
      .find((entry) => entry.name === name)
      ?.payload.map((field) => [field.name, field.optional]);
  }

  test("optional and required flip only the named fields", () => {
    const out = applyMessageEngineCorrections(sound, [optionalDelay, requiredPlayId]);
    expect(payloadOf(out, "play_sound")).toEqual([
      ["gain", true],
      ["delay", true],
    ]);
    expect(payloadOf(out, "sound_done")).toEqual([["play_id", false]]);
    expect(payloadOf(sound, "play_sound")).toEqual([
      ["gain", true],
      ["delay", false],
    ]);
  });

  test("add-field appends the engine fields and add-message adds the message", () => {
    const out = applyMessageEngineCorrections(sound, [addPan, addSetPan]);
    expect(payloadOf(out, "play_sound")).toEqual([
      ["gain", true],
      ["delay", false],
      ["pan", true],
    ]);
    const setPan = out.entries.find((entry) => entry.name === "set_pan");
    expect(setPan).toEqual({
      name: "set_pan",
      origin: "sound",
      description: "Set the pan.",
      payload: [pan],
    });
    expect(sound.entries).toHaveLength(2);
  });

  test("each kind throws once the catalog already states the engine fact", () => {
    expect(() =>
      applyMessageEngineCorrections(sound, [{ ...optionalDelay, fields: ["gain"] }]),
    ).toThrow(/already optional.*delete the correction/);
    expect(() =>
      applyMessageEngineCorrections(sound, [
        { ...requiredPlayId, name: "play_sound", fields: ["delay"] },
      ]),
    ).toThrow(/already required.*delete the correction/);
    expect(() =>
      applyMessageEngineCorrections(sound, [{ ...addPan, fields: [{ ...pan, name: "gain" }] }]),
    ).toThrow(/already declares field gain.*delete the correction/);
    expect(() =>
      applyMessageEngineCorrections(sound, [{ ...addSetPan, name: "play_sound" }]),
    ).toThrow(/already declares message.*delete the correction/);
  });

  test("throws when a correction targets a message or field the catalog lacks", () => {
    expect(() => applyMessageEngineCorrections({ entries: [] }, [optionalDelay])).toThrow(
      /no catalog message matches/,
    );
    expect(() =>
      applyMessageEngineCorrections(sound, [{ ...optionalDelay, fields: ["speed"] }]),
    ).toThrow(/no catalog field matches/);
  });

  describe("retype", () => {
    const collision: MessageCatalog = {
      entries: [
        {
          name: "collision_event",
          origin: "physics",
          description: "",
          payload: [
            { name: "a", types: ["table"], optional: false, doc: "" },
            { name: "b", types: ["table"], optional: false, doc: "" },
          ],
        },
      ],
    };
    const body = "{ id: Hash; group: Hash }";
    const retypeA: MessageEngineCorrection = {
      kind: "retype",
      origin: "physics",
      name: "collision_event",
      fields: ["a"],
      tsType: body,
      upstream: ["table"],
      evidence: "test",
    };

    test("replaces only the named field's type with its tsType", () => {
      const out = applyMessageEngineCorrections(collision, [retypeA]);
      expect(out.entries[0]?.payload.map((field) => [field.name, field.types])).toEqual([
        ["a", [body]],
        ["b", ["table"]],
      ]);
      expect(collision.entries[0]?.payload[0]?.types).toEqual(["table"]);
      const emitted = emitBuiltinMessages(out);
      expect(emitted).toContain(
        `collision_event: { a: ${body}; b: Record<string | number, unknown> };`,
      );
      expect(emitted).toContain('import type { Hash } from "../src/core-types";');
    });

    test("throws once the catalog's field types differ from the pinned upstream", () => {
      const retyped: MessageCatalog = {
        entries: [
          {
            name: "collision_event",
            origin: "physics",
            description: "",
            payload: [{ name: "a", types: ["physics.collision_info"], optional: false, doc: "" }],
          },
        ],
      };
      expect(() => applyMessageEngineCorrections(retyped, [retypeA])).toThrow(
        /now declares physics\.collision_info for field a.*re-verify the correction/,
      );
      expect(() =>
        applyMessageEngineCorrections(collision, [{ ...retypeA, fields: ["c"] }]),
      ).toThrow(/no catalog field matches/);
    });
  });

  test("every committed correction matches the committed catalog and names its engine evidence", () => {
    expect(MESSAGE_ENGINE_CORRECTIONS.length).toBeGreaterThan(0);
    for (const correction of MESSAGE_ENGINE_CORRECTIONS) {
      expect(correction.evidence).toMatch(/^[\w/.]+\.(cpp|proto):\w+ /);
    }
    const base = applyMessageFieldCorrections(
      applyMessageDeprecations(parseMessagesDoc(messagesDoc)),
    );
    expect(() => applyMessageEngineCorrections(base)).not.toThrow();
  });
});
