import { DEFOLD_TYPE_MAP } from "./core-types";
import { type CorrectionPins, pinnedEntryApplies } from "./engine-pin";

export interface MessageField {
  name: string;
  types: string[];
  optional: boolean;
  doc: string;
  // The `<ns>.<GROUP>` constant group the field holds a member of, set by
  // `MESSAGE_FIELD_CONSTANT_GROUPS`. The emit spells it by the target's alias.
  group?: string;
}

export interface MessageEntry {
  name: string;
  origin: string;
  description: string;
  payload: MessageField[];
  deprecatedSince?: string;
}

export interface MessageCatalog {
  entries: MessageEntry[];
}

export interface MessageDeprecation {
  origin: string;
  name: string;
  deprecatedSince: string;
}

// Messages sit outside the typed identity surface (no MESSAGE kind in
// ApiSymbolIdentity / the availability matrix), and the per-version message
// fixtures are incomplete, so message deprecations cannot be derived like member
// deprecations. This is the smallest curated overlay: only evidence-backed
// entries, matched by the stable (origin, name) identity, failing closed.
export const MESSAGE_DEPRECATIONS: readonly MessageDeprecation[] = [
  { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
  { origin: "camera", name: "release_camera_focus", deprecatedSince: "1.13.0" },
];

// Stamp deprecatedSince onto the catalog entries the overlay names, keyed by
// exact (origin, name). The identity index nests name under origin so origin and
// name never share a delimiter — no separator byte can forge or collide two
// distinct identities. A duplicate catalog identity, a duplicate overlay
// identity, or an overlay entry that matches no catalog message each throws
// rather than silently overwriting or no-op'ing, so an ambiguous surface or a
// stale curation cannot pass unnoticed.
export function applyMessageDeprecations(
  catalog: MessageCatalog,
  overlay: readonly MessageDeprecation[] = MESSAGE_DEPRECATIONS,
): MessageCatalog {
  const entries = catalog.entries.map((entry) => ({ ...entry }));
  const byIdentity = new Map<string, Map<string, MessageEntry>>();
  for (const entry of entries) {
    let byName = byIdentity.get(entry.origin);
    if (!byName) {
      byName = new Map<string, MessageEntry>();
      byIdentity.set(entry.origin, byName);
    }
    if (byName.has(entry.name)) {
      throw new Error(
        `applyMessageDeprecations: duplicate catalog message identity (origin=${entry.origin}, name=${entry.name})`,
      );
    }
    byName.set(entry.name, entry);
  }
  const seenOverlay = new Map<string, Set<string>>();
  for (const dep of overlay) {
    let names = seenOverlay.get(dep.origin);
    if (!names) {
      names = new Set<string>();
      seenOverlay.set(dep.origin, names);
    }
    if (names.has(dep.name)) {
      throw new Error(
        `applyMessageDeprecations: duplicate overlay message identity (origin=${dep.origin}, name=${dep.name})`,
      );
    }
    names.add(dep.name);
    const entry = byIdentity.get(dep.origin)?.get(dep.name);
    if (!entry) {
      throw new Error(
        `applyMessageDeprecations: no catalog message matches (origin=${dep.origin}, name=${dep.name})`,
      );
    }
    entry.deprecatedSince = dep.deprecatedSince;
  }
  return { entries };
}

// A payload field whose documented type the engine refuses, with the type it
// takes instead. `upstream` is the documented type the correction replaces:
// once the catalog stops declaring it the entry throws and is deleted. An entry
// carries one of `CorrectionPins`.
export interface MessageFieldCorrection extends CorrectionPins {
  readonly origin: string;
  readonly name: string;
  readonly field: string;
  readonly types: readonly string[];
  readonly upstream: readonly string[];
  readonly reason: string;
}

const CAMERA_DDF = "gamesys/proto/gamesys/camera_ddf.proto";

// The ledger key of an entry naming one payload field, `<origin>.<name>:<field>`.
export function messageFieldKey(entry: {
  readonly origin: string;
  readonly name: string;
  readonly field: string;
}): string {
  return `${entry.origin}.${entry.name}:${entry.field}`;
}

// Demonstrated by the engine probe only: each entry is a payload the running
// engine rejected when it held the documented type.
export const MESSAGE_FIELD_CORRECTIONS: readonly MessageFieldCorrection[] = [
  {
    origin: "camera",
    name: "set_camera",
    field: "orthographic_projection",
    types: ["number"],
    upstream: ["boolean"],
    reason:
      "the engine decodes the payload into a number field and raises `number expected, got boolean` for the documented boolean",
    engine: [
      {
        file: CAMERA_DDF,
        contains: "optional uint32 orthographic_projection = 5 [default = 0];",
      },
    ],
  },
];

export function applyMessageFieldCorrections(
  catalog: MessageCatalog,
  bindingEvidence: ReadonlySet<string>,
  overlay: readonly MessageFieldCorrection[] = MESSAGE_FIELD_CORRECTIONS,
): MessageCatalog {
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    payload: entry.payload.map((field) => ({ ...field })),
  }));
  for (const correction of overlay) {
    const key = messageFieldKey(correction);
    if (!pinnedEntryApplies("MESSAGE_FIELD_CORRECTIONS", key, correction, bindingEvidence)) {
      continue;
    }
    const field = entries
      .find((entry) => entry.origin === correction.origin && entry.name === correction.name)
      ?.payload.find((candidate) => candidate.name === correction.field);
    const identity = `(origin=${correction.origin}, name=${correction.name}, field=${correction.field})`;
    if (field === undefined) {
      throw new Error(`applyMessageFieldCorrections: no catalog field matches ${identity}`);
    }
    if (field.types.join("|") !== correction.upstream.join("|")) {
      throw new Error(
        `applyMessageFieldCorrections: upstream now declares ${field.types.join("|")} for ${identity}; delete the correction`,
      );
    }
    field.types = [...correction.types];
  }
  return { entries };
}

