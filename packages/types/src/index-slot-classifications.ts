import { htmlToDocText } from "./doc-comment";
import { LIBRARY_INDEX_SLOT_CLASSIFICATIONS } from "./library-index-slot-classifications";

// The class records the base Defold itself counts from. TypeScript passes every
// engine position to Defold, and takes it back, unchanged in that base:
//
// - `native-1`: Defold counts from 1.
// - `native-0`: Defold counts from 0.
// - `not-a-position`: matched the scan but addresses nothing by position (an
//   array-valued table, a count, an id, a collision group, a name that only
//   contains "index").
//
// The class drives the base each hover states and the positions the engine
// probes check, so moving a slot between classes changes its documented
// meaning.
export type IndexSlotClass = "native-1" | "native-0" | "not-a-position";

export interface IndexSlotClassification {
  readonly class: IndexSlotClass;
  // The decoded upstream phrase that states the base, or a one-line reason.
  readonly evidence: string;
  // A negative value counts from the end and passes through unchanged
  // (LuaSocket `client:send`'s `i`/`j`, which work like `string.sub`).
  readonly fromEnd?: true;
  // The engine returns whose values this input slot consumes, so a value taken
  // from one and handed back addresses the same element. Each names another
  // entry of the same class.
  readonly pairsWith?: readonly string[];
  // The zero-based position of a return in its function's `LuaMultiReturn`
  // tuple, or of the return holding a returned field; absent on the return of a
  // single-value function and on every param.
  readonly tupleSlot?: number;
}

// A default value is never a base: "Defaults to zero" states no counting.
export const ONE_BASED_PHRASE =
  /\b(?:(?:1|one)[- ](?:based|indexed)|lua[- ]based|(?:indexed|start(?:s|ing)?) (?:at|from) (?:1|one)(?!\.\d|\s+of\b))\b/i;
export const ZERO_BASED_PHRASE =
  /\b(?:(?:0|zero)[- ](?:based|indexed)|(?:indexed|start(?:s|ing)?) (?:at|from) (?:0|zero)(?!\.\d))\b/i;

// The slot name a declared return takes when no ref-doc names it, as for a
// return `RETURN_TYPE_OVERRIDES` authors (`b2d.body.create_shape`).
export const OVERRIDE_RETURN_SLOT = "result";

const CREATE_SHAPE_INDEX = `b2d.body.create_shape:return:${OVERRIDE_RETURN_SLOT}:index`;

const BULLET3D_CAST_SHAPE_INDEXES = [
  "bullet3d.world.cast_ray:return:hits:shape_index",
  "bullet3d.world.cast_ray_closest:return:hit:shape_index",
  "bullet3d.world.cast_shape:return:hits:shape_index",
  "bullet3d.world.cast_shape_closest:return:hit:shape_index",
];

// Keyed `<element>:<param|return>:<slot>[:<field>]`, the shape
// `OPTIONAL_SLOT_CORRECTIONS` and `TABLE_FIELD_TYPE_OVERRIDES` use.
// `scripts/index-slot-scan.test.ts` reds on a scanned slot missing here and on
// an entry no retained surface reports.
export const INDEX_SLOT_CLASSIFICATIONS: ReadonlyMap<string, IndexSlotClassification> = new Map<
  string,
  IndexSlotClassification
