/**
 * The OpenAPI/proto ingestion front-end's parser: a fifth `library-types` corpus
 * source beside the LuaLS annotations (`parse-luals.ts`), the typed `.script_api`
 * (`scriptApiToFixtureJson`), the README markdown (`parse-markdown-api.ts`), and
 * the authored `.d.ts` lane. It reads a structured REST swagger (JSON) plus the
 * realtime `.proto` message list — the machine-readable source a codegen'd Lua
 * client (nakama-defold) is generated from — and produces the same ref-doc `doc`
 * shape those front-ends feed the shared emitter (`generateModuleDeclaration`), so
 * the OpenAPI path reuses the exact emit + fidelity machinery.
 *
 * The surface mirrors the client codegen's naming, not the raw wire schema:
 *
 * - a swagger `paths` operation (`operationId` `Nakama_AuthenticateCustom`) becomes
 *   a client RPC function `authenticate_custom` (service prefix stripped, snake);
 * - a swagger `definitions` object (`apiAccountCustom`) becomes a constructor
 *   `create_api_account_custom`;
 * - a realtime proto `message ChannelMessageSend` becomes a realtime message
 *   constructor `create_channel_message_send_message`.
 *
 * Scope is a **flat signature surface**, not deep schema modelling (a PRD
 * non-goal): swagger scalar types and `$ref`/object/array types collapse to the
 * emitter's token vocabulary (`string`/`number`/`boolean`/`table`), and proto
 * scalars/messages likewise. Every parameter and return slot carries at least one
 * resolvable token — a slot is never left type-empty (the "no silent swallow"
 * contract the fidelity gate depends on).
 */

/** A single ref-doc parameter or return slot. `is_optional` mirrors the consumer
 * contract's string flag (`"True"`); it is present only when set. */
export interface OpenApiParam {
  name: string;
  doc: string;
  types: string[];
  is_optional?: "True";
}

export interface OpenApiElement {
  type: "FUNCTION";
  name: string;
  description: string;
  parameters: OpenApiParam[];
  returnvalues: OpenApiParam[];
}

/** The ref-doc `doc` shape `generateModuleDeclaration` consumes. `info.namespace`
 * is empty here — the swagger/proto source names no publish alias — and the
 * front-end retargets the bare element names onto the pinned namespace. */
export interface OpenApiDoc {
  info: { namespace: string; brief: string; description: string };
  elements: OpenApiElement[];
}

/** camelCase / PascalCase -> snake_case, splitting acronym runs on the trailing
 * capitalised word (`HTTPStatus` -> `http_status`). */
function snake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/** Map a swagger schema type keyword to a resolvable emitter token. Object,
 * array, and `$ref` shapes all collapse to `table` (a Lua table), the faithful
 * shape a Lua client marshals them as. */
function swaggerType(type: string | undefined, hasRef: boolean): string {
  if (hasRef) return "table";
  switch (type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    default:
      // `object`, `array`, and anything unrecognised marshal as a table.
      return "table";
  }
}

interface SwaggerSchema {
  type?: string;
  $ref?: string;
  items?: SwaggerSchema;
  properties?: Record<string, SwaggerSchema>;
  required?: string[];
  additionalProperties?: unknown;
}

interface SwaggerParameter {
  name: string;
  in: string;
  required?: boolean;
  type?: string;
  schema?: SwaggerSchema;
  description?: string;
}

interface SwaggerOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: SwaggerParameter[];
  responses?: Record<string, { schema?: SwaggerSchema; description?: string }>;
}

interface SwaggerRoot {
  paths?: Record<string, Record<string, SwaggerOperation>>;
  definitions?: Record<string, SwaggerSchema>;
}

/** Strip a leading `Service_` prefix from an operationId, then snake the rest. */
function operationName(operationId: string): string {
  const underscore = operationId.indexOf("_");
  const bare = underscore >= 0 ? operationId.slice(underscore + 1) : operationId;
  return snake(bare);
}

function schemaToken(schema: SwaggerSchema): string {
  return swaggerType(schema.type, typeof schema.$ref === "string");
}

function swaggerParamSlot(param: SwaggerParameter): OpenApiParam {
  const token =
    param.in === "body" && param.schema !== undefined
      ? schemaToken(param.schema)
      : swaggerType(param.type, false);
  const slot: OpenApiParam = {
    name: param.name,
    doc: (param.description ?? "").trim(),
    types: [token],
  };
  if (param.required !== true) slot.is_optional = "True";
  return slot;
}

function swaggerReturnSlots(op: SwaggerOperation): OpenApiParam[] {
  const schema = op.responses?.["200"]?.schema;
  if (schema === undefined) return [];
  return [{ name: "result", doc: "", types: [schemaToken(schema)] }];
}

function parseSwaggerOperations(root: SwaggerRoot): OpenApiElement[] {
  const elements: OpenApiElement[] = [];
  for (const methods of Object.values(root.paths ?? {})) {
    for (const op of Object.values(methods)) {
      if (typeof op.operationId !== "string") continue;
      elements.push({
        type: "FUNCTION",
        name: operationName(op.operationId),
        description: (op.summary ?? op.description ?? "").trim(),
        parameters: (op.parameters ?? []).map(swaggerParamSlot),
        returnvalues: swaggerReturnSlots(op),
      });
    }
  }
  return elements;
}