// A payload field the reference types `number` while it holds a member of one
// constant group. `upstream` is the catalog's type for it: once the catalog
// stops declaring it the entry throws and is re-verified against the new type.
// An entry carries one of `CorrectionPins`; its ref-doc element is the message.
export interface MessageFieldConstantGroup extends CorrectionPins {
  readonly origin: string;
  readonly name: string;
  readonly field: string;
  readonly group: string;
  readonly upstream: readonly string[];
  readonly reason: string;
}

export const MESSAGE_FIELD_CONSTANT_GROUPS: readonly MessageFieldConstantGroup[] = [
  {
    origin: "collectionproxy",
    name: "set_time_step",
    field: "mode",
    group: "collectionproxy.TIME_STEP_MODE",
    upstream: ["number"],
    reason:
      "the reference documents 0 for continuous and 1 for discrete, the two values collectionproxy.TIME_STEP_MODE declares",
    refDoc: { contains: "time-step mode: 0 for continuous and 1 for discrete" },
  },
  {
    origin: "camera",
    name: "set_camera",
    field: "orthographic_mode",
    group: "camera.ORTHO_MODE",
    upstream: ["number"],
    reason:
      "the field selects the orthographic zoom mode the camera.ORTHO_MODE constants name, the value camera.set_orthographic_mode takes",
    engine: [
      {
        file: CAMERA_DDF,
        contains: "optional OrthoZoomMode orthographic_mode = 7 [default = ORTHO_MODE_FIXED];",
      },
    ],
  },
  {
    origin: "model",
    name: "model_animation_done",
    field: "playback",
    group: "go.PLAYBACK",
    upstream: ["number"],
    reason:
      "script_model.cpp copies the completed animation's rig playback into the message, the go.PLAYBACK value model.play_anim received",
    binding: {
      file: "gamesys/src/gamesys/scripts/script_model.cpp",
      cFunction: "ScriptModelAnimationCallback",
      contains:
        "message.m_AnimationId = data->m_AnimationId; message.m_Playback = data->m_Playback;",
    },
  },
];

