---
toc-title: State machines
---
# State machines

`hsm` is a small typed Hierarchical State Machine library that ships with the toolchain. It drives whole-game flow (boot, menu, playing, paused) and per-object behavior (a door, an enemy, a UI widget) through one model: an XState-shaped config of `initial`, `states`, `on`, `after` and `guard`, ticked from `update(dt)` with timers on game time. Events, their payloads and the machine's context are all checked at compile time, and the library compiles to plain Lua with no `lualib_bundle`.

It replaces the `if (self.state === ...)` branches that otherwise spread across `update` and `on_message`.

This page covers the model first (states, transitions, timers and the order things run in), then how to use a machine from a script, its types, a worked migration, and a reference table. Every sample on it compiles against the declarations the import resolves to.

## Import it

`hsm` is not a separate install. Its declarations ship in `@defold-typescript/types` and the build compiles its source, so you import it the way you import the [timers polyfill](./typescript-gotchas.md#asyncawait-work-but-there-is-no-event-loop):

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import { messageEvents } from "@defold-typescript/types/hsm/defold";
```

`@defold-typescript/types/hsm` is the machine, `@defold-typescript/types/hsm/defold` is the message bridge and `@defold-typescript/types/hsm/debug` is the [debug inspector](#debug-a-machine). `build` and `watch` write each module your code uses to `defold_typescript_hsm/index.lua`, `defold_typescript_hsm/defold.lua` or `defold_typescript_hsm/debug.lua` at the project root, or under `outDir` when one is set; a module nothing uses, or only uses for its types, is not written. The library upgrades with the CLI, and a project scaffolded by `init` gitignores `defold_typescript_hsm/` with the rest of the build output. A source of your own that would compile to one of those paths fails the build.

The library Lua ships with no source map. An error or a debugger frame inside the library names the generated `defold_typescript_hsm/<module>.lua`, not a TypeScript line.

## States and paths

A machine is a tree of states. The config you pass to `defineMachine` is the root: it names its child `states` and the `initial` one to enter. A state with children of its own is a compound state and also needs an `initial`; a state without children is a leaf. Entering a compound state always continues into its `initial` child, so the active states form one chain from the root down to a leaf.

This tree is the *h* in `hsm`: it is a **hierarchical** state machine, in the statechart style David Harel introduced in 1987. A flat state machine has one level, so behavior shared by several states is repeated in each of them. Here a parent holds what its children share: a transition on the parent applies in every child that does not handle that event itself, because an unhandled event moves up to the parent, and `matches()` on the parent is true whichever child is active.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface LampCtx {
  switches: number;
}

type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

export const lamp = defineMachine<LampCtx, LampEvent>()({
  initial: "/off",
  states: {
    off: {
      on: { TOGGLE: "/on" },
    },
    on: {
      initial: "/on/bright",
      enter: (ctx) => {
        ctx.switches += 1;
      },
      on: { TOGGLE: "/off" },
      states: {
        bright: { on: { DIM: "/on/dim" } },
        dim: { on: { DIM: "/on/bright" } },
      },
    },
  },
});

const m = lamp.start({ switches: 0 });
m.path; // "/off"
m.send({ type: "TOGGLE" });
m.path; // "/on/bright"
m.matches("/on"); // true: an ancestor of the current state
m.send({ type: "DIM" });
m.path; // "/on/dim"
```

A state's path is its full path from the root: a leading `/`, then the names from the root down, separated by `/`, as in `/on/dim`. Every path in a machine is written this way: each target, each `initial`, `path` and `matches()`. `path` is the deepest active state, and `undefined` once the machine is stopped, so `if (m.path)` means the same in TypeScript and in Lua. `matches(p)` is true for every active state, ancestors included, so `matches("/on")` holds in both `/on/bright` and `/on/dim`. The root has no name: `/` alone is not a state, so the root is never a target and never matched.

A state name must be non-empty and must not contain `/`. Any other character is allowed, `.` and `#` included.

`defineMachine` checks the config when the module loads and throws, naming the state path, on a compound state with no `initial`, an `initial` that is not the full path of one of the state's children, a target that does not start with `/` or names no state, or a state name that is empty or contains `/`. Most of these mistakes fail to compile first; see [Types](#types).

## Events and transitions

`on` maps an event's `type` to a transition. A transition is one of three things:

- a target state, as a string;
- an object of `target`, `guard`, `actions` and `reenter`, each optional;
- a non-empty list of those objects, tried in order.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface EnemyCtx {
  health: number;
}

type EnemyEvent =
  | { type: "HIT"; damage: number }
  | { type: "SEE_PLAYER" }
  | { type: "LOSE_PLAYER" }
  | { type: "FALL" }
  | { type: "RESPAWN" };

export const enemy = defineMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      initial: "/alive/patrol",
      on: {
        HIT: [
          { target: "/dead", guard: (ctx, event) => ctx.health <= event.damage },
          {
            actions: (ctx, event) => {
              ctx.health -= event.damage;
            },
          },
        ],
      },
      states: {
        patrol: { on: { SEE_PLAYER: "/alive/chase" } },
        chase: {
          on: {
            LOSE_PLAYER: "/alive/patrol",
            SEE_PLAYER: { target: "/alive/chase", reenter: true },
            FALL: "/dead",
          },
        },
      },
    },
    dead: {
      on: {
        RESPAWN: {
          target: "/alive",
          actions: (ctx) => {
            ctx.health = 3;
          },
        },
      },
    },
  },
});