>([
  ...[
    "b2d.body.destroy_fixture:param:fixture_index",
    "b2d.fixture.get_aabb:param:fixture_index",
    "b2d.fixture.get_density:param:fixture_index",
    "b2d.fixture.get_filter_data:param:fixture_index",
    "b2d.fixture.get_friction:param:fixture_index",
    "b2d.fixture.get_restitution:param:fixture_index",
    "b2d.fixture.get_shape:param:fixture_index",
    "b2d.fixture.get_type:param:fixture_index",
    "b2d.fixture.is_sensor:param:fixture_index",
    "b2d.fixture.refilter:param:fixture_index",
    "b2d.fixture.set_density:param:fixture_index",
    "b2d.fixture.set_filter_data:param:fixture_index",
    "b2d.fixture.set_friction:param:fixture_index",
    "b2d.fixture.set_restitution:param:fixture_index",
    "b2d.fixture.set_sensor:param:fixture_index",
    "b2d.fixture.set_shape:param:fixture_index",
    "b2d.fixture.test_point:param:fixture_index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "native-1",
      evidence: "1-based fixture index from `b2d.body.get_fixtures`",
      pairsWith: [
        "b2d.body.create_fixture:return:fixture:index",
        "b2d.body.get_fixtures:return:fixtures:index",
        "b2d.world.overlap_aabb:return:fixtures:index",
        "b2d.world.overlap_shape:return:fixtures:index",
      ],
    },
  ]),
  ...[
    "b2d.fixture.get_aabb:param:child_index",
    "b2d.fixture.get_filter_data:param:child_index",
    "b2d.fixture.set_filter_data:param:child_index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "native-1", evidence: "1-based child shape index" },
  ]),
  ...[
    "b2d.body.create_fixture:return:fixture:index",
    "b2d.body.get_fixtures:return:fixtures:index",
    "b2d.world.overlap_aabb:return:fixtures:index",
    "b2d.world.overlap_shape:return:fixtures:index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "native-1",
      evidence: "the binding pushes the 1-based fixture_index the b2d.fixture calls take",
      ...(key.startsWith("b2d.world.") ? { tupleSlot: 0 } : {}),
    },
  ]),
  [
    CREATE_SHAPE_INDEX,
    {
      class: "native-1",
      evidence:
        "script_box2d_body_v3.cpp:PushShapeInfo pushes the 1-based shape_index GetShapeByIndex takes",
    },
  ],
  [
    "b2d.body.destroy_shape:param:shape_index",
    {
      class: "native-1",
      evidence: "1-based shape index",
      pairsWith: [CREATE_SHAPE_INDEX],
    },
  ],
  ...[
    "are_contact_events_enabled",
    "are_hit_events_enabled",
    "are_pre_solve_events_enabled",
    "are_sensor_events_enabled",
    "enable_contact_events",
    "enable_hit_events",
    "enable_pre_solve_events",
    "enable_sensor_events",
    "get_body",
    "get_closest_point",
    "get_contact_capacity",
    "get_contact_data",
    "get_mass_data",
    "get_material",
    "get_sensor_capacity",
    "get_sensor_overlaps",
    "get_shape",
    "get_world",
    "is_valid",
    "ray_cast",
    "set_material",
    "set_shape",
  ].map((name): [string, IndexSlotClassification] => [
    `b2d.shape.${name}:param:shape_index`,
    {
      class: "native-1",
      evidence: "script_box2d_body_v3.cpp:GetShapeByIndex returns shapes[shape_index - 1]",
      pairsWith: [CREATE_SHAPE_INDEX],
    },
  ]),
  ...[
    "b2d.fixture.get_filter_data:return:filter:group_index",
    "b2d.fixture.set_filter_data:param:filter:group_index",
    "b2d.body.create_chain:param:definition:filter:group_index",
    "b2d.body.create_fixture:param:definition:filter:group_index",
    "b2d.body.create_shape:param:definition:filter:group_index",
    "b2d.world.cast_ray:param:filter:group_index",
    "b2d.world.cast_ray_closest:param:filter:group_index",
    "b2d.world.cast_shape:param:filter:group_index",
    "b2d.world.overlap_aabb:param:filter:group_index",
    "b2d.world.overlap_shape:param:filter:group_index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "not-a-position", evidence: "Box2D collision group, not a position" },
  ]),
  ...[
    "enable_spring",
    "get_6dof_angle",
    "get_6dof_axis",
    "get_6dof_motor",
    "get_6dof_position",
    "get_limit",
    "is_limited",
    "set_6dof_motor",
    "set_limit",
    "set_spring_damping",
    "set_spring_equilibrium_point",
    "set_spring_stiffness",
  ].map((name): [string, IndexSlotClassification] => [
    `bullet3d.constraint.${name}:param:axis`,
    {
      class: "native-1",
      evidence: "one-based axis, from 1 to 6 or from 1 to 3 for an angular axis",
    },
  ]),
  [
    "bullet3d.collision_object.get_shape:param:shape_index",
    {
      class: "native-1",
      evidence: "one-based shape index",
      pairsWith: ["bullet3d.shape.get_index:return:shape_index", ...BULLET3D_CAST_SHAPE_INDEXES],
    },
  ],
  [
    "bullet3d.shape.get_index:return:shape_index",
    { class: "native-1", evidence: "Get the one-based child index." },
  ],
  ...BULLET3D_CAST_SHAPE_INDEXES.map((key): [string, IndexSlotClassification] => [
    key,
    { class: "native-1", evidence: "one-based compound child index" },
  ]),
  ...["client:send:param:i", "client:send:param:j"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      {
        class: "native-1",
        evidence: "if `i` is 1 or absent, this is effectively the total number of bytes sent",
        fromEnd: true,
        pairsWith: ["client:send:return:index", "client:send:return:lastindex"],
      },
    ],
  ),
  [
    "client:send:return:index",
    {
      class: "native-1",
      evidence: "the index of the last byte within [i, j]",
      tupleSlot: 0,
    },
  ],
  [
    "client:send:return:lastindex",
    {
      class: "native-1",
      evidence: "the index of the last byte within [i, j]",
      tupleSlot: 2,
    },
  ],
  [
    "crash.get_sys_field:param:index",
    { class: "not-a-position", evidence: "system field enum, a `crash.SYSFIELD_*` constant" },
  ],
  [
    "crash.get_user_field:param:index",
    {
      class: "native-0",
      evidence: "the binding accepts 0 to USERDATA_SLOTS - 1, like crash.set_user_field",
    },
  ],
  ["crash.set_user_field:param:index", { class: "native-0", evidence: "slot index. 0-indexed" }],
  [
    "editor.ui.open_resource:param:args",
    {
      class: "native-1",
      evidence: "Code and Text views accept a one-based cursor or range in `args`",
    },
  ],
  ...[
    "go.get:param:options:index",
    "go.set:param:options:index",
    "gui.get:param:options:index",
    "gui.set:param:options:index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "native-1", evidence: "index into array property (1 based)" },
  ]),
  [
    "gui.get_index:return:index",
    {
      class: "native-0",
      evidence: "the binding counts preceding siblings from 0 (gui_script.cpp LuaGetIndex)",
    },
  ],
  ...[
    "gui.get_layout_objects:return:objects:text_offset",
    "label.get_layout_objects:return:objects:text_offset",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "native-0", evidence: "zero-based UTF-32 offset in the visible text" },
  ]),
  ...["image.pixel:param:x", "image.pixel:param:y"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      { class: "native-1", evidence: "1-based pixel coordinate" },
    ],
  ),
  ["image.pixels:return:iterator", { class: "native-1", evidence: "Coordinates are 1-based" }],
  [
    "model.set_blend_weights:param:weights",
    { class: "not-a-position", evidence: "array of weight values (1-based indices)" },
  ],
  [
    "on_input:param:action:gamepad",
    {
      class: "native-0",
      evidence: "comp_script.cpp pushes the engine's 0-based m_GamepadIndex unchanged",
    },
  ],
  [
    "profiler.view_recorded_frame:param:frame_index",
    { class: "not-a-position", evidence: "an options table holding `distance` or `frame`" },
  ],
  [
    "profiler.view_recorded_frame:param:frame_index:frame",
    { class: "native-1", evidence: "1 is first recorded frame" },
  ],
  ...[
    "resource.create_atlas:param:table:frame_start",
    "resource.create_atlas:param:table:frame_end",
    "resource.set_atlas:param:table:frame_start",
    "resource.set_atlas:param:table:frame_end",
    "resource.create_atlas:param:table:animations:frame_start",
    "resource.create_atlas:param:table:animations:frame_end",
    "resource.set_atlas:param:table:animations:frame_start",
    "resource.set_atlas:param:table:animations:frame_end",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "native-1",
      evidence: "Indices are lua based and must be in the range of 1 .. <number-of-geometries>",
    },
  ]),
  ...[
    "resource.create_atlas:param:table:animations:frames",
    "resource.set_atlas:param:table:animations:frames",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "native-1",
      evidence:
        "script_resource.cpp:CheckAtlasArguments checks each frame against 1 .. <number-of-geometries>",
      pairsWith: ["resource.get_atlas:return:data:animations:frames"],
    },
  ]),
  [
    "resource.set_texture:param:table:page",
    { class: "native-0", evidence: "slice of the array texture. Zero-based" },
  ],
  [
    "resource.set_texture:param:table:mipmap",
    {
      class: "native-0",
      evidence: "script_resource.cpp reads `mipmap` with default 0, the base level",
    },
  ],
  ...[
    "resource.create_atlas:param:table:geometries:indices",
    "resource.set_atlas:param:table:geometries:indices",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "native-0",
      evidence:
        "The index values are zero based where zero refers to the first entry of the vertex and uv lists",
      pairsWith: ["resource.get_atlas:return:data:geometries:indices"],
    },
  ]),
  [
    "resource.get_atlas:return:data:animations:frames",
    {
      class: "native-1",
      evidence: "script_resource.cpp:GetAtlas pushes each frame's geometry_index + 1",
    },
  ],
  [
    "resource.get_atlas:return:data:geometries:indices",
    {
      class: "native-0",
      evidence: "script_resource.cpp:GetAtlas pushes each m_Indices value unchanged",
    },
  ],
  ...["sockets_r", "sockets_w"].map((slot, tupleSlot): [string, IndexSlotClassification] => [
    `socket.select:return:${slot}`,
    {
      class: "not-a-position",
      evidence: "a list of ready sockets, keyed both by integer and by socket",
      tupleSlot,
    },
  ]),
  ...(["x", "y"] as const).flatMap((axis) =>
    ["tilemap.set_tile", "tilemap.get_tile", "tilemap.get_tile_info"].map(
      (fn): [string, IndexSlotClassification] => [
        `${fn}:param:${axis}`,
        {
          class: "native-1",
          evidence: "the binding subtracts 1 from the checked coordinate",
          pairsWith: [`tilemap.get_bounds:return:${axis}`],
        },
      ],
    ),
  ),
  ...(["x", "y"] as const).map((axis, tupleSlot): [string, IndexSlotClassification] => [
    `tilemap.get_bounds:return:${axis}`,
    {
      class: "native-1",
      evidence: `script_tilemap.cpp:TileMap_GetBounds pushes ${axis} + 1`,
      tupleSlot,
    },
  ]),
  ...["tilemap.get_tile:return:tile", "tilemap.set_tile:param:tile"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      { class: "not-a-position", evidence: "tile id; 0 resets the cell" },
    ],
  ),
  [
    "tilemap.get_tile_info:return:tile_info",
    { class: "not-a-position", evidence: "a tile info table; its prose reads `index of the tile`" },
  ],
  [
    "tilemap.get_tile_info:return:tile_info:index",
    { class: "not-a-position", evidence: "the tile id `tilemap.get_tile` returns" },
  ],
  ...["tilemap.tiles.get_info:return:info:index", "tilemap.tiles.get_tile:return:tile_index"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      { class: "native-1", evidence: "1-indexed tile index of a tilemap's tilesource" },
    ],
  ),
  ...["tilemap.tiles.set:param:tile_or_info", "tilemap.tiles.set:param:tile_or_info:index"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      {
        class: "native-1",
        evidence: "1-indexed tile index of a tilemap's tilesource",
        pairsWith: key.endsWith(":index")
          ? ["tilemap.tiles.get_info:return:info:index"]
          : ["tilemap.tiles.get_tile:return:tile_index"],
      },
    ],
  ),
]);