export function applyMessageFieldConstantGroups(
  catalog: MessageCatalog,
  bindingEvidence: ReadonlySet<string>,
  overlay: readonly MessageFieldConstantGroup[] = MESSAGE_FIELD_CONSTANT_GROUPS,
): MessageCatalog {
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    payload: entry.payload.map((field) => ({ ...field })),
  }));
  for (const grouped of overlay) {
    const key = messageFieldKey(grouped);
    if (!pinnedEntryApplies("MESSAGE_FIELD_CONSTANT_GROUPS", key, grouped, bindingEvidence)) {
      continue;
    }
    const field = entries
      .find((entry) => entry.origin === grouped.origin && entry.name === grouped.name)
      ?.payload.find((candidate) => candidate.name === grouped.field);
    const identity = `(origin=${grouped.origin}, name=${grouped.name}, field=${grouped.field})`;
    if (field === undefined) {
      throw new Error(`applyMessageFieldConstantGroups: no catalog field matches ${identity}`);
    }
    if (field.types.join("|") !== grouped.upstream.join("|")) {
      throw new Error(
        `applyMessageFieldConstantGroups: upstream now declares ${field.types.join("|")} for ${identity}; re-verify the group`,
      );
    }
    field.group = grouped.group;
  }
  return { entries };
}

// What only the engine states about a message the catalog mirrors from the
// reference: proto optionality, a field the handler reads or the sender fills,
// a message a component handles or posts, or the shape of a field the reference
// types only as `table`. `evidence` names `<path>:<symbol>` in the 1.14.1 engine
// source. Each kind throws once the catalog already states its fact, since that
// means upstream fixed the reference and the entry is deleted; a `retype` throws
// once the catalog stops declaring its pinned `upstream` types, since upstream
// retyped the field and the entry is re-verified against what it now says.
//
// A `retype`, `add-field` or `add-message` entry carries one of
// `CorrectionPins`, under the ledger key `messageEngineCorrectionKey` gives.
export type MessageEngineCorrection = CorrectionPins & {
  readonly origin: string;
  readonly name: string;
  readonly evidence: string;
} & (
    | { readonly kind: "optional" | "required"; readonly fields: readonly string[] }
    | { readonly kind: "add-field"; readonly fields: readonly MessageField[] }
    | {
        readonly kind: "add-message";
        readonly description: string;
        readonly fields: readonly MessageField[];
      }
    | {
        readonly kind: "retype";
        readonly fields: readonly string[];
        readonly tsType: string;
        readonly upstream: readonly string[];
      }
  );

const SCRIPT_DDF_DEFAULTS =
  "script/src/script_ddf.cpp:DoLuaTableToDDF fills an omitted optional field with its default";
const SOUND_EVENT =
  "gamesys/src/gamesys/components/comp_sound.cpp:DispatchSoundEvent always sets play_id, and HandleEntryFinishedPlaying sends the event only for a play_sound that supplied one";

const GAMESYS_DDF = "gamesys/proto/gamesys/gamesys_ddf.proto";
const PHYSICS_DDF = "gamesys/proto/gamesys/physics_ddf.proto";

function physicsEventPush(cFunction: string, body: string): CorrectionPins {
  return {
    binding: {
      file: "gamesys/src/gamesys/scripts/script_physics.cpp",
      cFunction,
      contains: `dmScript::PushHash(L, ${body}->m_Group);`,
    },
  };
}

function protoPin(file: string, contains: string): CorrectionPins {
  return { engine: [{ file, contains }] };
}

// The ledger key of an entry, `<origin>.<name>:<kind>`.
export function messageEngineCorrectionKey(correction: MessageEngineCorrection): string {
  return `${correction.origin}.${correction.name}:${correction.kind}`;
}

function optionalField(name: string, types: string[], doc: string): MessageField {
  return { name, types, optional: true, doc };
}