const m = enemy.start({ health: 3 });
m.send({ type: "SEE_PLAYER" }); // /alive/patrol -> /alive/chase
m.send({ type: "HIT", damage: 1 }); // handled by /alive: health 2, still /alive/chase
m.send({ type: "FALL" }); // exits /alive/chase and /alive, enters /dead
```

**Which transition runs.** An event starts at the deepest active state. If that state has no `on` entry for the event's `type`, or every guard in its entry fails, the event moves up to the parent, and so on to the root. The first transition with no guard, or whose guard returns `true`, runs, and the event goes no further. An event that no active state handles is dropped. Above, `HIT` sent in `/alive/chase` finds nothing on `chase` and reaches `alive`, where the first entry moves to `/dead` if the hit is fatal and the second takes the damage otherwise.

**Targetless transitions.** A transition with no `target` runs its actions and nothing else: no state exits or enters. The damage branch of `HIT` is one.

**Where a target points.** Every target is a full path from the root, wherever it is declared: `/dead` from `/alive/chase`, `/alive/chase` from its sibling `/alive/patrol`, and `/alive/patrol` from `/alive` for its own child. There are no relative targets: `./patrol`, `../patrol` and a bare name such as `patrol` are not paths, and `defineMachine` throws on them, naming the state that declares them.

**What runs, in what order.** A transition exits states from the deepest active state up, runs its actions, then enters states down to the target and on through each `initial` child. Only the states below the nearest one that contains both the source and the target exit and re-enter; that state stays active. With `/alive/chase` active, a fatal `HIT` handled by `alive` runs:

1. `exit` of `/alive/chase`
2. `exit` of `/alive`
3. the transition's actions
4. `enter` of `/dead`

Targeting the source itself or one of its descendants keeps the source active and re-enters only below it: from `/alive`, a target of `/alive/patrol` exits the current child and enters `patrol`, while `alive` stays. `reenter: true` also exits and re-enters the source, which restarts its `after` timers and its `invoke`, as `SEE_PLAYER` in `chase` does above. Targeting an ancestor of the source exits and re-enters that ancestor.

Guards receive `(ctx, event)` and actions `(ctx, event, m)`, where `event` is narrowed to the variant the `on` key names: the `HIT` guard reads `event.damage` with no cast. `actions` is one function or a list run in order.

## `update` and `after`

`m.update(dt)` advances the machine by one tick. Every active state adds that `dt` to its own clock on every call, whether or not a hook transitions, and starts from zero each time it is entered, so a machine whose `update` is not called is frozen in time. The tick then runs in two phases.

First the `update` hooks run, from the deepest active state up, each with `(ctx, dt, m)`. A hook returns a target to transition or `undefined` to pass. The first hook to return a target wins: the remaining hooks do not run, and the target is a full path, like an `on` target. A hook transition has no actions.

Then, only if no hook transitioned, the `after` timers run. `after` maps a delay in seconds, measured on the state's clock, to a target path. A state's timers fire in delay order. One `update` call fires at most one timer, checked from the deepest state up; another timer that is due waits for the next call.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface FeetCtx {
  on_ground: boolean;
}

type FeetEvent = { type: "JUMP" };

const land = (ctx: FeetCtx) => (ctx.on_ground ? "/grounded" : undefined);

export const feet = defineMachine<FeetCtx, FeetEvent>()({
  initial: "/grounded",
  states: {
    grounded: {
      update: (ctx) => (ctx.on_ground ? undefined : "/coyote"),
      on: { JUMP: "/jumping" },
    },
    // Just after walking off a ledge, a jump still counts.
    coyote: {
      update: land,
      after: { 0.1: "/falling" },
      on: { JUMP: "/jumping" },
    },
    jumping: {
      after: { 0.4: "/falling" },
    },
    falling: {
      update: land,
    },
  },
});
```