const FIELD_LINE = /^- `([A-Za-z_]\w*)(?:\s[^`]*)?`\s*(.*)$/;

export interface SlotDocFields {
  readonly prose: string;
  readonly fields: readonly { readonly name: string; readonly prose: string }[];
}

// Separates a slot doc's own prose from its field list, so a field's base is
// keyed to the field. `<dt>` field names become list items the way `<li>` ones
// already do, and a bare `- index <span class="type">` name gains the code span
// the other field-list shapes carry.
export function splitSlotFields(html: string): SlotDocFields {
  const text = htmlToDocText(
    html
      .replace(/<dt>/gi, "<li>")
      .replace(/^- ([A-Za-z_]\w*) (?=<span class="type">)/gm, "- <code>$1</code> "),
  );
  const prose: string[] = [];
  const fields: { name: string; prose: string[] }[] = [];
  let current: { name: string; prose: string[] } | undefined;
  for (const line of text.split("\n")) {
    const field = FIELD_LINE.exec(line);
    if (field?.[1] !== undefined) {
      current = { name: field[1], prose: [field[2] ?? ""] };
      fields.push(current);
    } else if (current !== undefined && line !== "" && !line.startsWith("- ")) {
      current.prose.push(line);
    } else {
      current = undefined;
      prose.push(line);
    }
  }
  return {
    prose: prose.join("\n"),
    fields: fields.map((field) => ({ name: field.name, prose: field.prose.join("\n") })),
  };
}

// The marker that leads every note naming a native base, so a 1-based position
// stands out from a 0-based one at a glance.
export const INDEX_BASE_MARKERS: Readonly<Record<"native-1" | "native-0", string>> = {
  "native-1": "⚠️",
  "native-0": "0️⃣",
};

// The base a position's class names, stated whatever its prose says, since
// upstream prose phrases its base in too many ways to read reliably. `receiver`
// names who counts from that base; `subject` names the table field the note is
// about, when it is about one.
function nativeBaseNote(
  map: ReadonlyMap<string, Pick<IndexSlotClassification, "class">>,
  receiver: string,
  key: string,
  subject?: string,
): string | undefined {
  const classification = map.get(key)?.class;
  if (classification !== "native-1" && classification !== "native-0") return undefined;
  const base = classification === "native-1" ? "1-based" : "0-based";
  const sentence = `${base}; passed to ${receiver} unchanged.`;
  const body = subject === undefined ? sentence : `\`${subject}\` is ${sentence}`;
  return `**${INDEX_BASE_MARKERS[classification]} ${body}**`;
}

