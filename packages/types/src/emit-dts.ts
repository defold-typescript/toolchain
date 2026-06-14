import type {
  ApiConstant,
  ApiFunction,
  ApiModule,
  ApiParameter,
  ApiProperty,
  ApiVariable,
} from "./api-doc";
import { DEFOLD_TYPE_MAP } from "./core-types";
import {
  type DocCommentParts,
  htmlToCodeText,
  htmlToDocText,
  renderDocComment,
} from "./doc-comment";
import type { TranslationStore } from "./example-store";
import { hashExampleSource, lookupTranslation } from "./example-store";

export interface EmitOptions {
  mapType?: (defoldType: string) => string;
  // Constant FQNs from *other* modules, so a foreign token like
  // `graphics.BUFFER_TYPE_COLOR0_BIT` used as a param type inside `render`
  // brands to the same FQN-keyed type its owning module's `const` emits,
  // instead of widening to `unknown`.
  knownConstantFqns?: ReadonlySet<string>;
  // Hand-authored TypeScript `@example` translations keyed by element FQN.
  // Defaults to an empty store (every example stays on its Lua fallback,
  // byte-identical output); the build layer (`regen`) passes the loaded
  // `examples/translations.json`. Loading lives in `scripts/example-store-io.ts`
  // so this module stays node-free for downstream consumers.
  translations?: TranslationStore;
}

export const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INDENT = "  ";

// TS reserved words that pass api-doc's identifier check but cannot be emitted
// directly inside `declare namespace { function/const <name> }` — `function
// delete(...)` / `const null:` are hard syntax errors. They are recovered as an
// internal `_<name>` declaration re-exported under the reserved name via
// `export { _<name> as <name> }`, the only form that is both TS-legal and keeps
// the engine's real call name. `regen` imports this set and lets these members
// flow through to the emitter instead of dropping them.
export const TS_RESERVED_NAMES = new Set([
  "delete",
  "new",
  "class",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "var",
  "let",
  "const",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "in",
  "void",
  "yield",
  "await",
  "null",
  "true",
  "false",
  "super",
  "this",
  "import",
  "export",
  "default",
  "with",
  "debugger",
  "extends",
]);

// A parameter name that clears `TS_IDENTIFIER` but is a TS reserved word (e.g.
// `var` on the `types.is_*` guards) is illegal in parameter position (TS1390),
// unlike a member name which `TS_RESERVED_NAMES` recovers via an export alias.
// Parameter names in a `.d.ts` are non-binding, so a reserved word takes the
// idiomatic trailing-underscore escape (`var` -> `var_`, matching
// ts-defold-types so the parity audit stays a superset); a genuinely
// non-identifier token still falls back to the positional `arg<index>` form.
// The emitted signature and its `@param` tag share this name so the tag stays
// resolvable on hover.
function safeParamName(name: string, index: number): string {
  if (!TS_IDENTIFIER.test(name)) return `arg${index}`;
  return TS_RESERVED_NAMES.has(name) ? `${name}_` : name;
}

// Element names whose `table` slot is a genuinely-arbitrary lua table by design.
// Two kinds: the serialization/JSON passthrough functions (Defold-internal — the
// engine round-trips an arbitrary lua value), and the platform/OS-sourced opaque
// blobs (external — the shape is set by the host OS or invoking app, not by
// Defold, so there is no documented field list). Their emitted
// `Record<string | number, unknown>` is the faithful "any lua table" type, not a
// `recordTables` fidelity loss, so the audit consults this set to avoid counting
// them. A new ref-doc function with an opaque table must be added here
// deliberately; until then it surfaces under `recordTables` as a visible signal.
export const ARBITRARY_TABLE_SLOTS = new Set([
  "json.encode",
  "json.decode",
  "sys.save",
  "sys.load",
  "sys.serialize",
  "sys.deserialize",
  "iac.set_listener",
  "push.get_scheduled",
  "push.get_all_scheduled",
  // runtime-owned passthrough: the table is filled by user code at runtime, never
  // by Defold's API contract. factory.create/collectionfactory.create `properties`
  // are spawn-time overrides keyed by the spawned object's own script-property
  // names; bare `on_message`'s receive `message` is the pre-hashed, user-routed
  // payload (mitigated for authored code by isMessage/onMessage). No static shape
  // exists, so `Record<string | number, unknown>` is faithful, not a loss.
  "factory.create",
  "collectionfactory.create",
  "on_message",
  // engine-formatted blob: the engine produces the value at runtime and no
  // field list is documented, so the whole-slot `Record` is faithful, not a
  // loss. crash.get_backtrace is "table containing the backtrace",
  // crash.get_modules is "module table".
  "crash.get_backtrace",
  "crash.get_modules",
  // platform-specific options: the doc is a dead backtick-prose cross-ref to a
  // sibling whose function is absent from the fixture (webview.open is not
  // documented), so no machine-readable shape exists.
  "webview.open_raw",
  // OS-resolver returns: the shape is set by the host resolver, not Defold's
  // API contract; each fixture doc reads "a table with all information
  // returned by the resolver". Mirrors the iac.set_listener / push.* platform-
  // opaque precedent.
  "socket.dns.tohostname",
  "socket.dns.toip",
  "socket.dns.getaddrinfo",
  "socket.dns.getnameinfo",
  // engine-built render-target tables: the "see the description" cross-refs
  // are dead (the function's own description is empty) or carry a typed
  // `transient: table` field whose sub-doc is prose-only, so the nested table
  // is opaque to the field-list parser and the whole-slot `Record` is faithful.
  "render.render_target",
  "render.set_render_target",
]);

// skipFunction FQNs (see `api-targets.json`'s `skipFunctions`) whose absence
// from the generated surface is *not* a fidelity loss — each is replaced by a
// hand-written, better-typed overload in the cited `*-overloads.d.ts`, so the
// final surface still ships the symbol, fully typed. The audit consults this
// set to keep the `droppedMembers` count honest; an uncovered skip (e.g. a new
// `skipFunctions` entry with no matching overload) still counts, so the gate
// stays a real signal. Mirrors the ARBITRARY_TABLE_SLOTS audit-honesty pattern.
export const OVERLOAD_COVERED_SKIPS = new Set([
  // go-overloads.d.ts supplies the typed go.get / go.set / go.property shapes.
  "go.get",
  "go.set",
  "go.property",
  // msg-overloads.d.ts supplies the typed msg.post shape.
  "msg.post",
]);

// Element names whose `table` slot is a prose-only `a table mapping X to Y`
// shape the field-list parser cannot read, but whose key/value a human curated
// from the doc. Emitted as `LuaMap<K, V>` because the key is a branded `Hash`,
// illegal in a TS index signature (`string | number | symbol` only); `LuaMap`
// is the TSTL non-string-key Lua-table idiom and resolves the same way the
// already-emitted `LuaMultiReturn` does. The audit consults this map too, so the
// gate and the emitted surface stay coupled; a slot not curated here still
// surfaces under `recordTables` until a human adds it.
export const MAPPING_TABLE_SLOTS: ReadonlyMap<string, { key: string; value: string }> = new Map([
  ["gui.clone_tree", { key: "hash", value: "node" }],
  ["gui.get_tree", { key: "hash", value: "node" }],
  ["gui.get_layouts", { key: "hash", value: "vector3" }],
]);