`coyote` lands if the ground comes back, and otherwise becomes `falling` after a tenth of a second. Since a hook transition skips the timers, landing on the very tick the timer is due wins over falling.

A state that stays active keeps counting while its children change, so a parent's timer can bound a cycle among its children:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface BlinkCtx {
  readonly sprite: Url;
}

type BlinkEvent = { type: "HIT" };

export const blink = defineMachine<BlinkCtx, BlinkEvent>()({
  initial: "/normal",
  states: {
    normal: { on: { HIT: "/invulnerable" } },
    invulnerable: {
      initial: "/invulnerable/shown",
      after: { 2: "/normal" },
      exit: (ctx) => msg.post(ctx.sprite, "enable"),
      states: {
        shown: {
          enter: (ctx) => msg.post(ctx.sprite, "enable"),
          after: { 0.1: "/invulnerable/hidden" },
        },
        hidden: {
          enter: (ctx) => msg.post(ctx.sprite, "disable"),
          after: { 0.1: "/invulnerable/shown" },
        },
      },
    },
  },
});
```

Each `shown` and `hidden` entry restarts that child's own tenth-of-a-second timer, while `invulnerable` counts its two seconds straight through.

## Run to completion, `invoke` and `stop`

A machine handles one event at a time, to completion. A `send` from inside a hook, guard, action or `invoke` does not run at once: it queues the event, which runs after the current transition, every `enter` and `exit` included, has finished. Queued events run in order before the outer `send`, `update` or `start` call returns, so `start` hands back a machine that has already handled whatever its `enter` hooks sent.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface LevelCtx {
  cached: boolean;
}

type LevelEvent = { type: "LOADED" } | { type: "QUIT" };

export const level = defineMachine<LevelCtx, LevelEvent>()({
  initial: "/loading",
  states: {
    loading: {
      enter: (ctx, m) => {
        if (ctx.cached) {
          m.send({ type: "LOADED" });
        }
      },
      on: { LOADED: "/playing" },
    },
    playing: { on: { QUIT: "/done" } },
    done: {
      enter: (_ctx, m) => m.stop(),
    },
  },
});

const m = level.start({ cached: true });
m.path; // "/playing": start ran the queued LOADED before returning
m.send({ type: "QUIT" });
m.path; // undefined: done stopped the machine
```

`stop()` exits every active state, deepest first and the root last, and sets `path` to `undefined`. Called inside a step, as `done` does above, it lets that step finish, then drops any queued events instead of running them. After `stop`, `send` and `update` do nothing.