function requiredField(name: string, types: string[], doc: string): MessageField {
  return { name, types, optional: false, doc };
}

// The listener and `on_message` paths agree: the DDF the message carries
// declares the same sub-message fields the listener push sets.
function physicsBody(message: string): string {
  return `gamesys/proto/gamesys/physics_ddf.proto:${message} declares the same required fields for the on_message payload`;
}

function otherGroupField(): MessageField {
  return {
    name: "group",
    types: ["hash"],
    optional: false,
    doc: "Collision group of the other object, equal to other_group.",
  };
}

export const MESSAGE_ENGINE_CORRECTIONS: readonly MessageEngineCorrection[] = [
  {
    kind: "optional",
    origin: "camera",
    name: "set_camera",
    fields: ["orthographic_projection", "orthographic_zoom", "orthographic_mode"],
    evidence: `gamesys/proto/gamesys/camera_ddf.proto:SetCamera declares them optional with defaults, CompCameraOnMessage handles it, and ${SCRIPT_DDF_DEFAULTS}`,
  },
  {
    kind: "optional",
    origin: "sys",
    name: "reboot",
    fields: ["arg1", "arg2", "arg3", "arg4", "arg5", "arg6", "arg7", "arg8"],
    evidence: `script/src/script/sys_ddf.proto:Reboot declares every argument optional, engine/src/engine.cpp:Dispatch handles it, and ${SCRIPT_DDF_DEFAULTS}`,
  },
  {
    kind: "optional",
    origin: "sprite",
    name: "play_animation",
    fields: ["offset", "playback_rate"],
    evidence: `gamesys/proto/gamesys/sprite_ddf.proto:PlayAnimation declares both optional with defaults 0 and 1, comp_sprite.cpp:CompSpriteOnMessage passes both to PlayAnimation, and ${SCRIPT_DDF_DEFAULTS}`,
  },
  {
    kind: "optional",
    origin: "go",
    name: "set_parent",
    fields: ["parent_id", "keep_world_transform"],
    evidence: `gameobject/proto/gameobject/gameobject_ddf.proto:SetParent declares both optional with defaults 0 and 1, gameobject.cpp:DispatchMessagesFunction handles it, and ${SCRIPT_DDF_DEFAULTS}`,
  },
  {
    kind: "required",
    origin: "sound",
    name: "sound_done",
    fields: ["play_id"],
    evidence: SOUND_EVENT,
  },
  {
    kind: "required",
    origin: "sound",
    name: "sound_stopped",
    fields: ["play_id"],
    evidence: SOUND_EVENT,
  },
  {
    kind: "add-field",
    origin: "sound",
    name: "play_sound",
    fields: [
      optionalField("pan", ["number"], "Pan between -1 and 1, added to the component's pan."),
      optionalField("speed", ["number"], "Speed factor, multiplied with the component's speed."),
    ],
    evidence:
      "gamesys/proto/gamesys/gamesys_ddf.proto:PlaySound declares pan and speed, and comp_sound.cpp:CompSoundOnMessage applies both to the voice",
    ...protoPin(
      GAMESYS_DDF,
      "message PlaySound { optional float delay = 1 [default=0.0]; optional float gain = 2 [default=1.0]; optional float pan = 3 [default=0.0]; optional float speed = 4 [default=1.0];",
    ),
  },
  {
    kind: "add-field",
    origin: "sound",
    name: "stop_sound",
    fields: [
      optionalField(
        "play_id",
        ["number"],
        "Id passed to play_sound; stops only that voice. Omit to stop every voice.",
      ),
    ],
    evidence:
      "gamesys/proto/gamesys/gamesys_ddf.proto:StopSound declares play_id, and comp_sound.cpp:CompSoundOnMessage stops only the voice that matches it",
    ...protoPin(
      GAMESYS_DDF,
      "message StopSound { optional uint32 play_id = 1 [default=0xffffffff];",
    ),
  },
  {
    kind: "add-message",
    origin: "sound",
    name: "pause_sound",
    description: "Pause or resume every voice the receiving sound component plays.",
    fields: [optionalField("pause", ["boolean"], "true (default) to pause, false to resume.")],
    evidence:
      "gamesys/proto/gamesys/gamesys_ddf.proto:PauseSound declares pause, and comp_sound.cpp:CompSoundOnMessage pauses every voice of the component",
    ...protoPin(GAMESYS_DDF, "message PauseSound { optional bool pause = 1 [default=true]; }"),
  },
  {
    kind: "add-message",
    origin: "render",
    name: "set_view_projection",
    description:
      "Posted automatically by camera components to the render script with the active view and projection matrices.",
    fields: [
      requiredField("id", ["hash"], "Id of the camera component that posted the matrices."),
      requiredField("view", ["matrix4"], "View matrix of the camera."),
      requiredField("projection", ["matrix4"], "Projection matrix of the camera."),
    ],
    evidence:
      "gamesys/proto/gamesys/gamesys_ddf.proto:SetViewProjection declares id, view and projection required, and comp_camera.cpp:PostRenderScriptSetViewProjectionMsg posts it to the render socket on every camera update",
    ...protoPin(
      GAMESYS_DDF,
      "message SetViewProjection { required uint64 id = 1; required dmMath.Matrix4 view = 2; required dmMath.Matrix4 projection = 3; }",
    ),
  },
  {
    kind: "add-field",
    origin: "physics",
    name: "collision_response",
    fields: [otherGroupField()],
    evidence:
      "gamesys/proto/gamesys/physics_ddf.proto:CollisionResponse declares a required group, and comp_collision_object.cpp:CollisionCallback sets it to the other object's group",
    ...protoPin(
      PHYSICS_DDF,
      "message CollisionResponse { required uint64 other_id = 1; required uint64 group = 2;",
    ),
  },
  {
    kind: "add-field",
    origin: "physics",
    name: "contact_point_response",
    fields: [otherGroupField()],
    evidence:
      "gamesys/proto/gamesys/physics_ddf.proto:ContactPointResponse declares a required group, and comp_collision_object.cpp:ContactPointCallback sets it to the other object's group",
    ...protoPin(
      PHYSICS_DDF,
      "required uint64 other_id = 9; required dmMath.Point3 other_position = 10; required uint64 group = 11;",
    ),
  },
  {
    kind: "add-field",
    origin: "physics",
    name: "trigger_response",
    fields: [otherGroupField()],
    evidence:
      "gamesys/proto/gamesys/physics_ddf.proto:TriggerResponse declares a required group, and comp_collision_object.cpp:TriggerEnteredCallback sets it to the other object's group",
    ...protoPin(
      PHYSICS_DDF,
      "message TriggerResponse { required uint64 other_id = 1; required bool enter = 2; required uint64 group = 3;",
    ),
  },
  {
    kind: "retype",
    origin: "physics",
    name: "contact_point_event",
    fields: ["a", "b"],
    tsType:
      "{ position: Vector3; instance_position: Vector3; normal: Vector3; relative_velocity: Vector3; mass: number; id: Hash; group: Hash }",
    upstream: ["table"],
    evidence: `gamesys/src/gamesys/scripts/script_physics.cpp:PushContactPoint sets these seven fields on each body, and ${physicsBody("ContactPoint")}`,
    ...physicsEventPush("PushContactPoint", "point"),
  },
  {
    kind: "retype",
    origin: "physics",
    name: "collision_event",
    fields: ["a", "b"],
    tsType: "{ position: Vector3; id: Hash; group: Hash }",
    upstream: ["table"],
    evidence: `gamesys/src/gamesys/scripts/script_physics.cpp:PushCollision sets these three fields on each body, and ${physicsBody("Collision")}`,
    ...physicsEventPush("PushCollision", "collision"),
  },
  {
    kind: "retype",
    origin: "physics",
    name: "trigger_event",
    fields: ["a", "b"],
    tsType: "{ id: Hash; group: Hash }",
    upstream: ["table"],
    evidence: `gamesys/src/gamesys/scripts/script_physics.cpp:PushTrigger sets these two fields on each body, and ${physicsBody("Trigger")}`,
    ...physicsEventPush("PushTrigger", "trigger"),
  },
];