// Element names whose `table` slot is a prose-only `array/list/table of <T>` shape
// the field-list parser cannot read, but whose element type a human curated from
// the doc. The value is a single element token (`T[]`) or a token list when the
// element is itself a union — `go.delete`'s "table of id's" is the id union
// `string | hash | url`, emitted `(string | Hash | Url)[]`. Emitted as a plain
// array, never `LuaMap`: an array element carries no illegal-index-key problem so
// no TSTL wiring is needed. The audit consults this map too, so the gate and the
// emitted surface stay coupled; a slot not curated here still surfaces under
// `recordTables` until a human adds it. Each function here has exactly one `table`
// slot, so the element name keys it unambiguously.
export const HOMOGENEOUS_ARRAY_SLOTS: ReadonlyMap<string, string | readonly string[]> = new Map<
  string,
  string | readonly string[]
>([
  ["buffer.set_metadata", "number"],
  ["buffer.get_metadata", "number"],
  ["vmath.vector", "number"],
  ["sound.get_groups", "hash"],
  ["iap.list", "string"],
  ["go.delete", ["string", "hash", "url"]],
  // push.register's `notifications` is a prose-only array of push.NOTIFICATION_*
  // bitmask constants (the ref example sums NOTIFICATION_BADGE/SOUND/ALERT). The
  // vendored push_doc.json fixture declares no NOTIFICATION_* constant elements, so
  // no brand exists to reference; `number` is the faithful element token for these
  // numeric constants, mirroring the vmath.vector/buffer.* number entries.
  ["push.register", "number"],
]);

// A `mapping` curation whose value is itself a single-level mapping, emitted
// `LuaMap<Kouter, LuaMap<Kinner, Vinner>>` — the nested-row-map shape
// (`tilemap.get_tiles` → `tiles[row][col]`).
export type NestedMapping = { key: string; value: string };

export type TableSlotCuration =
  | { kind: "mapping"; key: string; value: string | readonly TableField[] | NestedMapping }
  | { kind: "array"; element: string | readonly string[] }
  | { kind: "object"; fields: readonly TableField[] }
  | { kind: "array-object"; fields: readonly TableField[] };

const SOCKET_HANDLE_TOKENS = ["client", "master", "unconnected"] as const;