### Engine callbacks: `invoke` and `settle`

An engine callback that finishes later (an animation, a proxy load, an HTTP response) belongs in a state's `invoke`. It runs after the state's `enter` hook on every entry and receives a one-shot `settle(event)`; pass it whichever typed event means success or failure. If the state was left, re-entered, or the machine was stopped before the callback fires, that `settle` is ignored, so a late callback never moves a machine that has moved on. The door's `opening` state [below](#define-a-machine-in-a-plain-module) settles when its fade ends.

### Cleanup goes in `exit`, never after an `await`

Release what a state holds (cancel an animation, a timer, a pending request) in its `exit` hook, as the door's `opening` does. `exit` runs on every way out of the state, including `stop()`. Never put cleanup after an `await` in an `invoke` or a hook: by the time the awaited work resumes, the state may already be gone, and code that runs then cleans up after a state that no longer exists, or never runs at all.

## Define a machine in a plain module

Put each machine definition in a plain module, a file with no `defineScript` export. A plain module compiles to `.lua`, which any script can `require`; a file that exports a `defineScript` factory compiles to a `.ts.script` component, which other files cannot import.

```ts title="door-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

export interface DoorCtx {
  readonly sprite: Url;
  opens: number;
}

export type DoorEvent = MessageEvent<"trigger_response"> | { type: "OPENED" } | { type: "CLOSE" };

export const doorMachine = defineMachine<DoorCtx, DoorEvent>()({
  initial: "/closed",
  states: {
    closed: {
      on: {
        trigger_response: { target: "/opening", guard: (_ctx, event) => event.enter },
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
      on: { OPENED: "/open" },
    },
    open: {
      enter: (ctx) => {
        ctx.opens += 1;
      },
      after: { 3: "/closed" },
      on: { CLOSE: "/closed" },
    },
  },
});

export const doorEvents = messageEvents(["trigger_response"]);
```