export function applyMessageEngineCorrections(
  catalog: MessageCatalog,
  bindingEvidence: ReadonlySet<string>,
  overlay: readonly MessageEngineCorrection[] = MESSAGE_ENGINE_CORRECTIONS,
): MessageCatalog {
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    payload: entry.payload.map((field) => ({ ...field })),
  }));
  for (const correction of overlay) {
    const key = messageEngineCorrectionKey(correction);
    if (!pinnedEntryApplies("MESSAGE_ENGINE_CORRECTIONS", key, correction, bindingEvidence)) {
      continue;
    }
    const identity = `(origin=${correction.origin}, name=${correction.name})`;
    const stale = (fact: string) =>
      new Error(
        `applyMessageEngineCorrections: the catalog ${fact} for ${identity}; delete the correction`,
      );
    const entry = entries.find(
      (candidate) => candidate.origin === correction.origin && candidate.name === correction.name,
    );
    if (correction.kind === "add-message") {
      if (entry) throw stale("already declares message");
      entries.push({
        name: correction.name,
        origin: correction.origin,
        description: correction.description,
        payload: correction.fields.map((field) => ({ ...field, types: [...field.types] })),
      });
      continue;
    }
    if (!entry) {
      throw new Error(`applyMessageEngineCorrections: no catalog message matches ${identity}`);
    }
    if (correction.kind === "add-field") {
      for (const field of correction.fields) {
        if (entry.payload.some((candidate) => candidate.name === field.name)) {
          throw stale(`already declares field ${field.name}`);
        }
        entry.payload.push({ ...field, types: [...field.types] });
      }
      continue;
    }
    for (const name of correction.fields) {
      const field = entry.payload.find((candidate) => candidate.name === name);
      if (!field) {
        throw new Error(
          `applyMessageEngineCorrections: no catalog field matches ${identity} field=${name}`,
        );
      }
      if (correction.kind === "retype") {
        if (field.types.join("|") !== correction.upstream.join("|")) {
          throw new Error(
            `applyMessageEngineCorrections: the catalog now declares ${field.types.join("|")} for field ${name} of ${identity}, not the pinned ${correction.upstream.join("|")}; re-verify the correction`,
          );
        }
        field.types = [correction.tsType];
        continue;
      }
      const optional = correction.kind === "optional";
      if (field.optional === optional) throw stale(`field ${name} is already ${correction.kind}`);
      field.optional = optional;
    }
  }
  return { entries };
}