export const TABLE_SLOT_CURATIONS: ReadonlyMap<string, TableSlotCuration> = new Map([
  ["collectionfactory.create:return:ids", { kind: "mapping", key: "hash", value: "hash" }],
  // iap.finish and iap.acknowledge take the same Defold IAP transaction object —
  // the table handed to the iap.set_listener callback. The ref-doc fixture
  // describes it in prose only (no field list), so the shape is curated from the
  // Defold iap reference. As a param-side object curation every field emits `?`,
  // which is faithful: original_trans/signature/user_id are platform-specific.
  [
    "iap.finish:param:transaction",
    {
      kind: "object",
      fields: [
        { name: "ident", types: ["string"] },
        { name: "state", types: ["number"] },
        { name: "trans_ident", types: ["string"] },
        { name: "date", types: ["string"] },
        { name: "original_trans", types: ["string"] },
        { name: "receipt", types: ["string"] },
        { name: "signature", types: ["string"] },
        { name: "user_id", types: ["string"] },
      ],
    },
  ],
  [
    "iap.acknowledge:param:transaction",
    {
      kind: "object",
      fields: [
        { name: "ident", types: ["string"] },
        { name: "state", types: ["number"] },
        { name: "trans_ident", types: ["string"] },
        { name: "date", types: ["string"] },
        { name: "original_trans", types: ["string"] },
        { name: "receipt", types: ["string"] },
        { name: "signature", types: ["string"] },
        { name: "user_id", types: ["string"] },
      ],
    },
  ],
  // iap.buy's `options` is documented in the fixture as prose only ("optional
  // parameters as properties"), so the field set is curated from the Defold iap
  // reference: a Facebook-only custom `request_id` and a Google-Play-only
  // subscription-offer `token`. Both are platform-specific, hence param-side
  // optional fields.
  [
    "iap.buy:param:options",
    {
      kind: "object",
      fields: [
        { name: "request_id", types: ["string"] },
        { name: "token", types: ["string"] },
      ],
    },
  ],
  [
    "liveupdate.get_mounts:return:mounts",
    {
      kind: "array-object",
      fields: [
        { name: "name", types: ["string"] },
        { name: "uri", types: ["string"] },
        { name: "priority", types: ["number"] },
      ],
    },
  ],
  [
    "model.get_aabb:return:aabb",
    {
      kind: "object",
      fields: [
        { name: "min", types: ["vector3"] },
        { name: "max", types: ["vector3"] },
      ],
    },
  ],
  [
    "model.get_mesh_aabb:return:aabb",
    {
      kind: "mapping",
      key: "hash",
      value: [
        { name: "min", types: ["vector3"] },
        { name: "max", types: ["vector3"] },
      ],
    },
  ],
  ["physics.raycast:param:groups", { kind: "array", element: "hash" }],
  ["physics.raycast_async:param:groups", { kind: "array", element: "hash" }],
  // push.schedule's `notification_settings` is documented in the fixture as prose
  // only ("Table with notification and platform specific fields"), so the field
  // set is curated from the Defold push reference: an iOS `action`, an iOS
  // `badge_count`, and an Android `priority`. Each is platform-specific, hence
  // param-side optional fields.
  [
    "push.schedule:param:notification_settings",
    {
      kind: "object",
      fields: [
        { name: "action", types: ["string"] },
        { name: "badge_count", types: ["number"] },
        { name: "priority", types: ["number"] },
      ],
    },
  ],
  ["socket.select:param:recvt", { kind: "array", element: SOCKET_HANDLE_TOKENS }],
  ["socket.select:param:sendt", { kind: "array", element: SOCKET_HANDLE_TOKENS }],
  ["socket.select:return:sockets_r", { kind: "array", element: SOCKET_HANDLE_TOKENS }],
  ["socket.select:return:sockets_w", { kind: "array", element: SOCKET_HANDLE_TOKENS }],
  [
    "tilemap.get_tile_info:return:tile_info",
    {
      kind: "object",
      fields: [
        { name: "index", types: ["number"] },
        { name: "h_flip", types: ["boolean"] },
        { name: "v_flip", types: ["boolean"] },
        { name: "rotate_90", types: ["boolean"] },
      ],
    },
  ],
  // tilemap.get_tiles returns a sparse table of rows iterated `tiles[row][col]`,
  // the keys being tile positions offset by tilemap.get_bounds() (not a dense
  // 0..n run). The faithful shape is the nested LuaMap idiom
  // `LuaMap<number, LuaMap<number, number>>` — the keys are plain `number` tile
  // positions, not a branded `Hash`, and a non-string-keyed Lua table is `LuaMap`,
  // never a `Record` (which would imply a dense index object).
  [
    "tilemap.get_tiles:return:tiles",
    { kind: "mapping", key: "number", value: { key: "number", value: "number" } },
  ],
  // resource.get_text_metrics's `metrics` return is an untyped name-only <ul>
  // (width/height/max_ascent/max_descent, no <span class="type"> and no See
  // cross-reference), so parseTableFields recovers nothing and the whole slot
  // collapses to Record. The four fields are font metrics in pixels, i.e.
  // `number`; as a return-table object curation they are required.
  [
    "resource.get_text_metrics:return:metrics",
    {
      kind: "object",
      fields: [
        { name: "width", types: ["number"] },
        { name: "height", types: ["number"] },
        { name: "max_ascent", types: ["number"] },
        { name: "max_descent", types: ["number"] },
      ],
    },
  ],
  // profiler.view_recorded_frame's `frame_index` is a typed `<ul>` "specify one
  // of the following": `distance` and `frame`, both numeric frame offsets. The
  // <li> items carry no `<span class="type">`, so parseTableFields recovers
  // nothing and the slot collapses to Record. As a param option bag both fields
  // are optional (the caller supplies one), which the param-side `?` flag emits.
  [
    "profiler.view_recorded_frame:param:frame_index",
    {
      kind: "object",
      fields: [
        { name: "distance", types: ["number"] },
        { name: "frame", types: ["number"] },
      ],
    },
  ],
  // http.request's `headers` is "optional table with custom headers", a
  // string-keyed string map (no field list). Slot-path keying targets only
  // `headers`; the sibling `options` table stays parser-recovered.
  ["http.request:param:headers", { kind: "mapping", key: "string", value: "string" }],
  // collectionproxy.get_resources returns "the resources, or an empty list", a
  // homogeneous list of resource-path hashes (prose only, no field list).
  ["collectionproxy.get_resources:return:resources", { kind: "array", element: "hash" }],
  // render.predicate's `tags` is "table of tags ... can be of either hash or
  // string type", a homogeneous array whose element is the string|hash union.
  ["render.predicate:param:tags", { kind: "array", element: ["string", "hash"] }],
  // render.clear's `buffers` maps the numeric graphics.BUFFER_* constants to
  // their clear value: vector4 for the color buffer, number for depth/stencil.
  // The mapping value is the `number | vector4` union; the mapping string branch
  // splits the union token, so the value emits `number | Vector4`.
  ["render.clear:param:buffers", { kind: "mapping", key: "number", value: "number | vector4" }],
  // go.on_input and gui.on_input share the same well-known InputAction shape
  // (the on_input function description lists the well-known fields: value,
  // pressed, released, repeated, x/y/screen_x/screen_y/dx/dy/screen_dx/screen_dy,
  // plus gamepad/touch/text multi-touch fields). The doc markup carries no
  // field list of its own, so the shape is curated verbatim from the prose.
  // Param-side optional fields: each input kind (mouse/key/text/gamepad) sets a
  // different subset, so the call site always sees an `?` on every field.
  // `touch` stays `table` (the nested multi-touch table has no machine-readable
  // field list; mirrors the render.set_render_target.transient recursive case).
  // The element is the bare `on_input` script hook (no namespace prefix), the
  // same form the `on_message` arbitrary-table entry uses. The doc carries a
  // well-formed touch input table, so `touch` is curated as a nested
  // array-of-touch-records (the field has its own `<table>` listing id,
  // pressed, released, tap_count, x, y, dx, dy, acc_x/y/z).
  [
    "on_input:param:action",
    {
      kind: "object",
      fields: [
        { name: "value", types: ["number"], optional: true },
        { name: "pressed", types: ["boolean"], optional: true },
        { name: "released", types: ["boolean"], optional: true },
        { name: "repeated", types: ["boolean"], optional: true },
        { name: "x", types: ["number"], optional: true },
        { name: "y", types: ["number"], optional: true },
        { name: "screen_x", types: ["number"], optional: true },
        { name: "screen_y", types: ["number"], optional: true },
        { name: "dx", types: ["number"], optional: true },
        { name: "dy", types: ["number"], optional: true },
        { name: "screen_dx", types: ["number"], optional: true },
        { name: "screen_dy", types: ["number"], optional: true },
        { name: "gamepad", types: ["number"], optional: true },
        { name: "gamepad_axis", types: ["vector3"], optional: true },
        {
          name: "touch",
          types: ["table"],
          optional: true,
          isList: true,
          fields: [
            { name: "id", types: ["number"] },
            { name: "pressed", types: ["boolean"] },
            { name: "released", types: ["boolean"] },
            { name: "tap_count", types: ["number"] },
            { name: "x", types: ["number"] },
            { name: "y", types: ["number"] },
            { name: "dx", types: ["number"] },
            { name: "dy", types: ["number"] },
            { name: "acc_x", types: ["number"] },
            { name: "acc_y", types: ["number"] },
            { name: "acc_z", types: ["number"] },
          ],
        },
        { name: "text", types: ["string"], optional: true },
      ],
    },
  ],
  // physics.create_joint and physics.set_joint_properties both declare
  // `properties` as a joint-type-specific table; the only universal field is
  // `collide_connected` (parseTableFields already recovers it from the
  // <span class="type">+<code> shape in the create_joint doc and the bare
  // <code> shape in the set_joint_properties doc). Joint-type-specific fields
  // stay deferred — they live in joint-type-specific docs the parser cannot
  // see from a top-level param doc.
  [
    "physics.create_joint:param:properties",
    {
      kind: "object",
      fields: [{ name: "collide_connected", types: ["boolean"], optional: true }],
    },
  ],
  [
    "physics.set_joint_properties:param:properties",
    {
      kind: "object",
      fields: [{ name: "collide_connected", types: ["boolean"], optional: true }],
    },
  ],
  // physics.raycast's `result` is "a list … see ray_cast_response for details";
  // buildTableDocResolver resolves only FUNCTION elements so the cross-ref
  // cannot fire (the message payload lives in messages_doc.json, not the
  // FUNCTION slot pool). The shape is curated directly from the message
  // catalog (the six ray_cast_response payload fields). The doc declares a
  // `nil` branch ("If missed it returns <code>nil</code>"), so the existing
  // nil-aware emit already projects the curated array onto the
  // `array-object | nil` return type — no curation change needed there.
  [
    "physics.raycast:return:result",
    {
      kind: "array-object",
      fields: [
        { name: "fraction", types: ["number"] },
        { name: "position", types: ["vector3"] },
        { name: "normal", types: ["vector3"] },
        { name: "id", types: ["hash"] },
        { name: "group", types: ["hash"] },
        { name: "request_id", types: ["number"] },
      ],
    },
  ],
]);