The guard reads `event.enter` because a `trigger_response` payload has one; the [message bridge](#the-message-bridge) turns that engine message into the event.

## One instance per object, on `self`

`start(ctx)` creates an independent instance from the definition. Create it in `init` so it lands on `self`, one per game object, then tick it from `update(dt)` and stop it in `final`:

```ts title="door.ts"
import { defineScript } from "@defold-typescript/types";
import { doorEvents, doorMachine } from "./door-machine";

export default defineScript({
  init() {
    return { door: doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 }) };
  },
  update(self, dt) {
    self.door.update(dt);
  },
  on_message(self, message_id, message, sender) {
    const event = doorEvents.toEvent(message_id, message, sender);
    if (event !== undefined) {
      self.door.send(event);
    }
  },
  final(self) {
    self.door.stop();
  },
});
```

`self.door.matches("/open")`, `self.door.path` and `self.door.ctx` read the current state from any callback. Stopping in `final` runs the `exit` hooks of whatever is active, so `opening` cancels its animation even when the object is deleted mid-fade.

A module-level instance (`const door = doorMachine.start(...)` at the top of a script file) is shared by every object that runs the script; see [Where script state lives](./script-state.md).

## Types

**`defineMachine` takes two calls.** `defineMachine<Ctx, E>()` fixes the context and event types, and the second call takes the config. TypeScript cannot infer some type arguments of one call while you write the others, and the config has to be inferred: its literal shape is where the state paths come from.

**Events are `EventObject`s.** `E` is a union of objects that each have a string `type`, plus any payload fields. `on` accepts only those `type` values as keys, and each guard and action sees the variant its key names.

**`start` returns a `MachineInstance<Ctx, E, P>`,** where `P` is the union of the machine's state paths: `matches()` accepts only those, and `path` is one of them or `undefined` once stopped. Because `path` can be `undefined`, a lookup table keyed by path can only be indexed after a check. Hooks, guards and actions are typed before the paths are known, so the `m` they receive is a `MachineInstance<Ctx, E>` whose `path` and `matches()` use plain `string`. To name an instance's type, for a field or a parameter, write `ReturnType<typeof doorMachine.start>`.

**`StatePath<C>` lists a config's paths,** each with its leading `/`. Paths are spelled out four levels deep; below that, any string under a fourth-level path is accepted.

```ts
import type { StatePath } from "@defold-typescript/types/hsm";

const game = {
  initial: "/menu",
  states: {
    menu: {},
    playing: {
      initial: "/playing/running",
      states: { running: {}, paused: {} },
    },
  },
} as const;

// "/menu" | "/playing" | "/playing/running" | "/playing/paused"
type GamePath = StatePath<typeof game>;

const resume: GamePath = "/playing/running";
// @ts-expect-error -- "/playing/over" is not one of the paths
const over: GamePath = "/playing/over";
// @ts-expect-error -- a path without the leading "/" is not a path
const bare: GamePath = "playing";
```

**A bad config is a `MachineConfigError`.** When an `initial` or a target is not one of the machine's full paths (a bare name such as `"idle"` included), or an `on` key names no event, `defineMachine` returns `MachineConfigError` instead of a machine. It has no `start`, so the mistake fails to compile wherever the machine is started, and the error's text names what to look for:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type GoEvent = { type: "GO" };

const broken = defineMachine<{ steps: number }, GoEvent>()({
  initial: "/idle",
  states: {
    idle: { on: { GO: "/nowhere" } },
  },
});

// @ts-expect-error -- Property 'start' does not exist on type 'MachineConfigError'.
broken.start({ steps: 0 });
```

**`MessageEvent<K>` and `messageEvents`** turn Defold messages into machine events; see the next section.

### The message bridge

Defold delivers messages as a hashed `message_id`, a payload table and the sender's URL. `messageEvents(ids)` turns the ones you list into typed events `{ type: id, ...payload, sender }`, reusing the payload types already declared through `BuiltinMessages` and `CustomMessages`, so a payload is declared once. `MessageEvent<K>` is that event's type, for the machine's event union, and carries `sender: Url`. Its `toEvent(message_id, message, sender)` takes the `on_message` parameters of both `defineScript` and `defineGuiScript` and returns `undefined` for any id you did not list. A payload field named `type` or `sender` never overrides the event's own. Build the mapper once at module scope: it hashes the ids when it is created.

A guard or action reads `event.sender` to answer whoever sent the message:

```ts title="lift-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    call_lift: { floor: number };
    lift_arrived: { floor: number };
  }
}

export const liftMachine = defineMachine<{ floor: number }, MessageEvent<"call_lift">>()({
  initial: "/waiting",
  states: {
    waiting: {
      on: {
        call_lift: {
          target: "/waiting",
          actions: (ctx, event) => {
            ctx.floor = event.floor;
            msg.post(event.sender, "lift_arrived", { floor: ctx.floor });
          },
        },
      },
    },
  },
});

export const liftEvents = messageEvents(["call_lift"]);
```

A machine sees only its `ctx` and its events, never `self`, so script data a hook needs goes into `ctx` at `start`.

A script that already dispatches with `onMessage` (see [Messages](./messages.md)) has narrowed payloads in hand and can `send` them directly, with no mapper. An event built by hand for a `MessageEvent` union includes `sender`, which the `onMessage` handler receives.

## Debug a machine

`inspect(instance, label)` from `@defold-typescript/types/hsm/debug` logs every move a machine makes and draws its current path over a game object. Call it once after `start`, keep the inspector it returns on `self`, and call its `draw` from `update`:

```ts title="door-debug.ts"
import { defineScript } from "@defold-typescript/types";
import { inspect } from "@defold-typescript/types/hsm/debug";
import { doorMachine } from "./door-machine";

