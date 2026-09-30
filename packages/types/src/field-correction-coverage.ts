import type { ApiFunction, ApiModule, ApiParameter, ApiStruct } from "./api-doc";
import {
  LIST_FIELD_CORRECTIONS,
  memberCorrectionKey,
  REQUIRED_FIELD_CORRECTIONS,
  RETURN_FIELD_OPTIONALITY_CORRECTIONS,
} from "./emit-dts";
import { matchBracket, splitTopLevel } from "./luals-type-expr";

// The slot-keyed field corrections are applied to fields recovered from a prose
// `table` slot. A release that types the slot as a `STRUCT` or an inline record
// recovers no fields, so each such entry must be stated upstream already or be
// carried by a member-keyed entry on the struct; anything else would go inert.
export interface FieldCorrectionTables {
  readonly required: ReadonlyMap<string, unknown>;
  readonly list: ReadonlyMap<string, unknown>;
  readonly optionality: ReadonlyMap<string, unknown>;
}

export const FIELD_CORRECTION_TABLES: FieldCorrectionTables = {
  required: REQUIRED_FIELD_CORRECTIONS,
  list: LIST_FIELD_CORRECTIONS,
  optionality: RETURN_FIELD_OPTIONALITY_CORRECTIONS,
};

export interface FieldCorrectionGap {
  readonly key: string;
  // The struct whose member would carry the correction, when the path reached one.
  readonly struct?: string;
  readonly reason: string;
}

type Kind = keyof FieldCorrectionTables;

interface Member {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
}

// A slot or member type resolved to the members it declares: a `STRUCT` by name,
// or an inline `{ name:type, ... }` record.
interface Shape {
  readonly struct?: string;
  readonly members: readonly Member[];
}

const PROSE_TABLE = "table";

function stripList(type: string): string {
  let t = type.trim();
  while (t.endsWith("[]")) t = t.slice(0, -2).trim();
  while (t.startsWith("(") && matchBracket(t, 0) === t.length - 1) t = t.slice(1, -1).trim();
  return t;
}

function recordMembers(record: string): Member[] {
  return splitTopLevel(record.slice(1, -1), ",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const colon = part.indexOf(":");
      const raw = colon === -1 ? part : part.slice(0, colon).trim();
      const optional = raw.endsWith("?");
      return {
        name: optional ? raw.slice(0, -1) : raw,
        type: colon === -1 ? "" : part.slice(colon + 1).trim(),
        optional,
      };
    });
}

function shapeOf(type: string, structs: ReadonlyMap<string, ApiStruct>): Shape | null {
  const t = stripList(type);
  if (t.startsWith("{") && matchBracket(t, 0) === t.length - 1) {
    return { members: recordMembers(t) };
  }
  const struct = structs.get(t);
  if (struct === undefined) return null;
  return {
    struct: struct.name,
    members: struct.members.map((member) => ({
      name: member.name,
      type: member.type,
      optional: member.isOptional,
    })),
  };
}

function parseKey(key: string): {
  element: string;
  kind: "param" | "return";
  slot: string;
  segments: string[];
} | null {
  const [element, kind, slot, path, ...rest] = key.split(":");
  if (
    element === undefined ||
    slot === undefined ||
    path === undefined ||
    rest.length > 0 ||
    (kind !== "param" && kind !== "return")
  ) {
    return null;
  }
  return { element, kind, slot, segments: path.split(".").map((s) => s.replace(/\[\]$/, "")) };
}

function slotsNamed(
  overloads: readonly ApiFunction[],
  kind: "param" | "return",
  slot: string,
): ApiParameter[] {
  return overloads.flatMap((fn) =>
    (kind === "param" ? fn.parameters : fn.returnValues).filter((p) => p.name === slot),
  );
}

function slotGap(
  key: string,
  table: Kind,
  slotTypes: readonly string[],
  segments: readonly string[],
  structs: ReadonlyMap<string, ApiStruct>,
  tables: FieldCorrectionTables,
): FieldCorrectionGap | null {
  const shapes = slotTypes.map((type) => shapeOf(type, structs)).filter((s) => s !== null);
  if (shapes.length === 0) {
    return { key, reason: `slot is typed ${slotTypes.join("|")}, which declares no members` };
  }
  for (const initial of shapes) {
    let shape: Shape = initial;
    for (const [index, name] of segments.entries()) {
      const member = shape.members.find((candidate) => candidate.name === name);
      const struct = shape.struct === undefined ? {} : { struct: shape.struct };
      if (member === undefined) return { key, ...struct, reason: `no member ${name}` };
      if (index < segments.length - 1) {
        const next = shapeOf(member.type, structs);
        if (next === null) {
          return { key, ...struct, reason: `member ${name} is typed ${member.type}` };
        }
        shape = next;
        continue;
      }
      const carried =
        shape.struct !== undefined && tables[table].has(memberCorrectionKey(shape.struct, name));
      const upstream =
        table === "required" ? !member.optional : table === "optionality" ? member.optional : false;
      if (!carried && !upstream) {
        return {
          key,
          ...struct,
          reason: `neither upstream nor a member-keyed ${table} correction states it`,
        };
      }
    }
  }
  return null;
}

/**
 * Every slot-keyed field correction that goes inert on these modules — one
 * target's, after its skip rules, since a slot in `b2d.fixture` can name a struct
 * `b2d` declares. An element the target does not declare, and a slot still typed
 * as a prose `table`, are out of scope and report nothing.
 */
export function fieldCorrectionGaps(
  modules: readonly ApiModule[],
  tables: FieldCorrectionTables = FIELD_CORRECTION_TABLES,
): FieldCorrectionGap[] {
  const structs = new Map(
    modules.flatMap((module) => module.structs ?? []).map((struct) => [struct.name, struct]),
  );
  const functions = modules.flatMap((module) => module.functions);
  const gaps: FieldCorrectionGap[] = [];
  for (const table of ["required", "list", "optionality"] as const) {
    for (const key of tables[table].keys()) {
      const parsed = parseKey(key);
      if (parsed === null) continue;
      const overloads = functions.filter((fn) => fn.name === parsed.element);
      if (overloads.length === 0) continue;
      const slots = slotsNamed(overloads, parsed.kind, parsed.slot);
      if (slots.length === 0) {
        gaps.push({ key, reason: `${parsed.element} declares no ${parsed.kind} ${parsed.slot}` });
        continue;
      }
      for (const slot of slots) {
        if (slot.types.includes(PROSE_TABLE)) continue;
        const gap = slotGap(key, table, slot.types, parsed.segments, structs, tables);
        if (gap !== null) {
          gaps.push(gap);
          break;
        }
      }
    }
  }
  return gaps;
}

export function formatFieldCorrectionGaps(gaps: readonly FieldCorrectionGap[]): string {
  return gaps
    .map((gap) => `${gap.key}${gap.struct === undefined ? "" : ` (${gap.struct})`}: ${gap.reason}`)
    .join("\n");
}