// The built-in message surface is the catalog plus these overlays, each entry
// resting on the engine source applied only where `bindingEvidence` shows its
// pin. Every reader of it goes through here, so a message the engine overlay
// adds is never missing from one of them.
export function applyMessageOverlays(
  catalog: MessageCatalog,
  bindingEvidence: ReadonlySet<string>,
): MessageCatalog {
  return applyMessageEngineCorrections(
    applyMessageFieldConstantGroups(
      applyMessageFieldCorrections(applyMessageDeprecations(catalog), bindingEvidence),
      bindingEvidence,
    ),
    bindingEvidence,
  );
}

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ENGINE_TYPES = [
  "Hash",
  "Matrix4",
  "Quaternion",
  "Url",
  "Vector",
  "Vector3",
  "Vector4",
] as const;

export function parseMessagesDoc(raw: unknown): MessageCatalog {
  if (!isRecord(raw)) {
    throw new Error(`parseMessagesDoc: expected object, got ${describeKind(raw)}`);
  }
  const rawMessages = raw.messages;
  if (!Array.isArray(rawMessages)) {
    throw new Error(`parseMessagesDoc: missing or invalid "messages" array`);
  }
  const entries: MessageEntry[] = [];
  for (const item of rawMessages) {
    if (!isRecord(item)) continue;
    const name = stringOr(item.name, "");
    if (name === "") continue;
    entries.push({
      name,
      origin: stringOr(item.origin, ""),
      description: stringOr(item.description, ""),
      payload: parsePayload(item.payload),
    });
  }
  return { entries };
}