export default defineScript({
  init() {
    const door = doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 });
    return { door, inspector: inspect(door, "door") };
  },
  update(self, dt) {
    self.door.update(dt);
    self.inspector.draw(".");
  },
  final(self) {
    self.door.stop();
  },
});
```

Each move prints one line to the console:

```text
hsm door frame 120: /closed -> /opening (trigger_response)
hsm door frame 150: /opening -> /open (OPENED)
hsm door frame 330: /open -> /closed (after)
```

The frame number counts `draw` calls, so it tracks `update` when you draw every frame. The paths are leaf paths. The text in parentheses is the event's `type`, or, when no event moved the machine, the cause: `after`, `update` or `stop`. After `stop()` the new path reads `(stopped)`. `draw(target)` posts `draw_debug_text` to `@render:` with the label and the current path, 40 units above the target's world position.

In a release build, where `sys.get_engine_info().is_debug` is `false`, `inspect` registers nothing and `draw` does nothing, so the calls can stay in shipped code.

`inspect` is built on `onTransition(listener)`, which every instance has. The listener receives the old leaf path, the new one (`undefined` after `stop()`), the cause and the event (`undefined` unless the cause is `event`), after the move's `enter` hooks have run. Use it to feed your own tools.

## Migrate a script

The [platformer example](https://github.com/defold-typescript/toolchain/tree/main/docs/examples/platformer) moved its player onto one machine. Before, the player's state lived in flags that every frame re-read to pick an animation, and the jump checked a flag of its own:

```ts
// src/player.ts, before
import type { Vector3 } from "@defold-typescript/types";

const jump_takeoff_speed = 1200;
const anim_walk = hash("walk");
const anim_idle = hash("idle");
const anim_jump = hash("jump");
const anim_fall = hash("fall");

interface PlayerSelf {
  velocity: Vector3;
  facing_direction: number;
  ground_contact: boolean;
  anim?: Hash;
}

function play_animation(self: PlayerSelf, anim: Hash): void {
  if (self.anim !== anim) {
    sprite.play_flipbook("#sprite", anim);
    self.anim = anim;
  }
}

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

```ts title="player-machine.ts"
import type { Vector3 } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";

const jump_takeoff_speed = 1200;
const anim_walk = hash("walk");
const anim_idle = hash("idle");
const anim_jump = hash("jump");
const anim_fall = hash("fall");

export interface PlayerCtx {
  readonly velocity: Vector3;
  ground_contact: boolean;
}

export type PlayerEvent = { type: "JUMP" } | { type: "JUMP_RELEASED" };

export const playerMachine = defineMachine<PlayerCtx, PlayerEvent>()({
  initial: "/airborne",
  states: {
    grounded: {
      initial: "/grounded/idle",
      update: (ctx) => (ctx.ground_contact ? undefined : "/airborne"),
      on: {
        // Only allow jump from ground (extend with a counter for double-jumps).
        JUMP: {
          target: "/airborne/rising",
          actions: (ctx) => {
            ctx.velocity.y = jump_takeoff_speed;
            ctx.ground_contact = false;
          },
        },
      },
      states: {
        idle: {
          enter: () => sprite.play_flipbook("#sprite", anim_idle),
          update: (ctx) =>
            ctx.ground_contact && ctx.velocity.x !== 0 ? "/grounded/walk" : undefined,
        },
        walk: {
          enter: () => sprite.play_flipbook("#sprite", anim_walk),
          update: (ctx) =>
            ctx.ground_contact && ctx.velocity.x === 0 ? "/grounded/idle" : undefined,
        },
      },
    },
    airborne: {
      initial: "/airborne/falling",
      update: (ctx) => {
        if (!ctx.ground_contact) {
          return undefined;
        }
        return ctx.velocity.x === 0 ? "/grounded/idle" : "/grounded/walk";
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
          update: (ctx) =>
            ctx.velocity.y <= 0 && !ctx.ground_contact ? "/airborne/falling" : undefined,
        },
        falling: {
          enter: () => sprite.play_flipbook("#sprite", anim_fall),
        },
      },
    },
  },
});
```

