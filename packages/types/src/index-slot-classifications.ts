import { htmlToDocText } from "./doc-comment";

// How TypeScript authors address each index-like engine slot.
//
// - `lowered`: authored zero-based; the transpiler adds 1. Exactly the
//   `options.index` key of the calls in `ONE_BASED_INDEX_OPTION_APIS`.
// - `passthrough-1` / `passthrough-0`: passed through in the base the engine
//   documents, because such values round-trip between engine calls
//   (`b2d.body.get_fixtures()[i].index` into `b2d.fixture.*`).
// - `not-a-position`: matched the scan but addresses nothing by position (an
//   array-valued table, a count, a name that only contains "index").
//
// Moving a slot between classes changes the meaning of existing calls with no
// compile error, so it is a breaking change.
export type IndexSlotClass = "lowered" | "passthrough-1" | "passthrough-0" | "not-a-position";

export interface IndexSlotClassification {
  readonly class: IndexSlotClass;
  // The decoded upstream phrase that states the base, or a one-line reason.
  readonly evidence: string;
}

export const ONE_BASED_PHRASE = /\b(?:1[- ]based|one[- ]based|1[- ]indexed)\b/i;
export const ZERO_BASED_PHRASE = /\b(?:0[- ]based|zero[- ]based|0[- ]indexed)\b/i;

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
    { class: "passthrough-1", evidence: "1-based fixture index from `b2d.body.get_fixtures`" },
  ]),
  ...[
    "b2d.fixture.get_aabb:param:child_index",
    "b2d.fixture.get_filter_data:param:child_index",
    "b2d.fixture.set_filter_data:param:child_index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "passthrough-1", evidence: "1-based child shape index" },
  ]),
  ...[
    "b2d.body.create_fixture:return:fixture:index",
    "b2d.body.get_fixtures:return:fixtures:index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "passthrough-1",
      evidence: "the binding pushes the 1-based fixture_index the b2d.fixture calls take",
    },
  ]),
  [
    "b2d.body.destroy_shape:param:shape_index",
    { class: "passthrough-1", evidence: "1-based shape index" },
  ],
  ...[
    "b2d.fixture.get_filter_data:return:filter:group_index",
    "b2d.fixture.set_filter_data:param:filter:group_index",
    "b2d.world.cast_ray:param:filter:group_index",
    "b2d.world.cast_ray_closest:param:filter:group_index",
    "b2d.world.cast_shape:param:filter:group_index",
    "b2d.world.overlap_aabb:param:filter:group_index",
    "b2d.world.overlap_shape:param:filter:group_index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "not-a-position", evidence: "Box2D collision group, not a position" },
  ]),
  ...["client:send:param:i", "client:send:param:j"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      {
        class: "passthrough-1",
        evidence: "if `i` is 1 or absent, this is effectively the total number of bytes sent",
      },
    ],
  ),
  ...["client:send:return:index", "client:send:return:lastindex"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      { class: "passthrough-1", evidence: "the index of the last byte within [i, j]" },
    ],
  ),
  [
    "crash.get_sys_field:param:index",
    { class: "not-a-position", evidence: "system field enum, a `crash.SYSFIELD_*` constant" },
  ],
  [
    "crash.get_user_field:param:index",
    {
      class: "passthrough-0",
      evidence: "the binding accepts 0 to USERDATA_SLOTS - 1, like crash.set_user_field",
    },
  ],
  [
    "crash.set_user_field:param:index",
    { class: "passthrough-0", evidence: "slot index. 0-indexed" },
  ],
  ...[
    "go.get:param:options:index",
    "go.set:param:options:index",
    "gui.get:param:options:index",
    "gui.set:param:options:index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "lowered", evidence: "index into array property (1 based)" },
  ]),
  [
    "gui.get_index:return:index",
    {
      class: "passthrough-0",
      evidence: "the binding counts preceding siblings from 0 (gui_script.cpp LuaGetIndex)",
    },
  ],
  ...["image.pixel:param:x", "image.pixel:param:y"].map(
    (key): [string, IndexSlotClassification] => [
      key,
      { class: "passthrough-1", evidence: "1-based pixel coordinate" },
    ],
  ),
  [
    "model.set_blend_weights:param:weights",
    { class: "not-a-position", evidence: "array of weight values (1-based indices)" },
  ],
  [
    "profiler.view_recorded_frame:param:frame_index",
    { class: "not-a-position", evidence: "an options table holding `distance` or `frame`" },
  ],
  [
    "profiler.view_recorded_frame:param:frame_index:frame",
    { class: "passthrough-1", evidence: "1 is first recorded frame" },
  ],
  ...[
    "resource.create_atlas:param:table:frame_start",
    "resource.create_atlas:param:table:frame_end",
    "resource.set_atlas:param:table:frame_start",
    "resource.set_atlas:param:table:frame_end",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "passthrough-1",
      evidence: "Indices are lua based and must be in the range of 1 .. <number-of-geometries>",
    },
  ]),
  [
    "resource.set_texture:param:table:page",
    { class: "passthrough-0", evidence: "slice of the array texture. Zero-based" },
  ],
  ...[
    "tilemap.set_tile:param:x",
    "tilemap.set_tile:param:y",
    "tilemap.get_tile:param:x",
    "tilemap.get_tile:param:y",
    "tilemap.get_tile_info:param:x",
    "tilemap.get_tile_info:param:y",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    {
      class: "passthrough-1",
      evidence: "the binding subtracts 1 from the checked coordinate",
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
  ...[
    "tilemap.tiles.get_info:return:info:index",
    "tilemap.tiles.get_tile:return:tile_index",
    "tilemap.tiles.set:param:tile_or_info",
    "tilemap.tiles.set:param:tile_or_info:index",
  ].map((key): [string, IndexSlotClassification] => [
    key,
    { class: "passthrough-1", evidence: "1-indexed tile index of a tilemap's tilesource" },
  ]),
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

function statesBase(prose: string): boolean {
  return ONE_BASED_PHRASE.test(prose) || ZERO_BASED_PHRASE.test(prose);
}

function baseWord(key: string): string | undefined {
  const classification = INDEX_SLOT_CLASSIFICATIONS.get(key);
  if (classification?.class === "passthrough-1") return "1-based";
  if (classification?.class === "passthrough-0") return "0-based";
  return undefined;
}

// The sentences a slot's doc gains so each passed-through index it holds, the
// slot itself or one of its table fields, names its base. A slot or field whose
// upstream prose already states a base gains nothing.
export function indexBaseNotes(
  elementName: string,
  kind: "param" | "return",
  slotName: string,
  rawDoc: string,
): string[] {
  const key = `${elementName}:${kind}:${slotName}`;
  const { prose, fields } = splitSlotFields(rawDoc);
  const notes: string[] = [];
  const own = baseWord(key);
  if (own !== undefined && !statesBase(prose)) notes.push(`${own}.`);
  const prefix = `${key}:`;
  for (const fieldKey of INDEX_SLOT_CLASSIFICATIONS.keys()) {
    if (!fieldKey.startsWith(prefix)) continue;
    const field = fieldKey.slice(prefix.length);
    if (field.includes(":")) continue;
    const base = baseWord(fieldKey);
    if (base === undefined) continue;
    const fieldProse = fields.find((candidate) => candidate.name === field)?.prose ?? "";
    if (!statesBase(fieldProse)) notes.push(`\`${field}\` is ${base}.`);
  }
  return notes;
}

// `doc` is the slot doc in whatever form the caller renders (decoded text or
// ref-doc HTML); `rawDoc` is the ref-doc HTML the base check reads.
export function withIndexBaseNotes(
  elementName: string,
  kind: "param" | "return",
  slotName: string,
  rawDoc: string,
  doc: string,
): string {
  const notes = indexBaseNotes(elementName, kind, slotName, rawDoc);
  if (notes.length === 0) return doc;
  const sentence = notes.join(" ");
  const body = doc.trimEnd();
  if (body === "") return sentence;
  if (body.includes("\n")) return `${body}\n\n${sentence}`;
  return /[.!?:]$/.test(body) ? `${body} ${sentence}` : `${body}. ${sentence}`;
}
