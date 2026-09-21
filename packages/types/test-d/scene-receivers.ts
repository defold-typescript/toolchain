/// <reference path="../index.d.ts" />

// What `scene-types` writes for a project whose `/logic` object hosts the wave
// script: the address's value is the script module, so `msg.post` on that
// literal reads the script's own messages. `/hud#ui` names no compiled script.
declare global {
  interface SceneComponentAddresses {
    "/logic#wave": typeof import("./script-messages/wave").default;
    "/logic#looper": typeof import("./script-messages/looper").default;
    "/hud#ui": true;
  }
}

msg.post("/logic#wave", "spawn_wave", { count: 3 });
// @ts-expect-error spawn_wave's declared `count` is a number
msg.post("/logic#wave", "spawn_wave", { count: "3" });
// @ts-expect-error spawn_wave's declared `count` is required
msg.post("/logic#wave", "spawn_wave", {});

// Never rejects: an id the script does not handle, an address with no script,
// and an address the scenes never declared all keep the open payload.
msg.post("/logic#wave", "not_declared_here", { x: 1 });
msg.post("/hud#ui", "spawn_wave", { anything: 1 });
msg.post("/unknown#x", "spawn_wave", {});

// Built-in ids stay reachable on a typed key, and their payloads stay checked.
msg.post("/logic#wave", "enable");
// @ts-expect-error apply_force requires `force` and `position`
msg.post("/logic#wave", "apply_force", {});

// The receiver-typed and dynamic routes are unchanged beside it.
msg.post(msg.url<{ ping: { at: number } }>("/other#x"), "ping", { at: 1 });
// @ts-expect-error ping's declared `at` is a number
msg.post(msg.url<{ ping: { at: number } }>("/other#x"), "ping", { at: "1" });
const dynamic: string = ["/logic", "#wave"].join("");
msg.post(dynamic, "spawn_wave", { count: "3" });
msg.post(hash("/logic#wave"), "spawn_wave", { count: "3" });
msg.post("/logic#wave", hash("spawn_wave"), { count: "3" });

export {};