`update` hooks run from the deepest active state up, and the first one to return a target wins. That is why `idle` and `walk` check `ground_contact` too: without it, a leaf whose own velocity check fires on the step the ground disappears (`idle` as the player starts to move off an edge) would move to its sibling, and the player would stay grounded for that step. Landing goes straight to `/grounded/walk` when the player is moving, so it never flashes `idle`.

The script keeps the physics and hands the rest to the machine:

```ts title="player.ts"
import { defineScript } from "@defold-typescript/types";
import { playerMachine } from "./player-machine";

const input_jump = hash("jump");

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
    const body = {
      velocity: vmath.vector3(0, 0, 0),
      facing_direction: 0,
      ground_contact: false,
    };
    return { body, motion: playerMachine.start(body) };
  },

  fixed_update(self, dt) {
    const body = self.body;
    // ... acceleration, gravity and movement, unchanged ...

    // Make sure the player character faces the right way.
    sprite.set_hflip("#sprite", body.facing_direction < 0);
    // Step the motion machine (ground, air, move and idle), which plays the
    // animations, while the contacts from the last physics step still hold.
    self.motion.update(dt);

    // Reset volatile state.
    body.ground_contact = false;
  },

  on_input(self, action_id, action) {
    // ... walking, unchanged ...
    if (action_id === input_jump) {
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
});
```

Two rules carry over to any migration:

- **Give the machine an object, not `self`.** `init`'s return value is copied onto the engine-owned `self`, so a context built from loose fields in `init` would keep stale copies of them. The player's `init` builds one `body` object, starts the machine on it and returns `{ body, motion }`; every hook then reads and writes `self.body`, the same object the machine sees.
- **A state is as fresh as its last update.** `grounded` reflects the contacts seen by the last `fixed_update`, while the old guard read `ground_contact` after the physics step that followed it. So the player can now jump on the one physics step after walking off a ledge, a single step of leniency the example accepts.

## Reference

### `StateConfig`

Every field is optional on a state; the root config requires `initial` and `states`.

| Field     | Type                                        | Meaning                                                                                       |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `initial` | `string`                                    | The full path of the child entered with this state (`/on/bright` inside `on`). Required when `states` is set. |
| `states`  | `{ [name: string]: StateConfig }`           | Child states, by name. A name is non-empty and contains no `/`.                               |
| `on`      | `{ [type]: target \| config \| config[] }`  | Transitions by event `type`, each target a full path; see [Events and transitions](#events-and-transitions). |
| `after`   | `{ [seconds: number]: string }`             | Full-path targets taken after this long in the state, in game time; see [`update` and `after`](#update-and-after). |
| `enter`   | `(ctx, m) => void`                          | Runs each time the state is entered.                                                          |
| `exit`    | `(ctx, m) => void`                          | Runs each time the state is left, including on `stop()`.                                      |
| `update`  | `(ctx, dt, m) => string \| undefined`       | Runs on every `update(dt)` while active; a returned full path transitions.                    |
| `invoke`  | `(ctx, settle, m) => void`                  | Runs after `enter`; `settle(event)` sends one event if the state is still the one entered.     |

### `MachineInstance`

| Member    | Type                    | Meaning                                                                            |
| --------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `ctx`     | `Ctx`                   | The context passed to `start`.                                                     |
| `path`    | `P \| undefined`        | The deepest active state's full path, or `undefined` once stopped.                 |
| `matches` | `(path: P) => boolean`  | Whether the state at the full path `path` is active, ancestors included.           |
| `send`    | `(event: E) => void`    | Handles `event`, or queues it when called during a step.                           |
| `update`  | `(dt: number) => void`  | Runs the `update` hooks, then the `after` timers if no hook transitioned.          |
| `stop`    | `() => void`            | Exits every active state; later `send` and `update` calls do nothing.              |
| `onTransition` | `(listener: (from, to, cause, event) => void) => void` | Calls `listener` after each move with the old and new leaf, the cause and the event; `to` is `undefined` on `stop()`. |