function slotBaseNotes(
  map: ReadonlyMap<string, Pick<IndexSlotClassification, "class">>,
  receiver: string,
  key: string,
): string[] {
  const notes: string[] = [];
  const own = nativeBaseNote(map, receiver, key);
  if (own !== undefined) notes.push(own);
  const prefix = `${key}:`;
  for (const fieldKey of map.keys()) {
    if (!fieldKey.startsWith(prefix)) continue;
    const path = fieldKey.slice(prefix.length);
    const note = nativeBaseNote(map, receiver, fieldKey, path.slice(path.lastIndexOf(":") + 1));
    if (note !== undefined) notes.push(note);
  }
  return notes;
}

export function appendNotes(doc: string, notes: readonly string[]): string {
  const body = doc.trimEnd();
  const missing = notes.filter((note) => !body.includes(note));
  if (missing.length === 0) return doc;
  const sentence = missing.join(" ");
  if (body === "") return sentence;
  if (body.includes("\n")) return `${body}\n\n${sentence}`;
  return /[.!?:]$/.test(body) ? `${body} ${sentence}` : `${body}. ${sentence}`;
}

// The sentences a slot's doc gains so each index it holds, the slot itself or
// one of its table fields, names the native base Defold counts from.
export function indexBaseNotes(
  elementName: string,
  kind: "param" | "return",
  slotName: string,
): string[] {
  return slotBaseNotes(INDEX_SLOT_CLASSIFICATIONS, "Defold", `${elementName}:${kind}:${slotName}`);
}

