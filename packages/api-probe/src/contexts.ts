import { readBindingsForTarget } from "../../types/scripts/engine-binding-extract";

export type ScriptKind = "go" | "gui" | "render";

export const SCRIPT_KINDS: readonly ScriptKind[] = ["go", "gui", "render"];

// Absolute addresses, so a url resolves the same from the go, gui and render
// scripts. Every one names a component or object in `project/main`, or one of
// the engine's own sockets.
export const PROBE_URLS: Readonly<Record<string, string>> = {
  RENDER: "@render:",
  SYSTEM: "@system:",
  GO: "main:/probe",
  SCRIPT: "main:/probe#script",
  SPRITE: "main:/probe#sprite",
  // A sprite whose material declares the `tints[4]` array constant.
  TINTED: "main:/probe#tinted",
  MODEL: "main:/probe#model",
  LABEL: "main:/probe#label",
  MESH: "main:/probe#mesh",
  PARTICLEFX: "main:/probe#particlefx",
  SOUND: "main:/probe#sound",
  TILEMAP: "main:/probe#tilemap",
  CAMERA: "main:/probe#camera",
  FACTORY: "main:/probe#factory",
  COLLECTIONFACTORY: "main:/probe#collectionfactory",
  PROXY: "main:/probe#proxy",
  // A proxy no function probe loads, for the message probes' load cycle.
  LOADER: "main:/probe#loader",
  COLLISION: "main:/probe#collision",
  GUI: "main:/probe#gui",
  PEER: "main:/peer",
  PEER_COLLISION: "main:/peer#collision",
  WRECK_COLLISION: "main:/wreck#collision",
  // A static body of three fixtures, box, sphere and box, for the index probes.
  TRIO_COLLISION: "main:/probe#trio",
  VICTIM: "main:/victim",
};

// The engine links one Box2D backend per build. The stock engine is v2; the v3
// pass runs on an engine built from `box2d-v3.appmanifest`.
export type Box2DBackend = "v2" | "v3";

export const BOX2D_BACKENDS: readonly Box2DBackend[] = ["v2", "v3"];

// The backends whose binding files register each `b2d` function: the shared
// `script_box2d.cpp` registers for both, `v2/` and `v3/` for their own.
export function box2dBackends(targetId: string): Map<string, Set<Box2DBackend>> {
  const tags = new Map<string, Set<Box2DBackend>>();
  for (const binding of readBindingsForTarget(targetId).functions) {
    if (binding.namespace !== "b2d" && !binding.namespace.startsWith("b2d.")) continue;
    const backends: Box2DBackend[] = binding.file.includes("/v2/")
      ? ["v2"]
      : binding.file.includes("/v3/")
        ? ["v3"]
        : ["v2", "v3"];
    const fqn = `${binding.namespace}.${binding.name}`;
    const set = tags.get(fqn) ?? new Set<Box2DBackend>();
    for (const backend of backends) set.add(backend);
    tags.set(fqn, set);
  }
  return tags;
}

// Every non-`b2d` namespace, and a `b2d` function no binding registers, runs in
// the v2 pass only.
export function runsOn(
  fqn: string,
  backend: Box2DBackend,
  tags: ReadonlyMap<string, ReadonlySet<Box2DBackend>>,
): boolean {
  if (!fqn.startsWith("b2d.")) return backend === "v2";
  return tags.get(fqn)?.has(backend) ?? backend === "v2";
}

export interface ProbeContext {
  readonly kind: ScriptKind;
  // The `PROBE_URLS` name a url slot of this namespace receives.
  readonly url: string;
}

const GO_CONTEXT: ProbeContext = { kind: "go", url: "GO" };

const CONTEXTS: Readonly<Record<string, ProbeContext>> = {
  gui: { kind: "gui", url: "GUI" },
  render: { kind: "render", url: "CAMERA" },
  // Registered in the render script's Lua state only.
  camera: { kind: "render", url: "CAMERA" },
  collectionfactory: { kind: "go", url: "COLLECTIONFACTORY" },
  collectionproxy: { kind: "go", url: "PROXY" },
  factory: { kind: "go", url: "FACTORY" },
  label: { kind: "go", url: "LABEL" },
  model: { kind: "go", url: "MODEL" },
  particlefx: { kind: "go", url: "PARTICLEFX" },
  physics: { kind: "go", url: "COLLISION" },
  sound: { kind: "go", url: "SOUND" },
  sprite: { kind: "go", url: "SPRITE" },
  tilemap: { kind: "go", url: "TILEMAP" },
};