// Slot-keyed (`element:param:name`, mirroring TABLE_SLOT_CURATIONS) replacements
// for a callback parameter's recovered signature, used where the generic
// `recoverCallbackSignature` `unknown`-everywhere form leaves real engine type
// information on the table. The value is the full emitted function type. Honest
// only: `window.set_listener` discriminates `event` by a known constant union and
// its `data` is a bare record (only resize carries fields — `isWindowEvent` is the
// path to typed `data`), mirroring the `msg.post` (send, typed) / `isMessage`
// (receive, narrow) split.
export const CALLBACK_SIGNATURE_CURATIONS: ReadonlyMap<string, string> = new Map([
  [
    "window.set_listener:param:callback",
    "(self: unknown, event: typeof WINDOW_EVENT_FOCUS_LOST | typeof WINDOW_EVENT_FOCUS_GAINED | typeof WINDOW_EVENT_RESIZED | typeof WINDOW_EVENT_ICONFIED | typeof WINDOW_EVENT_DEICONIFIED, data: Record<string | number, unknown>) => void",
  ],
]);

// resource.set_atlas's `table` param and resource.get_atlas's `data` return are
// flattened `<li><dl>` field lists whose `geometries` header is followed by the
// `table`-typed siblings `vertices`/`uvs`/`indices` — the grouping heuristic
// stops at the next `table` header, so `geometries` is left memberless and
// collapses to `Record`. The doc markup carries no signal that those number-list
// fields nest *under* `geometries` rather than beside it, so the nesting is
// hand-curated. Each geometry is the triangle data (the create-input form
// get_atlas mirrors via its cross-ref), and `vertices`/`uvs`/`indices` are
// brace-form number-lists, hence `numberList: true` (emitted `number[]`).
// Injected onto the already-parsed field list (every sibling stays
// parser-authoritative), so this is a nested-field curation, not a whole-slot
// object curation.
const ATLAS_GEOMETRY_MEMBERS: readonly TableField[] = [
  { name: "vertices", types: ["table"], numberList: true },
  { name: "uvs", types: ["table"], numberList: true },
  { name: "indices", types: ["table"], numberList: true },
];

export const NESTED_FIELD_CURATIONS: ReadonlyMap<string, readonly TableField[]> = new Map([
  ["resource.set_atlas:param:table:geometries", ATLAS_GEOMETRY_MEMBERS],
  ["resource.get_atlas:return:data:geometries", ATLAS_GEOMETRY_MEMBERS],
]);

/**
 * Recover a Defold `function(...)` callback-signature token into a TypeScript
 * function type. The token carries parameter names but no inner types, so each
 * param is typed `unknown`; arity and names are preserved so the callback stays
 * self-documenting on hover. Return is `void` — Defold callbacks are
 * side-effecting and the engine ignores any returned value. A param that is not
 * a valid TS identifier (e.g. the nested `function(function())`) is named
 * positionally `argN`. Returns `null` for any non-`function(...)` token, which
 * is the scope boundary both the emitter and the audit key off.
 *
 * Lives here rather than in `core-types.ts` because that module is fed verbatim
 * to typescript-to-lua as ambient source, and TSTL rejects regex literals.
 */
export function recoverCallbackSignature(token: string): string | null {
  const match = /^function\((.*)\)$/.exec(token);
  if (match === null) return null;
  const body = match[1] ?? "";
  const raw = body.trim() === "" ? [] : body.split(",");
  const named = raw.map((param, index) => {
    const trimmed = param.trim();
    return TS_IDENTIFIER.test(trimmed) ? trimmed : `arg${index}`;
  });
  return `(${named.map((n) => `${n}: unknown`).join(", ")}) => void`;
}

// The trailing `([^<]*)` captures the plain prose immediately after the type
// span up to the next tag. The "is this a list?" signal ("a list of …") lives in
// that prose, never in the field name or type token.
const TABLE_FIELD =
  /<dt>\s*<code>([^<]+)<\/code>\s*<\/dt>\s*<dd>\s*<span class="type">([^<]+)<\/span>([^<]*)/g;