// `doc` is the slot doc in whatever form the caller renders (decoded text or
// ref-doc HTML).
export function withIndexBaseNotes(
  elementName: string,
  kind: "param" | "return",
  slotName: string,
  doc: string,
): string {
  return appendNotes(doc, indexBaseNotes(elementName, kind, slotName));
}

// The same notes for a slot or class field of a library page, read from the
// library map under that page's key and naming the library as the receiver.
export function libraryIndexBaseNotes(
  page: string,
  elementName: string,
  kind: "param" | "return" | "field",
  slotName: string,
): string[] {
  return slotBaseNotes(
    LIBRARY_INDEX_SLOT_CLASSIFICATIONS,
    `\`${page}\``,
    `${page}/${elementName}:${kind}:${slotName}`,
  );
}

export function withLibraryIndexBaseNotes(
  page: string,
  elementName: string,
  kind: "param" | "return" | "field",
  slotName: string,
  doc: string,
): string {
  return appendNotes(doc, libraryIndexBaseNotes(page, elementName, kind, slotName));
}

// Where a declaration's index notes come from: the engine map, naming Defold, or
// the library map under each listed page, naming that library. A library or
// extension declaration never reads the engine map, so an element it shares a
// name with (`spine.gui` declares `gui.*`) never claims Defold as its receiver.
export type IndexBaseSource = "engine" | { readonly pages: readonly string[] };

export type IndexBaseNoteResolver = (
  elementName: string,
  kind: "param" | "return",
  slotName: string,
) => string[];

export function indexBaseNoteResolver(source: IndexBaseSource): IndexBaseNoteResolver {
  if (source === "engine") return indexBaseNotes;
  const { pages } = source;
  return (elementName, kind, slotName) =>
    pages.flatMap((page) => libraryIndexBaseNotes(page, elementName, kind, slotName));
}