export function contextFor(namespace: string): ProbeContext {
  if (namespace === "b2d" || namespace.startsWith("b2d.")) {
    return { kind: "go", url: "COLLISION" };
  }
  return CONTEXTS[namespace] ?? GO_CONTEXT;
}

// The `PROBE_URLS` component whose type owns each `<ns>.properties` catalog.
// Every property is read from the go script, the gui component's included.
export const PROPERTY_TARGETS: Readonly<Record<string, string>> = {
  go: "GO",
  sprite: "SPRITE",
  model: "MODEL",
  label: "LABEL",
  sound: "SOUND",
  particlefx: "PARTICLEFX",
  tilemap: "TILEMAP",
  camera: "CAMERA",
  physics: "COLLISION",
  mesh: "MESH",
  gui: "GUI",
};

// The options a catalog member needs to address one resource of its component,
// keyed `<ns>.<member>`: a resource of `project/main/probe.gui`, or the emitter
// of `project/main/probe.particlefx`.
export const PROPERTY_OPTIONS: Readonly<Record<string, string>> = {
  "gui.fonts": '{ key: "default" }',
  "gui.materials": '{ key: "probe" }',
  "gui.textures": '{ key: "probe" }',
  "particlefx.animation": '{ keys: ["emitter"] }',
  "particlefx.image": '{ keys: ["emitter"] }',
  "particlefx.material": '{ keys: ["emitter"] }',
};

// Constants the engine registers only when the host supports them, keyed by an
// FQN prefix with the reason. The probe checks such a constant's kind when the
// engine defines it, so the result does not depend on the machine it runs on.
export const CONDITIONAL_CONSTANTS: Readonly<Record<string, string>> = {
  "graphics.TEXTURE_FORMAT_":
    "script_graphics.cpp registers a texture format only when the graphics adapter supports it",
};

// The `PROBE_URLS` receiver of each built-in message's ref-doc namespace.
export const MESSAGE_ORIGINS: Readonly<Record<string, string>> = {
  go: "GO",
  sprite: "SPRITE",
  model: "MODEL",
  physics: "COLLISION",
  collectionproxy: "LOADER",
  sound: "SOUND",
  render: "RENDER",
  gui: "GUI",
  camera: "CAMERA",
  sys: "SYSTEM",
};

// Calls that delete the probe object, keyed `<fn>:<variant>`. The go script
// makes them once its message queue drained, in the frame it reports, since
// every later message needs the object's components.
export const FINAL_CALLS: ReadonlySet<string> = new Set(["go.delete:required"]);

// Messages whose receiver is not their namespace's: `enable` and `disable` go
// to a component, and a force or a new parent goes to a dynamic peer so the
// probe object's static body stays where the collision checks expect it.
export const MESSAGE_RECEIVERS: Readonly<Record<string, string>> = {
  enable: "SPRITE",
  disable: "SPRITE",
  apply_force: "PEER_COLLISION",
  set_parent: "PEER",
};

// Payload fields whose witness must name something real or keep the run going,
// keyed `<message>.<field>`.
export const MESSAGE_FIELD_OVERRIDES: Readonly<Record<string, string>> = {
  "play_animation.id": 'hash("anim")',
  "set_parent.parent_id": 'hash("/wreck")',
  // A frame cap of one would stretch the rest of the run to one frame a second.
  "set_update_frequency.frequency": "60",
  "resize.width": "320",
  "resize.height": "240",
};

const BODIES = "b2d.get_body(COLLISION)!, b2d.get_body(PEER_COLLISION)!";
const REVOLUTE = `b2d.joint.create_revolute(${BODIES})`;