const LIST_PROSE = /\ba list of\b/i;
// The slot-level array signal ("an array of …" / "a list of …") lives in the
// prose preceding the field list, never in a field's own `<dd>` (that is the
// per-field `LIST_PROSE` path). `isSlotLevelList` therefore tests only the
// substring before the first `<dl>`/`<ul>`/`<li>`, so a field-internal list
// marker can never wrap the whole slot.
export const SLOT_LEVEL_LIST_PROSE = /\b(an?\s+array of|a\s+list of)\b/i;
function isSlotLevelList(doc: string): boolean {
  const prefix = doc.split(/<dl>|<ul>|<li>/i)[0] ?? "";
  return SLOT_LEVEL_LIST_PROSE.test(prefix);
}
const FLATTENED_TABLE = /<li>\s*<dl>/;
// A number-list slot's element type is read from the brace form a "a list of …"
// `<dd>` ends with: `in the form {px0, py0, ..., pxn, pyn}` / `{i0, i1, ..., in}`.
// Every comma-separated token must be a numeric placeholder — an optional letter
// axis prefix then a digit (`px0`, `i2`, `0`) or the symbolic nth-index `pxn`/`un`
// — or an ellipsis; at least one must carry a digit. A brace body with quotes,
// nested braces, or plain word identifiers is not a number list and stays `Record`.
const NUMBER_LIST_BRACE = /\bin the form (?:of\s+)?\{([^}]*)\}/i;
const NUMBER_LIST_TOKEN = /^(?:[a-z]*\d+|[a-z]+n|\.\.\.|…)$/i;
function isNumberListForm(prose: string): boolean {
  const brace = NUMBER_LIST_BRACE.exec(prose);
  if (brace === null) return false;
  const body = brace[1] ?? "";
  if (/["<{]/.test(body)) return false;
  const tokens = body
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return false;
  let numeric = 0;
  for (const token of tokens) {
    if (!NUMBER_LIST_TOKEN.test(token)) return false;
    if (/\d/.test(token)) numeric += 1;
  }
  return numeric > 0;
}

// The `<ul>` typed-field shape lists a field as `<span class="type">T</span>
// <code>name</code>` — type first, name second, the reverse of the `<dl>` form.
const UL_TABLE_FIELD = /<li>\s*<span class="type">([^<]+)<\/span>\s*<code>([^<]+)<\/code>/g;
const DASH_TABLE_FIELD =
  /^\s*-\s*(?:<code>([^<]+)<\/code>|([A-Za-z_$][A-Za-z0-9_$]*))\s*<span class="type">([^<]+)<\/span>/gm;
// The code-dash shape names the field first inside a `<code>` and puts the dash
// between the name and its type span: `<code>NAME</code> - <span
// class="type">T</span>` (`sys.open_url`'s `target`). Untyped value lists in the
// same doc (`<code>_self</code> - prose`) carry no type span and never match.
const CODE_DASH_TABLE_FIELD = /<code>([^<]+)<\/code>\s*-\s*<span class="type">([^<]+)<\/span>/g;
// A cross-reference table doc carries no inline fields, only a pointer to a
// sibling element: `See <a href="…#<element.name>">…`. The capture is the
// fragment after `#` — the referenced element's full name. Non-global: a single
// match suffices and keeps `.exec` stateless.
const CROSS_REF_TABLE = /See\s+<a href="[^"]*#([^"]+)">/;
// A doc enumerating its own *typed* fields inline (`<dt>` or typed `<li>` items)
// owns its field list; a `See` anchor beside it is supplementary detail, not the
// slot's source of truth. The pure-pointer cross-reference branch fires only for
// a doc with no inline list of its own. When the inline list is an *untyped
// name-only* `<ul>` (`<li>NAME</li>`, no `<span class="type">`) the names alone
// recover nothing, so the supplementary branch adopts the referenced sibling's
// fields filtered to those names (`resource.get_atlas` lists
// `texture`/`geometries`/`animations` then points at `resource.set_atlas`).
const OWN_FIELD_LIST_MARKUP = /<dt>|<li>/;
// Plain `<li>NAME</li>` items — a bare identifier with no `<span class="type">`,
// `<code>`, or nested markup. Used to read the field *names* a supplementary
// cross-reference slot enumerates; the sibling supplies the types. Does not match
// the typed `<li>` forms `parseUlFields` handles, the flattened `<li><dl>` form,
// or multi-word prose `<li>` items.
const UL_NAME_FIELD = /<li>\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*<\/li>/g;

/**
 * Recover a `table`-typed slot's field structure from its doc HTML. Three
 * regular field shapes are recognised: the `<dl>` definition list
 * (`<dt><code>NAME</code></dt><dd><span class="type">T</span>…`), the `<ul>`
 * typed list (`<li><span class="type">T</span> <code>NAME</code>…`,
 * type-before-name), and dash-list option fields (`- NAME <span
 * class="type">T</span>` or `- <code>NAME</code> <span class="type">T</span>`,
 * name-before-type), and the code-dash form (`<code>NAME</code> - <span
 * class="type">T</span>`, name-in-code then dash then type). They all use the
 * same `<span class="type">` form `parseProperty` reads from a PROPERTY brief.
 * Returns the ordered `{ name, types }[]` (types split on `|`) when at least one
 * field matches, `null` otherwise — the boundary both the emitter and the
 * fidelity audit key off so the gate and the emitted surface cannot drift. The
 * `<dl>` form takes precedence; the `<ul>`, dash-list, and code-dash fallbacks
 * fire only when the earlier forms yield nothing.
 *
 * Lives here beside `recoverCallbackSignature` rather than in `core-types.ts`
 * because that module is fed verbatim to typescript-to-lua, which rejects regex
 * literals.
 */
export interface TableField {
  name: string;
  types: string[];
  fields?: TableField[];
  isList?: boolean;
  numberList?: boolean;
  optional?: boolean;
}

function parseUlFields(doc: string): TableField[] {
  const fields: TableField[] = [];
  for (const match of doc.matchAll(UL_TABLE_FIELD)) {
    const name = (match[2] ?? "").trim();
    const types = splitTypeTokens(match[1] ?? "");
    if (name.length > 0) fields.push({ name, types });
  }
  return fields;
}

function parseUlNames(doc: string): string[] {
  const names: string[] = [];
  for (const match of doc.matchAll(UL_NAME_FIELD)) {
    const name = (match[1] ?? "").trim();
    if (name.length > 0) names.push(name);
  }
  return names;
}

function parseDashListFields(doc: string): TableField[] {
  const fields: TableField[] = [];
  for (const match of doc.matchAll(DASH_TABLE_FIELD)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    const types = splitTypeTokens(match[3] ?? "");
    if (name.length > 0) fields.push({ name, types });
  }
  return fields;
}

function parseCodeDashFields(doc: string): TableField[] {
  const fields: TableField[] = [];
  for (const match of doc.matchAll(CODE_DASH_TABLE_FIELD)) {
    const name = (match[1] ?? "").trim();
    const types = splitTypeTokens(match[2] ?? "");
    if (name.length > 0) fields.push({ name, types });
  }
  return fields;
}

function splitTypeTokens(raw: string): string[] {
  return raw
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// Resolver from a referenced element's name to that element's first
// `table`-typed param-or-return doc. Threaded into `parseTableFields` so a
// cross-reference slot can adopt the referenced sibling's already-recovered
// fields. The resolver is module-scoped, so a cross-module anchor never
// resolves (left for a later slice).
export type TableDocResolver = (elementName: string) => string | undefined;

interface TableDocSource {
  name: string;
  slots: readonly { types: readonly string[]; doc: string }[];
}

export function buildTableDocResolver(sources: readonly TableDocSource[]): TableDocResolver {
  const docByName = new Map<string, string>();
  for (const source of sources) {
    if (docByName.has(source.name)) continue;
    const tableSlot = source.slots.find((slot) => slot.types.includes("table"));
    if (tableSlot !== undefined) docByName.set(source.name, tableSlot.doc);
  }
  return (elementName) => docByName.get(elementName);
}

export function parseTableFields(doc: string, resolver?: TableDocResolver): TableField[] | null {
  const fields: TableField[] = [];
  for (const match of doc.matchAll(TABLE_FIELD)) {
    const name = (match[1] ?? "").trim();
    const types = splitTypeTokens(match[2] ?? "");
    if (name.length === 0) continue;
    const field: TableField = { name, types };
    const prose = match[3] ?? "";
    if (types.includes("table") && LIST_PROSE.test(prose)) {
      field.isList = true;
      if (isNumberListForm(prose)) field.numberList = true;
    }
    fields.push(field);
  }
  if (FLATTENED_TABLE.test(doc) && fields.some((field) => isTableField(field))) {
    return groupFlattenedTableFields(fields);
  }
  // Nested recovery, scoped to the one unambiguous shape: a `<dl>` declaring a
  // single `table`-typed field whose keys sit in an immediately-following
  // top-level `<ul>` typed-field list (`window.get_safe_area`). Attach the
  // `<ul>` fields as that field's nested shape so the slot recovers as a nested
  // object instead of a `Record`.
  if (fields.length === 1) {
    const only = fields[0];
    if (only && only.types.length === 1 && only.types[0] === "table") {
      const nested = parseUlFields(doc);
      if (nested.length > 0) {
        only.fields = nested;
        return [only];
      }
    }
  }
  if (fields.length === 0) {
    for (const field of parseUlFields(doc)) fields.push(field);
  }
  if (fields.length === 0) {
    for (const field of parseDashListFields(doc)) fields.push(field);
  }
  if (fields.length === 0) {
    for (const field of parseCodeDashFields(doc)) fields.push(field);
  }
  if (fields.length > 0) return fields;
  // The direct parsers recovered nothing. If a resolver is present and the doc
  // is a cross-reference pointer, adopt the referenced element's fields. Recurse
  // without the resolver — the depth-1 / cycle guard: a referenced doc that is
  // itself only another cross-ref anchor recovers nothing.
  if (resolver !== undefined && !OWN_FIELD_LIST_MARKUP.test(doc)) {
    const ref = CROSS_REF_TABLE.exec(doc);
    const target = ref?.[1];
    if (target !== undefined) {
      const resolved = resolver(target);
      if (resolved !== undefined) return parseTableFields(resolved);
    }
  }
  // Supplementary cross-reference: an untyped name-only `<ul>` (recovered nothing
  // above) beside a `See <sibling>` pointer. Adopt the referenced sibling's
  // recovered fields, filtered to the names the own `<ul>` enumerates — the
  // filter is load-bearing: it excludes sibling fields this slot does not list,
  // so the recovery cannot raise the table-granularity loss count. One hop: the
  // sibling is resolved without the resolver (depth-1 / cycle guard).
  if (resolver !== undefined && OWN_FIELD_LIST_MARKUP.test(doc)) {
    const names = parseUlNames(doc);
    const ref = CROSS_REF_TABLE.exec(doc);
    const target = ref?.[1];
    if (names.length > 0 && target !== undefined) {
      const resolved = resolver(target);
      if (resolved !== undefined) {
        const resolvedFields = parseTableFields(resolved);
        if (resolvedFields !== null) {
          const wanted = new Set(names);
          const filtered = resolvedFields.filter((field) => wanted.has(field.name));
          if (filtered.length > 0) return filtered;
        }
      }
    }
  }
  return null;
}

function isTableField(field: TableField): boolean {
  return field.types.length === 1 && field.types[0] === "table";
}

function groupFlattenedTableFields(fields: readonly TableField[]): TableField[] {
  const grouped: TableField[] = [];
  let open: TableField | undefined;
  for (const field of fields) {
    if (isTableField(field)) {
      grouped.push(field);
      open = field;
      continue;
    }
    if (open === undefined) {
      grouped.push(field);
      continue;
    }
    open.fields ??= [];
    open.fields.push(field);
  }
  return grouped;
}

export function emitDeclarations(module: ApiModule, options?: EmitOptions): string {
  const prefix = `${module.namespace}.`;

  const constantFqns = new Set(module.constants.map((c) => c.name));
  const knownConstantFqns = options?.knownConstantFqns;
  const translations = options?.translations ?? {};
  const baseMapType = options?.mapType ?? defaultMapType;
  const mapType = (token: string): string =>
    constantFqns.has(token) || knownConstantFqns?.has(token)
      ? brandType(token)
      : baseMapType(token);

  const constants = module.constants
    .map((c) => prepareConstant(c, prefix))
    .filter((entry): entry is PreparedConstant => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const variables = module.variables
    .map((v) => prepareVariable(v, prefix))
    .filter((entry): entry is PreparedVariable => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const functions = module.functions
    .map((fn) => prepareFunction(fn, prefix))
    .filter((entry): entry is PreparedFunction => entry !== null)
    .sort((a, b) =>
      a.name === b.name
        ? a.original.parameters.length - b.original.parameters.length
        : a.name.localeCompare(b.name),
    );

  const resolver = buildTableDocResolver(
    module.functions.map((fn) => ({
      name: fn.name,
      slots: [...fn.parameters, ...fn.returnValues],
    })),
  );

  const typedefs = module.typedefs
    .filter((t) => TS_IDENTIFIER.test(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  // A re-export alias (`export { _x as x }`) switches the ambient namespace out
  // of its implicit-export mode, so once any alias is present every sibling
  // declaration must carry an explicit `export` keyword to stay visible. The
  // keyword is otherwise omitted to keep every alias-free module byte-identical.
  const hasAliases =
    variables.some((v) => TS_RESERVED_NAMES.has(v.name)) ||
    functions.some((fn) => TS_RESERVED_NAMES.has(fn.name));
  const decl = hasAliases ? "export " : "";

  const lines: string[] = [];
  for (const docLine of namespaceDocLines(module)) lines.push(docLine);
  lines.push(`declare namespace ${module.namespace} {`);

  for (const t of typedefs) {
    lines.push(`${INDENT}${decl}type ${t.name} = Opaque<"${t.name}">;`);
  }
  for (const c of constants) {
    for (const docLine of summaryDocLines(c.original.brief, c.original.description, INDENT)) {
      lines.push(docLine);
    }
    lines.push(`${INDENT}${decl}const ${c.name}: ${brandType(c.fqn)};`);
  }
  const aliases: { internal: string; public: string }[] = [];
  for (const v of variables) {
    // A reserved-name member's `_`-prefixed declaration stays un-exported so it
    // is local-only (not reachable as `ns._x`); the alias below re-exports it
    // under the public reserved name.
    const reserved = TS_RESERVED_NAMES.has(v.name);
    const emitName = aliasName(v.name, aliases);
    const line = emitVariable(v, emitName, mapType);
    if (line !== null) {
      for (const docLine of summaryDocLines(v.original.brief, v.original.description, INDENT)) {
        lines.push(docLine);
      }
      lines.push(`${INDENT}${reserved ? "" : decl}${line}`);
    }
  }
  for (const fn of functions) {
    const reserved = TS_RESERVED_NAMES.has(fn.name);
    const emitName = aliasName(fn.name, aliases);
    for (const docLine of functionDocLines(fn.original, translations)) lines.push(docLine);
    const line = emitFunction(fn, emitName, mapType, resolver);
    lines.push(`${INDENT}${reserved ? "" : decl}${line}`);
  }

  for (const alias of [...aliases].sort((a, b) => a.public.localeCompare(b.public))) {
    lines.push(`${INDENT}export { ${alias.internal} as ${alias.public} };`);
  }

  if (module.properties.length > 0) {
    const members = [...module.properties].sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`${INDENT}${decl}interface properties {`);
    for (const p of members) {
      for (const docLine of summaryDocLines(p.brief, p.description, `${INDENT}${INDENT}`)) {
        lines.push(docLine);
      }
      lines.push(`${INDENT}${INDENT}${emitPropertyMember(p, mapType)}`);
    }
    lines.push(`${INDENT}}`);
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

interface PreparedConstant {
  name: string;
  fqn: string;
  original: ApiConstant;
}

interface PreparedFunction {
  name: string;
  original: ApiFunction;
}

interface PreparedVariable {
  name: string;
  original: ApiVariable;
}

function prepareFunction(fn: ApiFunction, prefix: string): PreparedFunction | null {
  const stripped = stripPrefix(fn.name, prefix);
  if (!TS_IDENTIFIER.test(stripped)) return null;
  return { name: stripped, original: fn };
}

function prepareConstant(c: ApiConstant, prefix: string): PreparedConstant | null {
  const stripped = stripPrefix(c.name, prefix);
  if (!TS_IDENTIFIER.test(stripped)) return null;
  return { name: stripped, fqn: c.name, original: c };
}

function brandType(fqn: string): string {
  return `number & { readonly __brand: "${fqn}" }`;
}

function prepareVariable(v: ApiVariable, prefix: string): PreparedVariable | null {
  const stripped = stripPrefix(v.name, prefix);
  if (!TS_IDENTIFIER.test(stripped)) return null;
  return { name: stripped, original: v };
}

function stripPrefix(name: string, prefix: string): string {
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

// When a prepared member's name is a TS reserved word it cannot be emitted
// directly, so it is declared under an `_`-prefixed internal name and the
// `{ internal, public }` pair is recorded for a trailing `export { _x as x }`
// alias. Non-reserved names pass through unchanged.
function aliasName(name: string, aliases: { internal: string; public: string }[]): string {
  if (!TS_RESERVED_NAMES.has(name)) return name;
  const internal = `_${name}`;
  aliases.push({ internal, public: name });
  return internal;
}

function emitVariable(
  prepared: PreparedVariable,
  name: string,
  mapType: (t: string) => string,
): string {
  const ts =
    prepared.original.types.length > 0
      ? unionFromTokens(prepared.original.types, mapType)
      : "unknown";
  return `const ${name}: ${ts};`;
}

function emitFunction(
  prepared: PreparedFunction,
  name: string,
  mapType: (t: string) => string,
  resolver: TableDocResolver,
): string {
  const original = prepared.original.parameters;
  const elementName = prepared.original.name;
  const cutoff = trailingOptionalCutoff(original);
  const params = original
    .map((p, i) => emitParameter(p, i, i >= cutoff, mapType, resolver, elementName))
    .join(", ");
  const ret = emitReturn(prepared.original.returnValues, mapType, resolver, elementName);
  return `function ${name}(${params}): ${ret.type};${ret.trailing}`;
}

// Build the indented JSDoc lines for a function from its ref-doc prose. The
// summary prefers the full `description`, falling back to the one-line `brief`;
// each `@param` name is the parameter's *emitted* name (the `arg<index>`
// fallback applies to non-identifier names, matching `emitParameter`) so the tag
// resolves on hover; a single documented return becomes `@returns`. Returns `[]`
// for a fully-undocumented function, leaving its emission byte-identical.
function functionDocLines(fn: ApiFunction, translations: TranslationStore): string[] {
  const params = fn.parameters.map((p, index) => ({
    name: safeParamName(p.name, index),
    doc: htmlToDocText(p.doc),
  }));
  const onlyReturn = fn.returnValues.length === 1 ? fn.returnValues[0] : undefined;
  const lua = htmlToCodeText(fn.examples ?? "");
  // A hand-authored TS translation pinned to this exact Lua flips the fence to
  // ```ts; any hash mismatch (or absent translation) keeps the Lua fallback.
  const ts = lua === "" ? null : lookupTranslation(translations, fn.name, hashExampleSource(lua));
  const exampleParts: Pick<DocCommentParts, "example" | "exampleLang"> =
    ts !== null ? { example: ts, exampleLang: "ts" } : lua !== "" ? { example: lua } : {};
  const parts: DocCommentParts = {
    summary: htmlToDocText(summaryFor(fn.brief, fn.description)),
    params,
    ...(onlyReturn ? { returns: htmlToDocText(onlyReturn.doc) } : {}),
    ...exampleParts,
  };
  return indentDocLines(parts, INDENT);
}

// Summary-only doc lines for a member that carries no params or returns
// (constants, variables, `properties` members). Reuses the same renderer and
// summary precedence as functions; returns `[]` for an undocumented member so
// its emission stays byte-identical. `indent` matches the member's own
// indentation depth (one level inside the namespace, two inside `properties`).
function summaryDocLines(brief: string, description: string, indent: string): string[] {
  return indentDocLines({ summary: htmlToDocText(summaryFor(brief, description)) }, indent);
}

function namespaceDocLines(module: ApiModule): string[] {
  const official = summaryFor(module.brief, module.description).trim();
  const summary =
    official.length > 0
      ? htmlToDocText(official)
      : `(synthesized)\nDefold \`${module.namespace}\` API namespace.`;
  return indentDocLines({ summary }, "");
}

function indentDocLines(parts: DocCommentParts, indent: string): string[] {
  return renderDocComment(parts).map((line) => `${indent}${line}`);
}

// Prefer the full `description`; fall back to the one-line `brief` when prose is
// absent. Shared by every documented member kind so the summary source is
// consistent across functions, constants, variables, and properties.
export function summaryFor(brief: string, description: string): string {
  return description.trim() !== "" ? description : brief;
}

function isDocOptional(p: ApiParameter): boolean {
  return p.isOptional || p.types.includes("nil");
}

function trailingOptionalCutoff(params: readonly ApiParameter[]): number {
  let cutoff = params.length;
  for (let i = params.length - 1; i >= 0; i -= 1) {
    const p = params[i];
    if (p && isDocOptional(p)) cutoff = i;
    else break;
  }
  return cutoff;
}

function emitParameter(
  p: ApiParameter,
  index: number,
  optional: boolean,
  mapType: (t: string) => string,
  resolver: TableDocResolver,
  elementName: string,
): string {
  const name = safeParamName(p.name, index);
  const concrete = p.types.filter((t) => t !== "nil");
  const ts =
    concrete.length > 0
      ? mapSlotUnion(concrete, p.doc, mapType, true, resolver, elementName, "param", p.name)
      : "unknown";
  return `${name}${optional ? "?" : ""}: ${ts}`;
}

function emitReturn(
  returnValues: ApiParameter[],
  mapType: (t: string) => string,
  resolver: TableDocResolver,
  elementName: string,
): { type: string; trailing: string } {
  if (returnValues.length === 0) return { type: "void", trailing: "" };
  if (returnValues.length > 1) {
    // Defold multi-returns are positional and always present; each slot maps
    // straight through (unknown when the doc lists no type) into a tuple that
    // typescript-to-lua erases to `local a, b = fn()`.
    const slots = returnValues.map((rv) =>
      rv.types.length > 0
        ? mapSlotUnion(rv.types, rv.doc, mapType, false, resolver, elementName, "return", rv.name)
        : "unknown",
    );
    return { type: `LuaMultiReturn<[${slots.join(", ")}]>`, trailing: "" };
  }
  const first = returnValues[0];
  if (!first) return { type: "void", trailing: "" };
  const ts =
    first.types.length > 0
      ? mapSlotUnion(
          first.types,
          first.doc,
          mapType,
          false,
          resolver,
          elementName,
          "return",
          first.name,
        )
      : "unknown";
  return { type: ts, trailing: "" };
}

function emitPropertyMember(p: ApiProperty, mapType: (t: string) => string): string {
  const key = TS_IDENTIFIER.test(p.name) ? p.name : JSON.stringify(p.name);
  const ts = p.types.length > 0 ? unionFromTokens(p.types, mapType) : "unknown";
  return `${key}: ${ts};`;
}

// Like `unionFromTokens`, but a `table` token whose slot doc carries a parseable
// `<dl>` field list emits an inline object type instead of the opaque `Record`
// fallback. Other tokens in the union map unchanged. `optionalFields` marks the
// recovered fields `?` for input params — a `<dl>` does not encode per-field
// optionality and an input option-bag's fields are individually omittable (the
// old `Record` accepted partial/empty objects), so a parameter's fields are
// optional while a return's fields (engine-populated, all present) stay required.
function mapSlotUnion(
  types: readonly string[],
  doc: string,
  mapType: (t: string) => string,
  optionalFields: boolean,
  resolver: TableDocResolver,
  elementName: string,
  slotKind?: "param" | "return",
  slotName?: string,
): string {
  const mapped: string[] = [];
  const seen = new Set<string>();
  for (const token of types) {
    let ts: string;
    if (token === "table") {
      const curation =
        slotKind !== undefined && slotName !== undefined
          ? TABLE_SLOT_CURATIONS.get(tableSlotKey(elementName, slotKind, slotName))
          : undefined;
      const mapping =
        curation?.kind === "mapping" ? curation : MAPPING_TABLE_SLOTS.get(elementName);
      const element =
        curation?.kind === "array" ? curation.element : HOMOGENEOUS_ARRAY_SLOTS.get(elementName);
      if (mapping !== undefined) {
        let value: string;
        if (typeof mapping.value === "string") {
          // A mapping value may be a `T | U` union token (render.clear's
          // `number | vector4` clear value); split on `|` so each token maps
          // individually. A single-token value (no `|`) is unaffected.
          value = unionFromTokens(
            mapping.value.split("|").map((token) => token.trim()),
            mapType,
          );
        } else if (Array.isArray(mapping.value)) {
          value = inlineTableType(mapping.value, mapType, optionalFields);
        } else {
          const nested = mapping.value as NestedMapping;
          value = `LuaMap<${mapType(nested.key)}, ${mapType(nested.value)}>`;
        }
        ts = `LuaMap<${mapType(mapping.key)}, ${value}>`;
      } else if (element !== undefined) {
        ts = arrayTypeFromTokens(element, mapType);
      } else if (curation?.kind === "object" || curation?.kind === "array-object") {
        const object = inlineTableType(curation.fields, mapType, optionalFields);
        ts = curation.kind === "array-object" ? `${object}[]` : object;
      } else {
        const parsed = parseTableFields(doc, resolver);
        if (parsed !== null) {
          const fields = applyNestedFieldCurations(elementName, slotKind, slotName, parsed);
          const object = inlineTableType(fields, mapType, optionalFields);
          ts = isSlotLevelList(doc) ? `${object}[]` : object;
        } else {
          ts = mapType(token);
        }
      }
    } else {
      const curated =
        slotKind !== undefined && slotName !== undefined
          ? CALLBACK_SIGNATURE_CURATIONS.get(tableSlotKey(elementName, slotKind, slotName))
          : undefined;
      ts = curated ?? mapType(token);
    }
    if (seen.has(ts)) continue;
    seen.add(ts);
    mapped.push(ts);
  }
  return mapped.join(" | ");
}

function tableSlotKey(elementName: string, slotKind: "param" | "return", slotName: string): string {
  return `${elementName}:${slotKind}:${slotName}`;
}

function nestedFieldKey(
  elementName: string,
  slotKind: "param" | "return",
  slotName: string,
  fieldName: string,
): string {
  return `${tableSlotKey(elementName, slotKind, slotName)}:${fieldName}`;
}

// Inject the curated nested members of NESTED_FIELD_CURATIONS onto the matching
// top-level field of an otherwise parser-recovered slot, leaving every sibling
// parser-authoritative. A field the parser already gave nested fields is left
// alone (parser won). Returns a new array; never mutates the parser's result.
export function applyNestedFieldCurations(
  elementName: string,
  slotKind: "param" | "return" | undefined,
  slotName: string | undefined,
  fields: readonly TableField[],
): TableField[] {
  if (slotKind === undefined || slotName === undefined) return [...fields];
  return fields.map((field) => {
    if (field.fields !== undefined) return field;
    const curated = NESTED_FIELD_CURATIONS.get(
      nestedFieldKey(elementName, slotKind, slotName, field.name),
    );
    if (curated === undefined) return field;
    return { ...field, fields: [...curated], isList: true };
  });
}

function arrayTypeFromTokens(
  element: string | readonly string[],
  mapType: (t: string) => string,
): string {
  const tokens = typeof element === "string" ? [element] : element;
  return tokens.length > 1
    ? `(${unionFromTokens(tokens, mapType)})[]`
    : `${mapType(tokens[0] as string)}[]`;
}

export function inlineTableType(
  fields: readonly TableField[],
  mapType: (t: string) => string,
  optionalFields: boolean,
): string {
  const members = fields.map((field) => {
    const key = TS_IDENTIFIER.test(field.name) ? field.name : JSON.stringify(field.name);
    // A field carrying recovered nested fields (the mixed `<dl>`+`<ul>` shape)
    // emits a one-level-nested inline object; every other field token maps
    // through the same machinery as a top-level slot. Deeper nesting is not
    // recovered — a nested `table` field with no nested fields stays `Record`.
    // A field whose doc reads "a list of …" emits an array of that recovered
    // element shape, but only when members were recovered — a bare `Record` with
    // no machine-readable element type is left unwrapped (no stray `[]`). A
    // number-list field carries no member shape but a machine-readable numeric
    // element type ("in the form {px0, …}"), so it emits `number[]`.
    const ts =
      field.fields !== undefined
        ? `${inlineTableType(field.fields, mapType, optionalFields)}${field.isList ? "[]" : ""}`
        : field.numberList === true
          ? "number[]"
          : field.types.length > 0
            ? unionFromTokens(field.types, mapType)
            : "unknown";
    return `${key}${optionalFields ? "?" : ""}: ${ts}`;
  });
  return `{ ${members.join("; ")} }`;
}

function unionFromTokens(tokens: readonly string[], mapType: (t: string) => string): string {
  const mapped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const ts = mapType(token);
    if (seen.has(ts)) continue;
    seen.add(ts);
    mapped.push(ts);
  }
  return mapped.join(" | ");
}

function defaultMapType(token: string): string {
  if (Object.hasOwn(DEFOLD_TYPE_MAP, token)) {
    const mapped = DEFOLD_TYPE_MAP[token];
    if (typeof mapped === "string") return mapped;
  }
  const callback = recoverCallbackSignature(token);
  if (callback !== null) return callback;
  return "unknown";
}
