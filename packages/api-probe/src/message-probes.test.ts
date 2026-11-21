import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { surfaceProgram } from "../../types/scripts/lua-kind";
import { overlayProgram } from "./call-check";
import { type Exemption, evaluateProbe } from "./exemptions";
import { messageProbes } from "./message-probes";
import type { ProbeOutcome } from "./outcome";
import { MESSAGE_DENYLIST } from "./probe-denylist";
import { generateProbes, PROBE_FILES, type ProbeCall, probeTarget } from "./witness";

const MSG_OVERLOADS = resolve(import.meta.dir, "../../types/src/msg-overloads.d.ts");

const generation = messageProbes();
const byId = new Map(generation.probes.map((probe) => [probe.id, probe]));
const omitted = generation.calls.filter((call) => call.message?.omittedPayload !== undefined);

function omittedCall(id: string): ProbeCall {
  const call = omitted.find((candidate) => candidate.message?.id === id);
  if (call === undefined) throw new Error(`no omitted-payload post of ${id}`);
  return call;
}

function evaluate(
  call: ProbeCall,
  result: ProbeOutcome["outcome"],
  exemptions: Record<string, Exemption> = {},
) {
  const outcome: ProbeOutcome = {
    name: call.name,
    variant: call.variant,
    outcome: result,
    message: result === "ok" ? "" : "Field id not specified in table",
  };
  return evaluateProbe([{ backend: "v2", calls: [call], outcomes: [outcome] }], exemptions);
}

function withVerdict(call: ProbeCall, verdict: "accepted" | "rejected"): ProbeCall {
  return {
    ...call,
    message: { ...(call.message as NonNullable<ProbeCall["message"]>), omittedPayload: verdict },
  };
}

describe("message probes", () => {
  test("every BuiltinMessages id is probed once, with its ref-doc namespace as receiver kind", () => {
    expect(generation.probes.length).toBe(new Set(generation.probes.map((p) => p.id)).size);
    expect(generation.unknown).toEqual([]);
    expect(byId.get("play_animation")).toMatchObject({ origin: "sprite", receiver: "SPRITE" });
    expect(byId.get("load")).toMatchObject({ origin: "collectionproxy", receiver: "LOADER" });
    expect(byId.get("set_parent")?.origin).toBe("go");
    expect(byId.get("clear_color")).toMatchObject({ origin: "render", receiver: "RENDER" });
    expect(byId.get("toggle_profile")).toMatchObject({ origin: "sys", receiver: "SYSTEM" });
    for (const id of Object.keys(MESSAGE_DENYLIST)) {
      expect(byId.get(id)?.direction).toBe("denied");
    }
  });

  test("an outgoing message posts a witness payload built from its declared fields", () => {
    const calls = generation.calls.filter((call) => call.name === "message.clear_color");
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["required", 'msg.post(RENDER, "clear_color", { color: vmath.vector4(1, 1, 1, 1) })'],
      ["omitted-payload", 'msg.post(RENDER, "clear_color")'],
    ]);
    const sound = generation.calls.filter((call) => call.name === "message.play_sound");
    expect(sound.map((call) => call.variant)).toEqual(["required", "optional"]);
    expect(sound[0]?.call).toBe('msg.post(SOUND, "play_sound", {})');
    expect(sound[0]?.message).toMatchObject({ id: "play_sound", direction: "outgoing" });
  });

  test("a message the engine only sends is checked on receipt, or listed as unverified", () => {
    const triggered = generation.calls
      .filter((call) => call.variant === "receive")
      .map((call) => call.message?.id);
    for (const id of [
      "animation_done",
      "proxy_loaded",
      "collision_response",
      "contact_point_response",
      "trigger_response",
    ]) {
      expect(triggered).toContain(id);
    }
    expect(generation.unverified.map((entry) => entry.key)).toContain("message.ray_cast_missed");
    expect(generation.shapes.animation_done).toEqual({ current_tile: "number", id: "hash" });
    expect(generation.shapes.set_parent).toBeUndefined();
  });

  test("the proxy is loaded and initialized before it is finalized and unloaded", () => {
    const order = generation.queue.map((step) => ("wait" in step ? `wait ${step.wait}` : step.id));
    const at = (entry: string) => order.indexOf(entry);
    expect(at("load")).toBeLessThan(at("wait proxy_loaded"));
    expect(at("wait proxy_loaded")).toBeLessThan(at("init"));
    expect(at("init")).toBeLessThan(at("final"));
    expect(at("final")).toBeLessThan(at("unload"));
    expect(at("unload")).toBeLessThan(at("wait proxy_unloaded"));
  });

  test("the stock-engine go script queues the posts and checks what it receives", () => {
    const go = generateProbes(undefined, "v2").files[PROBE_FILES.go] ?? "";
    expect(go).toContain(
      '{ name: "message.clear_color", variant: "required", post: () => msg.post(RENDER, "clear_color", { color: vmath.vector4(1, 1, 1, 1) }) },',
    );
    expect(go).toContain('{ wait: "proxy_loaded" },');
    expect(go).toContain("pump();");
    expect(go).toContain("receive(message_id, message);");
  });
});

