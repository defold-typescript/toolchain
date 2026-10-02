---
toc-title: State machines
---
# State machines

`hsm` is a small typed hierarchical state machine library that ships with the CLI. It drives whole-game flow (boot, menu, playing, paused) and per-object behavior (a door, an enemy, a UI widget) through one model: an XState-shaped config of `initial`, `states`, `on`, `after` and `guard`, ticked from `update(dt)` with timers on game time. Events, their payloads and the machine's context are all checked at compile time, and the library compiles to plain Lua with no `lualib_bundle`.

It replaces the `if (self.state === ...)` branches that otherwise spread across `update` and `on_message`.

## Add it to a project

`hsm` is not an npm package. The CLI carries its source and copies it into your project:

```sh
bunx @defold-typescript/cli vendor hsm .
```

That writes `src/vendor/hsm/index.ts` (the machine), `src/vendor/hsm/defold.ts` (the message bridge) and a `VERSION` file holding the CLI version the source came from. The files compile with the rest of your sources, so `build` emits `src/vendor/hsm/index.lua` and `src/vendor/hsm/defold.lua` beside them.

To upgrade, run the same command from a newer CLI. It overwrites the library files and `VERSION`, reports the old and new version, and leaves any other file in `src/vendor/hsm/` alone. Treat the library files as read-only: a local edit is lost on the next upgrade. Add `--json` to read the outcome as `{ command: "vendor", library: "hsm", version, previousVersion, written }`.

## Define a machine in a plain module

Put each machine definition in a plain module, a file with no `defineScript` export. A plain module compiles to `.lua`, which any script can `require`; a file that exports a `defineScript` factory compiles to a `.ts.script` component, which other files cannot import.

```ts
// src/door-machine.ts
import { type MessageEvent, messageEvents } from "./vendor/hsm/defold";
import { defineMachine } from "./vendor/hsm/index";

export interface DoorCtx {
  readonly sprite: Url;
  opens: number;
}

export type DoorEvent = MessageEvent<"trigger_response"> | { type: "OPENED" } | { type: "CLOSE" };

export const doorMachine = defineMachine<DoorCtx, DoorEvent>({
  initial: "closed",
  states: {
    closed: {
      on: {
        trigger_response: { target: "opening", guard: (_ctx, event) => event.enter },
      },
    },
    opening: {
      invoke: (ctx, settle) => {
        go.animate(ctx.sprite, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, () => {
          settle({ type: "OPENED" });
        });
      },
      exit: (ctx) => {
        go.cancel_animations(ctx.sprite, "tint.w");
      },
      on: { OPENED: "open" },
    },
    open: {
      enter: (ctx) => {
        ctx.opens += 1;
      },
      after: { 3: "closed" },
      on: { CLOSE: "closed" },
    },
  },
});

export const doorEvents = messageEvents(["trigger_response"]);
```

`on` accepts only the `type` values of `DoorEvent`, and each handler sees the matching event variant: the guard above reads `event.enter` because a `trigger_response` payload has one. `defineMachine` checks the config once and throws on an unknown target or a compound state with no `initial`, naming the state path, so a broken definition fails when the module loads rather than when the transition fires.

## One instance per object, on `self`

`start(ctx)` creates an independent instance from the definition. Create it in `init` so it lands on `self`, one per game object, then tick it from `update(dt)` and stop it in `final`:

```ts
// src/door.ts
import { defineScript } from "@defold-typescript/types";
import { doorEvents, doorMachine } from "./door-machine";

export default defineScript({
  init() {
    return { door: doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 }) };
  },
  update(self, dt) {
    self.door.update(dt);
  },
  on_message(self, message_id, message) {
    const event = doorEvents.toEvent(message_id, message);
    if (event !== undefined) {
      self.door.send(event);
    }
  },
  final(self) {
    self.door.stop();
  },
});
```

`after` timers count the `dt` you pass to `update`, so a machine whose `update` is not called is frozen in time. `send` from inside a hook or an action queues the event and runs it after the current step. `self.door.matches("open")`, `self.door.path` and `self.door.ctx` read the current state. `stop()` exits every active state and turns later `send` and `update` calls into no-ops.

A module-level instance (`const door = doorMachine.start(...)` at the top of a script file) is shared by every object that runs the script; see [Where script state lives](./script-state.md).

## Migrate a script

