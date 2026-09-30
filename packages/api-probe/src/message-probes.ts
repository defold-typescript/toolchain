import ts from "typescript";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import {
  declaredKinds,
  declaredMembers,
  surfaceProgram,
  UnmappedLuaKindError,
} from "../../types/scripts/lua-kind";
import { type ApiTarget, MESSAGES_MANIFEST } from "../../types/scripts/regen";
import { parseMessagesDoc } from "../../types/src/emit-messages";
import { MESSAGE_FIELD_OVERRIDES, MESSAGE_ORIGINS, MESSAGE_RECEIVERS } from "./contexts";
import type { Unverified } from "./index-probes";
import { MESSAGE_DENYLIST } from "./probe-denylist";
import {
  type MessageScript,
  NoWitness,
  type ProbeCall,
  probeTarget,
  type QueueStep,
  typeWitness,
} from "./witness";

// Messages only the engine sends. The go script checks each one it receives
// against the declared payload.
const INCOMING: ReadonlySet<string> = new Set([
  "animation_done",
  "collision_event",
  "collision_response",
  "contact_point_event",
  "contact_point_response",
  "layout_changed",
  "model_animation_done",
  "proxy_error",
  "proxy_loaded",
  "proxy_loading",
  "proxy_ready",
  "proxy_unloaded",
  "ray_cast_missed",
  "ray_cast_response",
  "sound_done",
  "sound_stopped",
  "text_object_clicked",
  "text_object_hovered",
  "text_object_unhovered",
  "trigger_event",
  "trigger_response",
  "window_resized",
]);

// The incoming messages `project/` makes the engine send to the go script: the
// sprite plays its one-shot `anim`, the proxy loads and unloads, a dynamic box
// rests on the static one, and a trigger volume overlaps it.
const TRIGGERED: ReadonlySet<string> = new Set([
  "animation_done",
  "collision_response",
  "contact_point_response",
  "proxy_loaded",
  "proxy_unloaded",
  "trigger_response",
]);

// Fields the engine sends that the reference does not document, with their
// kind. The check accepts them without the declarations growing an
// undocumented field, and still checks each one's kind.
const UNDOCUMENTED_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  collision_response: { group: "hash" },
  contact_point_response: { group: "hash" },
  trigger_response: { group: "hash" },
};

// A collection proxy refuses a message its state does not allow, so its
// messages run last, in the order a real load cycle posts them.
const PROXY_SEQUENCE: readonly (string | { readonly wait: string })[] = [
  "load",
  { wait: "proxy_loaded" },
  "init",
  "set_time_step",
  "final",
  "unload",
  { wait: "proxy_unloaded" },
  "async_load",
  { wait: "proxy_loaded" },
];

export interface MessageProbe {
  readonly id: string;
  // The ref-doc namespace the message belongs to.
  readonly origin: string;
  // The `PROBE_URLS` receiver an outgoing message is posted to.
  readonly receiver?: string;
  readonly direction: "outgoing" | "incoming" | "denied";
}

export interface MessageGeneration extends MessageScript {
  readonly probes: readonly MessageProbe[];
  readonly calls: readonly ProbeCall[];
  readonly unverified: readonly Unverified[];
  // Messages the probe cannot address or build a payload for, with the reason.
  readonly unknown: readonly string[];
}

function builtinMessages(program: ts.Program, checker: ts.TypeChecker): ts.Symbol | undefined {
  for (const file of program.getSourceFiles()) {
    if (file.fileName.includes("/node_modules/")) continue;
    for (const statement of file.statements) {
      if (!ts.isModuleDeclaration(statement)) continue;
      if (!(statement.flags & ts.NodeFlags.GlobalAugmentation)) continue;
      if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue;
      for (const inner of statement.body.statements) {
        if (ts.isInterfaceDeclaration(inner) && inner.name.text === "BuiltinMessages") {
          return checker.getSymbolAtLocation(inner.name);
        }
      }
    }
  }
  return undefined;
}

function isOptional(symbol: ts.Symbol): boolean {
  return (symbol.flags & ts.SymbolFlags.Optional) !== 0;
}

function shapeOf(payload: ts.Type, checker: ts.TypeChecker): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const field of checker.getPropertiesOfType(payload)) {
    let kinds: string;
    try {
      const declared = declaredKinds(checker.getTypeOfSymbol(field), checker);
      const all = declared === "any" ? declared : [...declared];
      if (all !== "any" && isOptional(field) && !all.includes("nil")) all.push("nil");
      kinds = all === "any" ? "any" : all.sort().join("|");
    } catch (error) {
      if (!(error instanceof UnmappedLuaKindError)) throw error;
      kinds = "any";
    }
    shape[field.name] = kinds;
  }
  return shape;
}