// The joint type each typed `b2d.joint` accessor requires, and the joint of that
// type it receives instead of the revolute handle witness.
const JOINT_ACCESSORS: Readonly<Record<string, readonly string[]>> = {
  [`b2d.joint.create_distance(${BODIES})`]: [
    "get_damping_ratio",
    "get_frequency",
    "get_hertz",
    "get_length",
    "get_spring_damping_ratio",
    "set_damping_ratio",
    "set_frequency",
    "set_hertz",
    "set_length",
    "set_spring_damping_ratio",
    "get_current_length",
    "get_min_length",
    "set_length_range",
    "set_min_length",
  ],
  [`b2d.joint.create_friction(${BODIES})`]: ["get_max_torque", "set_max_torque"],
  [`b2d.joint.create_gear(${REVOLUTE}, b2d.joint.create_revolute(b2d.get_body(COLLISION)!, b2d.get_body(WRECK_COLLISION)!))`]:
    ["get_joint1", "get_joint2", "set_ratio"],
  [`b2d.joint.create_mouse(${BODIES})`]: [
    "get_max_force",
    "get_mouse_target",
    "set_max_force",
    "set_mouse_target",
  ],
  [`b2d.joint.create_prismatic(${BODIES})`]: [
    "get_joint_speed",
    "get_joint_translation",
    "get_local_axis_a",
    "get_max_motor_force",
    "get_motor_force",
    "set_max_motor_force",
  ],
  [`b2d.joint.create_pulley(${BODIES})`]: [
    "get_ground_anchor_a",
    "get_ground_anchor_b",
    "get_length_a",
    "get_length_b",
    "get_ratio",
  ],
  [`b2d.joint.create_rope(${BODIES})`]: ["get_limit_state", "get_max_length", "set_max_length"],
  [`b2d.joint.create_weld(${BODIES})`]: [
    "get_angular_damping_ratio",
    "get_angular_hertz",
    "get_linear_damping_ratio",
    "get_linear_hertz",
    "get_reference_angle",
    "set_angular_damping_ratio",
    "set_angular_hertz",
    "set_linear_damping_ratio",
    "set_linear_hertz",
    "set_reference_angle",
  ],
  [`b2d.joint.create_motor(${BODIES})`]: [
    "get_angular_offset",
    "get_correction_factor",
    "get_linear_offset",
    "set_angular_offset",
    "set_correction_factor",
    "set_linear_offset",
  ],
};

const ATLAS = '"/main/probe.a.texturesetc"';
const FONT = '"/builtins/fonts/default.fontc"';
const BUFFER_RESOURCE = '"/main/triangle.bufferc"';
// Keeps the probe atlas's one-shot `anim`, which sprite and gui probes play
// afterwards and whose end the `animation_done` check waits for.
const ATLAS_PARAMS =
  '{ texture: "/main/probe.texturec", geometries: [{ vertices: [0, 0, 0, 16, 16, 16], uvs: [0, 0, 0, 16, 16, 16], indices: [0, 1, 2] }], animations: [{ id: "anim", width: 16, height: 16, frame_start: 1, frame_end: 2, playback: go.PLAYBACK_ONCE_FORWARD }] }';
const TEXTURE_PARAMS =
  "{ type: graphics.TEXTURE_TYPE_2D, width: 16, height: 16, format: graphics.TEXTURE_FORMAT_RGBA }";
const TEXTURE_BUFFER =
  'buffer.create(16 * 16, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_UINT8, count: 4 }])';
const CAPSULE = "{ center1: vmath.vector3(0, 0, 0), center2: vmath.vector3(0, 16, 0), radius: 4 }";