The [platformer example](https://github.com/defold-typescript/toolchain/tree/main/docs/examples/platformer) moved its player onto one machine. Before, the player's state lived in flags that every frame re-read to pick an animation, and the jump checked a flag of its own:

```ts
// src/player.ts, before
function update_animations(self: PlayerSelf): void {
  // Make sure the player character faces the right way.
  sprite.set_hflip("#sprite", self.facing_direction < 0);
  if (self.ground_contact) {
    if (self.velocity.x === 0) {
      play_animation(self, anim_idle);
    } else {
      play_animation(self, anim_walk);
    }
  } else if (self.velocity.y > 0) {
    play_animation(self, anim_jump);
  } else {
    play_animation(self, anim_fall);
  }
}

function jump(self: PlayerSelf): void {
  // Only allow jump from ground (extend with a counter for double-jumps).
  if (self.ground_contact) {
    self.velocity.y = jump_takeoff_speed;
    play_animation(self, anim_jump);
    self.ground_contact = false;
  }
}
```

After, those branches are states. Each state plays its animation once in `enter`, and `JUMP` is handled only in `grounded`, so the guard is the state itself:

```ts
// src/player-machine.ts
export interface PlayerCtx {
  readonly velocity: Vector3;
  ground_contact: boolean;
}

export type PlayerEvent = { type: "JUMP" } | { type: "JUMP_RELEASED" };

export const playerMachine = defineMachine<PlayerCtx, PlayerEvent>({
  initial: "airborne",
  states: {
    grounded: {
      initial: "idle",
      update: (ctx) => (ctx.ground_contact ? undefined : "airborne"),
      on: {
        // Only allow jump from ground (extend with a counter for double-jumps).
        JUMP: {
          target: "airborne.rising",
          actions: (ctx) => {
            ctx.velocity.y = jump_takeoff_speed;
            ctx.ground_contact = false;
          },
        },
      },
      states: {
        idle: {
          enter: () => sprite.play_flipbook("#sprite", anim_idle),
          update: (ctx) => (ctx.ground_contact && ctx.velocity.x !== 0 ? "walk" : undefined),
        },
        walk: {
          enter: () => sprite.play_flipbook("#sprite", anim_walk),
          update: (ctx) => (ctx.ground_contact && ctx.velocity.x === 0 ? "idle" : undefined),
        },
      },
    },
    airborne: {
      initial: "falling",
      update: (ctx) => {
        if (!ctx.ground_contact) {
          return undefined;
        }
        return ctx.velocity.x === 0 ? "grounded.idle" : "grounded.walk";
      },
      states: {
        rising: {
          enter: () => sprite.play_flipbook("#sprite", anim_jump),
          on: {
            // Cut the jump short if we are still going up.
            JUMP_RELEASED: {
              actions: (ctx) => {
                ctx.velocity.y = ctx.velocity.y * 0.5;
              },
            },
          },
          update: (ctx) => (ctx.velocity.y <= 0 && !ctx.ground_contact ? "falling" : undefined),
        },
        falling: {
          enter: () => sprite.play_flipbook("#sprite", anim_fall),
        },
      },
    },
  },
});
```

`update` hooks run from the deepest active state up, and the first one to return a target wins. That is why `idle` and `walk` check `ground_contact` too: without it, a leaf whose own velocity check fires on the step the ground disappears (`idle` as the player starts to move off an edge) would move to its sibling, and the player would stay grounded for that step. Landing goes straight to `grounded.walk` when the player is moving, so it never flashes `idle`.

The script keeps the physics and hands the rest to the machine:

```ts
// src/player.ts, after
fixed_update(self, dt) {
  const body = self.body;
  // ... acceleration, gravity and movement, unchanged ...

  // Make sure the player character faces the right way.
  sprite.set_hflip("#sprite", body.facing_direction < 0);
  // Step the motion machine (ground, air, move and idle), which plays the
  // animations, while the contacts from the last physics step still hold.
  self.motion.update(dt);

  // Reset volatile state.
  body.correction = vmath.vector3();
  body.ground_contact = false;
  body.wall_contact = false;
},

on_input(self, action_id, action) {
  // ... walking, unchanged ...
  } else if (action_id === input_jump) {
    if (action.pressed) {
      self.motion.send({ type: "JUMP" });
    } else if (action.released) {
      self.motion.send({ type: "JUMP_RELEASED" });
    }
  }
},

final(self) {
  self.motion.stop();
},
```

Two rules carry over to any migration:

- **Give the machine an object, not `self`.** `init`'s return value is copied onto the engine-owned `self`, so a context built from loose fields in `init` would keep stale copies of them. The player's `init` builds one `body` object, starts the machine on it and returns `{ body, motion }`; every hook then reads and writes `self.body`, the same object the machine sees.
- **A state is as fresh as its last update.** `grounded` reflects the contacts seen by the last `fixed_update`, while the old guard read `ground_contact` after the physics step that followed it. So the player can now jump on the one physics step after walking off a ledge, a single step of leniency the example accepts.

## The message bridge

Defold delivers messages as a hashed `message_id` plus a payload table. `messageEvents(ids)` turns the ones you list into typed events `{ type: id, ...payload }`, reusing the payload types already declared through `BuiltinMessages` and `CustomMessages`, so a payload is declared once. Its `toEvent(message_id, message)` takes the `on_message` parameters of both `defineScript` and `defineGuiScript` and returns `undefined` for any id you did not list. Build the mapper once at module scope: it hashes the ids when it is created.

A script that already dispatches with `onMessage` (see [Messages](./messages.md)) has narrowed payloads in hand and can `send` them directly, with no mapper.

## Engine callbacks: `invoke` and `settle`

An engine callback that finishes later (an animation, a proxy load, an HTTP response) belongs in a state's `invoke`. It runs after the state's `enter` hook on every entry and receives a one-shot `settle(event)`; pass it whichever typed event means success or failure. If the state was left, re-entered, or the machine was stopped before the callback fires, that `settle` is ignored, so a late callback never moves a machine that has moved on.

## Cleanup goes in `exit`, never after an `await`

Release what a state holds (cancel an animation, a timer, a pending request) in its `exit` hook, as `opening` does above. `exit` runs on every way out of the state, including `stop()`. Never put cleanup after an `await` in an `invoke` or a hook: by the time the awaited work resumes, the state may already be gone, and code that runs then cleans up after a state that no longer exists, or never runs at all.
