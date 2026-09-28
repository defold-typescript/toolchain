import { describe, expect, test } from "bun:test";
import { messageProbes } from "./message-probes";
import { MESSAGE_DENYLIST } from "./probe-denylist";
import { generateProbes, PROBE_FILES } from "./witness";

const generation = messageProbes();
const byId = new Map(generation.probes.map((probe) => [probe.id, probe]));

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