// Slots whose witness must name a real resource: `<ns.fn>:<slot>` or
// `<ns>.*:<slot>`, 1-based. Every expression names something that exists in
// `project/`, or a fresh id for a call that refuses an existing one.
export const WITNESS_OVERRIDES: Readonly<Record<string, string>> = {
  "sprite.play_flipbook:2": 'hash("anim")',
  "go.delete:1": "VICTIM",
  "go.get:2": '"position"',
  "go.set:2": '"position"',
  "go.set:3": "vmath.vector3(1, 1, 1)",
  "go.animate:2": '"position"',
  "go.cancel_animations:2": '"position"',
  "gui.animate:2": '"position"',
  "gui.cancel_animations:2": '"position"',
  "gui.get:2": '"position"',
  "gui.set:1": 'gui.get_node("box")',
  "gui.set:2": '"position"',
  "gui.set:3": "vmath.vector3(1, 1, 1)",
  "gui.delete_node:1": 'gui.clone(gui.get_node("box"))',
  "gui.set_id:1": 'gui.clone(gui.get_node("box"))',
  "gui.get_node:1": '"box"',
  // Only a text node holds text; any other node returns nil.
  "gui.get_text:1": 'gui.get_node("text")',
  "gui.play_flipbook:2": '"anim"',
  "gui.set_font:2": '"default"',
  "gui.get_font_resource:1": '"default"',
  "gui.new_texture:1": 'fresh("texture")',
  "gui.new_texture:4": '"rgb"',
  "gui.new_texture:5": '"abc"',
  "gui.set_texture_data:4": '"rgb"',
  "gui.set_texture_data:5": '"abc"',
  "gui.new_particlefx_node:2": '"effect"',
  "gui.set_particlefx:2": '"effect"',
  "gui.get_particlefx:1": 'gui.get_node("particlefx")',
  "gui.play_particlefx:1": 'gui.get_node("particlefx")',
  "gui.stop_particlefx:1": 'gui.get_node("particlefx")',
  "gui.set_particlefx:1": 'gui.get_node("particlefx")',
  "gui.set_perimeter_vertices:1": 'gui.get_node("pie")',
  "gui.set_perimeter_vertices:2": "4",
  "physics.create_joint:3": 'fresh("joint")',
  "physics.create_joint:5": "PEER_COLLISION",
  "physics.destroy_joint:2": '"doomed"',
  "physics.get_joint_properties:2": '"kept"',
  "physics.get_joint_reaction_force:2": '"kept"',
  "physics.get_joint_reaction_torque:2": '"kept"',
  "physics.set_joint_properties:2": '"kept"',
  "physics.get_maskbit:2": '"default"',
  "physics.get_shape:2": '"box"',
  "physics.set_shape:2": '"box"',
  "physics.set_shape:3": "{ type: physics.SHAPE_TYPE_BOX, dimensions: vmath.vector3(16, 16, 16) }",
  "b2d.body.destroy_fixture:1": "b2d.get_body(WRECK_COLLISION)!",
  "b2d.body.destroy_shape:1": "b2d.get_body(WRECK_COLLISION)!",
  "b2d.body.create_chain:2": "{ vertices: [vmath.vector3(0, 0, 0), vmath.vector3(16, 0, 0)] }",
  "b2d.world.cast_mover:2": CAPSULE,
  "b2d.world.collide_mover:2": CAPSULE,
  "buffer.copy_buffer:2": "0",
  "buffer.copy_buffer:4": "0",
  "buffer.get_stream:2": 'hash("position")',
  "factory.set_prototype:2": '"/main/spawn.goc"',
  "collectionfactory.set_prototype:2": '"/main/spawn.collectionc"',
  "collectionproxy.set_collection:2": '"/main/proxy.collectionc"',
  "font.add_font:1": FONT,
  "font.get_info:1": FONT,
  "font.prewarm_text:1": FONT,
  "font.remove_font:1": FONT,
  "json.decode:1": '"{}"',
  "model.get_mesh_enabled:2": '"Cube"',
  "model.set_mesh_enabled:2": '"Cube"',
  "profiler.view_recorded_frame:1": "{ frame: 0 }",
  "resource.create_atlas:1": 'fresh("/probe_atlas", ".texturesetc")',
  "resource.create_buffer:1": 'fresh("/probe_buffer", ".bufferc")',
  "resource.create_sound_data:1": 'fresh("/probe_sound", ".wavc")',
  "resource.create_sound_data:2": '{ data: sys.load_resource("/main/probe.wav")[0]! }',
  "resource.create_texture:1": 'fresh("/probe_texture", ".texturec")',
  "resource.create_texture:2": TEXTURE_PARAMS,
  "resource.create_texture:3": TEXTURE_BUFFER,
  "resource.create_texture_async:1": 'fresh("/probe_texture", ".texturec")',
  "resource.create_texture_async:2": TEXTURE_PARAMS,
  "resource.create_texture_async:3": TEXTURE_BUFFER,
  "resource.set_texture:1": '"/main/probe.texturec"',
  "resource.set_texture:2": TEXTURE_PARAMS,
  "resource.set_texture:3": TEXTURE_BUFFER,
  "resource.create_atlas:2": ATLAS_PARAMS,
  "resource.get_atlas:1": ATLAS,
  "resource.set_atlas:1": ATLAS,
  "resource.set_atlas:2": ATLAS_PARAMS,
  "resource.get_buffer:1": BUFFER_RESOURCE,
  "resource.set_buffer:1": BUFFER_RESOURCE,
  "resource.get_text_metrics:1": FONT,
  "resource.get_texture_info:1": '"/main/probe.texturec"',
  "resource.set_sound:1": '"/main/probe.wavc"',
  "sys.deserialize:1": "sys.serialize({})",
  // Enabling throttling would stop the frames the probe reports on.
  "sys.set_engine_throttle:1": "false",
  // A frame cap of one would stretch the message queue to one post a second.
  "sys.set_update_frequency:1": "60",
  "sys.save:1": '"probe.sav"',
  "sys.load:1": '"probe.sav"',
  "sys.load_buffer:1": '"game.project"',
  "tilemap.*:2": '"layer1"',
  "zlib.inflate:1": 'zlib.deflate("probe")',
  ...Object.fromEntries(
    Object.entries(JOINT_ACCESSORS).flatMap(([joint, accessors]) =>
      accessors.map((accessor) => [`b2d.joint.${accessor}:1`, joint]),
    ),
  ),
};