function parseSwaggerDefinitions(root: SwaggerRoot): OpenApiElement[] {
  const elements: OpenApiElement[] = [];
  for (const [name, schema] of Object.entries(root.definitions ?? {})) {
    // Only object definitions become constructors; enum/scalar definitions carry
    // no properties and would emit a meaningless zero-argument builder.
    if (schema.type !== "object" || schema.properties === undefined) continue;
    const required = new Set(schema.required ?? []);
    const parameters = Object.entries(schema.properties).map(([propName, propSchema]) => {
      const slot: OpenApiParam = { name: propName, doc: "", types: [schemaToken(propSchema)] };
      if (!required.has(propName)) slot.is_optional = "True";
      return slot;
    });
    elements.push({
      type: "FUNCTION",
      name: `create_${snake(name)}`,
      description: (root.definitions?.[name] as { description?: string }).description?.trim() ?? "",
      parameters,
      returnvalues: [{ name: "result", doc: "", types: ["table"] }],
    });
  }
  return elements;
}

/** Map a proto field type to a resolvable emitter token. Scalar numerics and
 * `bytes` collapse per Lua marshalling; message/enum/`map`/`repeated` types are
 * tables. */
function protoType(rawType: string): string {
  const type = rawType.trim();
  if (type.startsWith("map<") || type.startsWith("repeated ")) return "table";
  switch (type) {
    case "double":
    case "float":
    case "int32":
    case "int64":
    case "uint32":
    case "uint64":
    case "sint32":
    case "sint64":
    case "fixed32":
    case "fixed64":
    case "sfixed32":
    case "sfixed64":
      return "number";
    case "bool":
      return "boolean";
    case "string":
    case "bytes":
      return "string";
    default:
      // A message- or enum-typed field marshals as a table.
      return "table";
  }
}

// A proto field line: an optional `repeated`, a type (`map<...>` allowed), a field
// name, `=`, a tag, `;`. Reserved lines, `oneof`, options, and nested blocks are
// ignored by requiring the `= <tag>;` tail.
const PROTO_FIELD = /^\s*(map<[^>]+>|repeated\s+[\w.]+|[\w.]+)\s+([a-z_]\w*)\s*=\s*\d+\s*;/;
const PROTO_MESSAGE_OPEN = /^message\s+([A-Za-z_]\w*)\s*\{/;
// A `oneof` groups alternatives that are the enclosing message's own fields; any
// other block (`message`/`enum`) owns its fields and must not leak them upward, so
// non-`oneof` openers default to an isolating `other` frame.
const PROTO_ONEOF_OPEN = /^\s*oneof\s+[A-Za-z_]\w*\s*\{/;

function parseProtoMessages(protoText: string): OpenApiElement[] {
  const elements: OpenApiElement[] = [];
  const lines = protoText.split("\n");
  let current: { name: string; parameters: OpenApiParam[] } | null = null;
  // Block-kind frames nested inside the current message, excluding the message
  // root (which `current !== null` represents). Integer depth cannot tell a
  // `oneof` alternative (a parent field) from a nested-`message` field (not one);
  // the frame kinds carry that distinction.
  let frames: Array<"oneof" | "other"> = [];

  const emit = () => {
    if (current === null) return;
    elements.push({
      type: "FUNCTION",
      name: `create_${snake(current.name)}_message`,
      description: "",
      parameters: current.parameters,
      returnvalues: [],
    });
    current = null;
    frames = [];
  };

  // Account one message-body segment (a whole line, or the tail of the open line
  // after its header brace): count a field only when the frames above the root
  // are empty or all `oneof`, then apply the segment's braces — a `}` that finds
  // no nested frame closes the message root.
  const processBody = (body: string): void => {
    if (current === null) return;
    const field = PROTO_FIELD.exec(body);
    if (field !== null && frames.every((f) => f === "oneof")) {
      const slot: OpenApiParam = {
        name: field[2] as string,
        doc: "",
        types: [protoType(field[1] as string)],
      };
      if (frames.includes("oneof")) slot.is_optional = "True";
      current.parameters.push(slot);
    }
    const openKind: "oneof" | "other" = PROTO_ONEOF_OPEN.test(body) ? "oneof" : "other";
    for (let i = 0; i < (body.match(/\{/g) ?? []).length; i++) frames.push(openKind);
    for (let i = 0; i < (body.match(/\}/g) ?? []).length; i++) {
      if (frames.length > 0) {
        frames.pop();
      } else {
        emit();
        return;
      }
    }
  };

  for (const line of lines) {
    if (current === null) {
      const open = PROTO_MESSAGE_OPEN.exec(line);
      if (open !== null) {
        current = { name: open[1] as string, parameters: [] };
        frames = [];
        // Process the same line's remainder so `message Ping {}` closes here
        // instead of swallowing every following top-level message.
        processBody(line.slice(open[0].length));
      }
      continue;
    }
    processBody(line);
  }
  return elements;
}

/**
 * Parse the pinned swagger JSON and realtime `.proto` into the shared ref-doc
 * `doc` shape. Swagger operations, swagger object definitions, and proto messages
 * each contribute one element; the first occurrence of a codegen'd name wins so a
 * definition and a like-named operation never emit a duplicate member.
 */
export function parseOpenApi(swaggerText: string, protoText: string): OpenApiDoc {
  const root = JSON.parse(swaggerText) as SwaggerRoot;
  const all = [
    ...parseSwaggerOperations(root),
    ...parseSwaggerDefinitions(root),
    ...parseProtoMessages(protoText),
  ];
  const seen = new Set<string>();
  const elements: OpenApiElement[] = [];
  for (const element of all) {
    if (seen.has(element.name)) continue;
    seen.add(element.name);
    elements.push(element);
  }
  return { info: { namespace: "", brief: "", description: "" }, elements };
}