function parsePayload(raw: unknown): MessageField[] {
  if (!Array.isArray(raw)) return [];
  const fields: MessageField[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = stringOr(item.name, "");
    if (name === "") continue;
    const typesRaw = item.types;
    const types = Array.isArray(typesRaw)
      ? typesRaw.filter((t): t is string => typeof t === "string")
      : [];
    fields.push({
      name,
      types,
      optional: item.optional === true,
      doc: stringOr(item.doc, ""),
    });
  }
  return fields;
}

export interface EmitBuiltinMessagesOptions {
  // Where the brand types are reached from. Defaults to the committed
  // `generated/` emit's sibling-relative path; a materialized surface has no
  // `src/` above it and supplies its own surface-root specifier.
  readonly importsFrom?: string;
  // The TS spelling of each constant group the target declares, keyed
  // `<ns>.<GROUP>` (`constantGroupSpellings`). A field whose group the target
  // does not declare keeps its token's type.
  readonly groupSpellings?: ReadonlyMap<string, string>;
}

export function emitBuiltinMessages(
  catalog: MessageCatalog,
  opts: EmitBuiltinMessagesOptions = {},
): string {
  const entries = [...catalog.entries].sort((a, b) => a.name.localeCompare(b.name));
  const body = entries.map((entry) => emitEntry(entry, opts.groupSpellings)).join("\n");
  const inner = [
    "declare global {",
    "  interface BuiltinMessages {",
    body,
    "  }",
    "  type BuiltinMessageId = keyof BuiltinMessages;",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
  const used = collectEngineTypes(inner);
  const importsFrom = opts.importsFrom ?? "../src/core-types";
  const importLine =
    used.length === 0 ? "" : `import type { ${used.join(", ")} } from "${importsFrom}";\n\n`;
  return `${importLine}${inner}`;
}

function emitEntry(
  entry: MessageEntry,
  groupSpellings: ReadonlyMap<string, string> | undefined,
): string {
  const key = TS_IDENTIFIER.test(entry.name) ? entry.name : JSON.stringify(entry.name);
  const prefix = entry.deprecatedSince
    ? `    /** @deprecated since ${entry.deprecatedSince} */\n`
    : "";
  if (entry.payload.length === 0) {
    return `${prefix}    ${key}: Record<string, never>;`;
  }
  const fields = entry.payload.map((field) => emitField(field, groupSpellings)).join("; ");
  return `${prefix}    ${key}: { ${fields} };`;
}

function emitField(
  field: MessageField,
  groupSpellings: ReadonlyMap<string, string> | undefined,
): string {
  const name = TS_IDENTIFIER.test(field.name) ? field.name : JSON.stringify(field.name);
  const optional = field.optional ? "?" : "";
  const grouped = field.group === undefined ? undefined : groupSpellings?.get(field.group);
  const ts = grouped ?? (field.types.length === 0 ? "unknown" : unionFromTokens(field.types));
  return `${name}${optional}: ${ts}`;
}

function unionFromTokens(tokens: readonly string[]): string {
  const seen = new Set<string>();
  const mapped: string[] = [];
  for (const token of tokens) {
    const ts = mapToken(token);
    if (seen.has(ts)) continue;
    seen.add(ts);
    mapped.push(ts);
  }
  return mapped.join(" | ");
}

function mapToken(token: string): string {
  if (Object.hasOwn(DEFOLD_TYPE_MAP, token)) {
    const mapped = DEFOLD_TYPE_MAP[token];
    if (typeof mapped === "string") return mapped;
  }
  return token;
}

function collectEngineTypes(emitted: string): string[] {
  return ENGINE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(emitted));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function describeKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