// Statements each script runs before its probes, for calls that need an
// existing object by id.
export const PRELUDES: Readonly<Record<ScriptKind, readonly string[]>> = {
  go: [
    'pcall(() => physics.create_joint(physics.JOINT_TYPE_FIXED, COLLISION, "kept", vmath.vector3(), PEER_COLLISION, vmath.vector3()));',
    'pcall(() => physics.create_joint(physics.JOINT_TYPE_FIXED, COLLISION, "doomed", vmath.vector3(), PEER_COLLISION, vmath.vector3()));',
  ],
  gui: [],
  render: [],
};

// A witness for each `Opaque<"...">` handle a slot can take, keyed by the
// handle name and the script kind it can be produced in. A call taking the same
// handle twice gets the next entry for its second slot, so a joint links two
// different bodies.
const BUFFER =
  'buffer.create(1, [{ name: hash("position"), type: buffer.VALUE_TYPE_FLOAT32, count: 3 }])';

export const HANDLE_WITNESSES: Readonly<
  Record<string, Partial<Record<ScriptKind, readonly string[]>> | undefined>
> = {
  node: { gui: ['gui.get_node("box")', 'gui.get_node("text")'] },
  b2Body: { go: ["b2d.get_body(COLLISION)!", "b2d.get_body(PEER_COLLISION)!"] },
  b2World: { go: ["b2d.get_world()"] },
  b2Joint: {
    go: [
      REVOLUTE,
      "b2d.joint.create_revolute(b2d.get_body(COLLISION)!, b2d.get_body(WRECK_COLLISION)!)",
    ],
  },
  b2MassData: { go: ["b2d.body.get_mass_data(b2d.get_body(COLLISION)!)"] },
  b2Shape: {
    go: [
      "b2d.body.create_shape(b2d.get_body(WRECK_COLLISION)!, { shape: { type: b2d.shape.SHAPE_TYPE_CIRCLE, radius: 4 } }).shape_id",
    ],
  },
  b2Chain: {
    go: [
      "b2d.body.create_chain(b2d.get_body(WRECK_COLLISION)!, { vertices: [vmath.vector3(-8, 0, 0), vmath.vector3(0, 4, 0), vmath.vector3(8, 0, 0)] })[0]",
    ],
  },
  buffer: { go: [BUFFER], gui: [BUFFER], render: [BUFFER] },
  bufferstream: { go: [`buffer.get_stream(${BUFFER}, hash("position"))`] },
  constant_buffer: { render: ["render.constant_buffer()"] },
  render_predicate: { render: ['render.predicate(["probe"])'] },
  render_target: {
    render: [
      'render.render_target("probe", { [graphics.BUFFER_TYPE_COLOR0_BIT]: { format: graphics.TEXTURE_FORMAT_RGBA, width: 16, height: 16 } })',
    ],
  },
};