// Every `BuiltinMessages` id: an outgoing one is posted from the go script, one
// frame each, with a witness payload of its required fields and then of every
// field; an incoming one is checked when the engine sends it.
export function messageProbes(
  target: ApiTarget = probeTarget(),
  program: ts.Program = surfaceProgram(target),
): MessageGeneration {
  const checker = program.getTypeChecker();
  const constants = new Set(declaredMembers(program, comparedNamespaces(target)).constants.keys());
  const origins = new Map(
    parseMessagesDoc(MESSAGES_MANIFEST.doc).entries.map((entry) => [entry.name, entry.origin]),
  );
  const symbol = builtinMessages(program, checker);
  if (symbol === undefined) throw new Error("api-probe: the surface declares no BuiltinMessages");
  const messages = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));

  const probes: MessageProbe[] = [];
  const calls: ProbeCall[] = [];
  const posts = new Map<string, QueueStep[]>();
  const shapes: Record<string, Record<string, string>> = {};
  const unverified: Unverified[] = [];
  const unknown: string[] = [];
  for (const message of [...messages].sort((a, b) => a.name.localeCompare(b.name))) {
    const id = message.name;
    const name = `message.${id}`;
    const origin = origins.get(id);
    if (origin === undefined) {
      unknown.push(`${id}: no ref-doc namespace`);
      continue;
    }
    const receiver = MESSAGE_RECEIVERS[id] ?? MESSAGE_ORIGINS[origin];
    const payload = checker.getTypeOfSymbol(message);
    const at = receiver === undefined ? {} : { receiver };
    if (MESSAGE_DENYLIST[id] !== undefined) {
      probes.push({ id, origin, ...at, direction: "denied" });
      continue;
    }
    if (INCOMING.has(id)) {
      probes.push({ id, origin, ...at, direction: "incoming" });
      shapes[id] = { ...shapeOf(payload, checker), ...UNDOCUMENTED_FIELDS[id] };
      const triggered = TRIGGERED.has(id);
      calls.push({
        name,
        variant: "receive",
        kind: "go",
        call: `receive(${JSON.stringify(id)})`,
        message: { id, direction: "incoming", triggered },
      });
      if (!triggered) {
        unverified.push({
          key: name,
          reason: "the probe project does not make the engine send it",
        });
      }
      continue;
    }
    if (receiver === undefined) {
      unknown.push(`${id}: no probe receiver for namespace ${origin}`);
      continue;
    }
    const fields = checker.getPropertiesOfType(payload);
    const variants: [string, ts.Symbol[]][] = [
      ["required", fields.filter((field) => !isOptional(field))],
    ];
    if (fields.some(isOptional)) variants.push(["optional", [...fields]]);
    try {
      const steps: QueueStep[] = [];
      for (const [variant, included] of variants) {
        const entries = included.map((field) => {
          const override = MESSAGE_FIELD_OVERRIDES[`${id}.${field.name}`];
          const value =
            override ??
            typeWitness(
              checker.getNonNullableType(checker.getTypeOfSymbol(field)),
              name,
              { kind: "go", url: receiver },
              checker,
              constants,
              new Set(),
            );
          return `${field.name}: ${value}`;
        });
        const body = entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
        const post = `msg.post(${receiver}, ${JSON.stringify(id)}, ${body})`;
        steps.push({ id, name, variant, post });
        calls.push({
          name,
          variant,
          kind: "go",
          call: post,
          message: { id, direction: "outgoing" },
        });
      }
      posts.set(id, steps);
      probes.push({ id, origin, receiver, direction: "outgoing" });
    } catch (error) {
      if (!(error instanceof NoWitness)) throw error;
      unknown.push(`${id}: ${error.message}`);
    }
  }

  const sequenced = new Set(PROXY_SEQUENCE.filter((step) => typeof step === "string"));
  const queue: QueueStep[] = [];
  for (const [id, steps] of posts) if (!sequenced.has(id)) queue.push(...steps);
  for (const step of PROXY_SEQUENCE) {
    if (typeof step !== "string") queue.push(step);
    else queue.push(...(posts.get(step) ?? []));
  }
  for (const [id] of posts) {
    const origin = origins.get(id);
    if (origin === "collectionproxy" && !sequenced.has(id)) {
      unknown.push(`${id}: a collection proxy message missing from the proxy sequence`);
    }
  }
  const triggered = [...TRIGGERED].filter((id) => shapes[id] !== undefined);
  return { probes, calls, queue, shapes, triggered, unverified, unknown };
}