describe("omitted-payload message probes", () => {
  test("every posted or denied message with a required field is posted once with no payload", () => {
    expect(omitted.map((call) => call.message?.id).sort()).toEqual([
      "apply_force",
      "clear_color",
      "draw_debug_text",
      "draw_line",
      "exit",
      "play_animation",
      "resize",
      "set_camera",
      "set_time_step",
      "set_update_frequency",
      "set_view_projection",
      "set_vsync",
    ]);
    expect(omittedCall("play_animation")).toMatchObject({
      name: "message.play_animation",
      variant: "omitted-payload",
      kind: "go",
      call: 'msg.post(SPRITE, "play_animation")',
    });
    expect(omittedCall("apply_force").call).toBe('msg.post(PEER_COLLISION, "apply_force")');
    expect(omittedCall("exit").call).toBe('msg.post(SYSTEM, "exit")');
  });

  test("a message whose fields are all optional, or that only the engine sends, gets none", () => {
    const ids = new Set(omitted.map((call) => call.message?.id));
    for (const id of ["play_sound", "set_parent", "enable", "animation_done", "sound_done"]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  test("each post carries the checker's verdict, rejected once the payload is required", () => {
    expect(new Set(omitted.map((call) => call.message?.omittedPayload))).toEqual(
      new Set(["rejected"]),
    );
    const go = generateProbes(undefined, "v2").files[PROBE_FILES.go] ?? "";
    expect(go).toContain(
      [
        "      {",
        '        name: "message.play_animation",',
        '        variant: "omitted-payload",',
        "        // @ts-expect-error",
        '        post: () => msg.post(SPRITE, "play_animation"),',
        "      },",
      ].join("\n"),
    );
  });

  test("the verdict comes from the checker: a msg.post leaving the payload optional accepts it", () => {
    const original = readFileSync(MSG_OVERLOADS, "utf8");
    const loosened = original.replace(
      ": [message: MessagePayload<K>]",
      ": [message?: MessagePayload<K>]",
    );
    expect(loosened).not.toBe(original);
    const target = probeTarget();
    const program = overlayProgram(surfaceProgram(target), new Map([[MSG_OVERLOADS, loosened]]));
    const loose = messageProbes(target, program);
    const play = loose.calls.find(
      (call) => call.message?.id === "play_animation" && call.variant === "omitted-payload",
    );
    expect(play?.message?.omittedPayload).toBe("accepted");
    const step = loose.queue.find(
      (candidate) => "post" in candidate && candidate.name === "message.play_animation",
    );
    expect(step).not.toHaveProperty("refused");
  });

  test("a denied message's payload-less post runs last, after every other post", () => {
    const posts = generation.queue.filter((step) => "post" in step);
    expect(posts.at(-1)).toMatchObject({ id: "exit", variant: "omitted-payload" });
  });

  test("the engine raising where the declaration accepts, or the reverse, is a mismatch", () => {
    const play = omittedCall("play_animation");
    expect(evaluate(withVerdict(play, "rejected"), "engine-error").omittedPayloads).toEqual([]);
    expect(evaluate(withVerdict(play, "accepted"), "ok").omittedPayloads).toEqual([]);
    expect(evaluate(withVerdict(play, "rejected"), "ok").omittedPayloads).toEqual([
      "message.play_animation:omitted-payload: the engine accepts the message with no payload, which the declaration requires",
    ]);
    expect(evaluate(withVerdict(play, "accepted"), "engine-error").omittedPayloads).toEqual([
      "message.play_animation:omitted-payload: the engine raises without a payload, which the declaration leaves optional: Field id not specified in table",
    ]);
    const matched = evaluate(withVerdict(play, "rejected"), "engine-error");
    expect(matched.unexempted).toEqual([]);
    expect(matched.badArguments).toEqual([]);
  });

  test("an exemption clears the mismatch it records and goes stale once the pair matches", () => {
    const play = withVerdict(omittedCall("play_animation"), "rejected");
    const key = "message.play_animation:omitted-payload";
    const accepted: Exemption = { outcome: "ok", verdict: "accepted", reason: "test" };
    expect(evaluate(play, "ok", { [key]: accepted }).omittedPayloads).toEqual([]);
    const open = evaluate(play, "ok", { [key]: { ...accepted, verdict: "open" } });
    expect(open.openFindings).toEqual([`${key}: test`]);
    expect(open.omittedPayloads).toHaveLength(1);
    expect(evaluate(play, "engine-error", { [key]: accepted }).stale).toEqual([
      `${key}: the engine now raises as the declaration says; delete the exemption`,
    ]);
  });
});
