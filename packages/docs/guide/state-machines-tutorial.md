---
toc-title: Learn state machines
llms-full: false
---
# State machines, one click at a time

A hands-on introduction to the `hsm` (Hierarchical State Machine) library for Defold and TypeScript, with no prior state machine experience needed. Every diagram on this page runs the real `hsm` library in your browser, and only Defold calls like `msg.post` and `go.animate` are imitated. Press the buttons and watch it work.

When you want the full rules, [State machines](./state-machines.md) has them all.

<div data-hsm-demo="lamp"></div>

That's a state machine. The lamp is always in exactly one **state**: `off` or `on`. Pressing `TOGGLE` sends an **event**, and a **transition** rule moves it to the other state. The glowing box is the state it's in right now, and the log shows each step as it happens.

## 1. Why bother?

Here's a common first attempt at a player's jump, using true/false flags:

```ts
let isJumping = false;
let isFalling = false;
let onGround = true;

export function updateJump(pressedJump: boolean, jumpTimer: number): void {
  if (pressedJump && onGround && !isJumping) {
    isJumping = true;
  }
  if (isJumping && jumpTimer > 0.4) {
    isJumping = false;
    isFalling = true;
  }
  if (onGround) {
    isFalling = false;
  }
  // ...and ten more "if" lines as the game grows
}
```

Three flags can be combined eight ways, and most of them make no sense. What does jumping *and* falling *and* on the ground mean? Nothing stops your code from getting there by accident, and those bugs are hard to find.

A state machine fixes this with one rule: **the thing is always in exactly one state.** The player is grounded, or jumping, or falling, never two at once. You write down which events move it from one state to another, and nothing else can.

## 2. Four words to learn

| Word | Meaning | In the lamp |
| --- | --- | --- |
| State | A mode the thing can be in. Exactly one is active. | `off`, `on` |
| Event | Something that happens. You send it to the machine. | the switch: `TOGGLE` |
| Transition | A rule: in this state, when this event happens, go to that state. | off + TOGGLE goes to on |
| Context (`ctx`) | Your own data that the machine carries and can change. | how many times it was switched on |

> [!NOTE] **Draw it first.** Before writing code, sketch your states as boxes and your events as arrows on paper. If the drawing is clear, the code will be easy.

## 3. Your first machine

Here's the lamp from the top of the page, in code:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

// 1. Your data (the "context")
interface LampCtx {
  switches: number;
}

// 2. Every event the lamp understands
type LampEvent = { type: "TOGGLE" };

// 3. The machine itself
export const lamp = defineMachine<LampCtx, LampEvent>()({
  initial: "/off", // which state to start in
  states: {
    off: {
      on: { TOGGLE: "/on" }, // in "/off", TOGGLE means: go to "/on"
    },
    on: {
      // runs every time we enter "on"
      enter: (ctx) => {
        ctx.switches += 1;
      },
      on: { TOGGLE: "/off" },
    },
  },
});

const m = lamp.start({ switches: 0 }); // a running lamp, with starting data
m.path; // "/off"
m.send({ type: "TOGGLE" }); // press the switch
m.path; // "/on"
```

Wherever you point at a state, you write its **path**: a `/`, then its name, like `"/off"`. It works like a file path, which matters once states live inside other states.

Don't trip over the two meanings of "on". The *state* is named `on`, and inside every state the *key* `on:` means "on this event, do this." A rule that points at the state always writes it as a path, `"/on"`, so the slash tells you which one you're reading.

That's the whole loop: **define** the machine once, **start** it to get a running copy, **send** events, and read `path` to see where it is.

> [!NOTE] **Why two sets of parentheses?** In `defineMachine<LampCtx, LampEvent>()({ ... })` the first call is where you name your data and event types. The second takes your states, and TypeScript works out the state names from it. It's a TypeScript limitation, so always write it this way.

## 4. States inside states

Now the lamp can be bright or dim while it's on. Instead of writing "TOGGLE goes to off" twice, put `bright` and `dim` *inside* `on`, like files in a folder. Try `DIM` a few times, then `TOGGLE`:

<div data-hsm-demo="nested-lamp"></div>

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface LampCtx {
  switches: number;
}

type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

export const lamp = defineMachine<LampCtx, LampEvent>()({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: {
      initial: "/on/bright", // a state with children must say where to start
      enter: (ctx) => {
        ctx.switches += 1;
      },
      on: { TOGGLE: "/off" }, // written once, works in bright AND dim
      states: {
        bright: { on: { DIM: "/on/dim" } },
        dim: { on: { DIM: "/on/bright" } },
      },
    },
  },
});
```

- When the lamp is in `bright` it's also in `on`. Both glow. The rule from part 1 becomes: **one active state at each level**.
- A state with children must have an `initial`. Entering `on` always continues into `bright`; the log marks it as the initial child.
- A child's path continues its parent's, like a file in a folder: `"/on/dim"`. `m.path` is the path of the innermost active state, and `m.matches("/on")` asks "is on active at all?" and is true in both children.

Watch the log when you press `TOGGLE` in `/on/dim`: `dim` has no rule for it, so the event **climbs up** to its parent `on`, which does. An event no state handles is simply ignored. Try `DIM` while the lamp is off.

> [!NOTE] **What the "h" in `hsm` means.** It stands for *hierarchical*: states can sit inside other states, forming a tree, like folders. A plain state machine is flat, so every state that shares a rule has to repeat it. In a hierarchical one the parent holds the shared rule once, and its children get it for free. That is why `TOGGLE` is written only on `on`.

### Remembering bright or dim

In the lamp above, press `DIM`, then `TOGGLE` it off and on again. It comes back bright, because entering `on` always starts at its `initial`. To come back the way you left it, the lamp has to remember. Statecharts call this a *history state*, and `hsm` has one built in as [`restoreDepth`](./state-machines.md#resume-with-history). Here you keep that memory in your data instead, which shows how a `when` check picks where to go:

<div data-hsm-demo="remembering-lamp"></div>

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface LampCtx {
  switches: number;
  dimmed: boolean; // was the lamp dim when it was last on?
}

type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

export const lamp = defineMachine<LampCtx, LampEvent>()({
  initial: "/off",
  states: {
    off: {
      on: {
        // try each option from top to bottom
        TOGGLE: [
          // was it dim? go straight back to dim
          { to: "/on/dim", when: (ctx) => ctx.dimmed },
          // otherwise, bright
          { to: "/on/bright" },
        ],
      },
    },
    on: {
      initial: "/on/bright",
      enter: (ctx) => {
        ctx.switches += 1;
      },
      on: { TOGGLE: "/off" },
      states: {
        bright: {
          enter: (ctx) => {
            ctx.dimmed = false; // write down where we are
          },
          on: { DIM: "/on/dim" },
        },
        dim: {
          enter: (ctx) => {
            ctx.dimmed = true;
          },
          on: { DIM: "/on/bright" },
        },
      },
    },
  },
});

const m = lamp.start({ switches: 0, dimmed: false });
```

- `bright` and `dim` write down which one is active in their `enter` hooks. Those run however the lamp gets there, so `ctx.dimmed` is always right.
- `TOGGLE` in `off` is now a list of options. The first has a **`when`**, a yes/no question: if the lamp was dim, go straight to `/on/dim`. Otherwise the next option goes to `/on/bright`. [Part 5](#5-conditions-and-side-effects) covers `when` properly.
- Going straight to `/on/dim` still enters `on` first, so `switches` still counts.

## 5. Conditions and side effects

A robot buddy that bumps into things should stop to rest when its energy runs out, and otherwise just lose some energy. Two tools handle "it depends":

- **`when`** is a yes/no question. If it says no, that rule is skipped.
- **`run`** is code that runs when a rule is used, such as changing your data.

Bump the buddy a few times. Then recharge it, start a follow, and press `FALL`.

<div data-hsm-demo="buddy"></div>

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface BuddyCtx {
  energy: number;
}

type BuddyEvent =
  | { type: "BUMP"; cost: number }
  | { type: "SEE_PLAYER" }
  | { type: "LOSE_PLAYER" }
  | { type: "FALL" }
  | { type: "RECHARGE" };

export const buddy = defineMachine<BuddyCtx, BuddyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      initial: "/alive/wander",
      on: {
        // a list: try each option from top to bottom
        BUMP: [
          { to: "/resting", when: (ctx, event) => ctx.energy <= event.cost },
          {
            run: (ctx, event) => {
              ctx.energy -= event.cost;
            },
          },
        ],
      },
      states: {
        wander: { on: { SEE_PLAYER: "/alive/follow" } },
        follow: {
          on: {
            LOSE_PLAYER: "/alive/wander",
            SEE_PLAYER: "/alive/follow", // its own state: restart the follow
            FALL: "/resting", // a full path reaches any state
          },
        },
      },
    },
    resting: {
      on: {
        RECHARGE: {
          to: "/alive",
          run: (ctx) => {
            ctx.energy = 3;
          },
        },
      },
    },
  },
});
```

Read the `BUMP` list like an if/else. If this bump uses up the last of the energy, go to `resting`. Otherwise lose some energy. The second option has no `to`, so the buddy stays exactly where it is: nothing exits or enters, only `run` runs. Events can carry data, like `cost`, which `when` and `run` read as `event.cost`.

| Write a rule as | Example | Use it when |
| --- | --- | --- |
| A state path | `LOSE_PLAYER: "/alive/wander"` | You only need to move. Most rules. |
| An object | `{ to, when, run }` | You need a condition or some code. Every field is optional. |
| A list of objects | `[ {...}, {...} ]` | You need if / else-if choices. |

## 6. enter, exit, and the order of things

Each state can have an `enter` hook that runs when you arrive and an `exit` hook that runs when you leave. Every transition does three steps, which you can see in the buddy's log after a big bump:

1. **Exit** the old states, innermost first (`/alive/follow`, then `/alive`).
2. Run the rule's **`run`**.
3. **Enter** the new states, outermost first, continuing into each initial child.

A state you're not really leaving stays put. Going from `/alive/follow` to `/alive/wander` never exits `/alive`. A rule that names its own state is the exception: it leaves and comes back. Press `SEE_PLAYER` twice while following: the rule on `follow` names `/alive/follow`, so `follow` exits and enters again, which restarts its timers. To restart only the children of a state, name the child to start in instead, and to stay put while running code, leave `to` out.

### Pointing at the right state

Every target is the full path from the top, wherever the rule is written. A rule inside `/alive/follow` points at its sibling the same way a rule anywhere else would.

| From `/alive/follow`, write | Means | Goes to |
| --- | --- | --- |
| `"/alive/wander"` | A full path | `/alive/wander` |
| `"/resting"` | A full path | `/resting` |
| `"wander"`, `"./wander"` or `"../resting"` | Not a path: no leading `/` | Nothing: the machine refuses to start |

There are no shortcuts relative to the current state. A missing `/` or a misspelled path is usually caught by TypeScript as a compile error, before your game ever runs.

## 7. Time and every-frame checks

Games run frame by frame, so the machine needs a heartbeat: call `m.update(dt)` every frame. That unlocks two things.

- `update` runs a function every frame. Return a state path to move there, or `undefined` to stay.
- `after` is a timer: "after this many seconds in this state, go there."

Here's the jump from part 1, done properly. The `coyote` state is a platformer trick: for a tenth of a second after walking off a ledge, jumping still works. The demo runs in slow motion so you can see the timer bars fill. Walk off a ledge and do nothing, then try again and jump in time.

<div data-hsm-demo="feet"></div>

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
    coyote: {
      update: land, // ground came back? land
      after: { 0.1: "/falling" }, // otherwise fall after 0.1 s
      on: { JUMP: "/jumping" }, // jumping still allowed here
    },
    jumping: { after: { 0.4: "/falling" } },
    falling: { update: land },
  },
});
```

Compare this with the flags in part 1. Every state and every way between them is visible, and the player can never be jumping and falling at once.

- Each state's timer starts at zero every time it's entered.
- Timers count the `dt` you pass in. If you stop calling `update`, time stands still. Pause the demo to see it.
- `update` functions get the first chance each frame. Timers only fire if none of them moved, so landing on the exact frame coyote time ends counts as landing.
- One `update` call fires at most one timer.

### A parent's timer keeps running

A state's clock keeps ticking while its children change. That makes "sparkle on and off for two seconds" easy. Pick up a star and watch the two bars: the children's restart every tenth of a second, the parent's runs straight through.

<div data-hsm-demo="sparkle"></div>

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface SparkleCtx {
  readonly sprite: Url;
}

type SparkleEvent = { type: "STAR" };

export const sparkle = defineMachine<SparkleCtx, SparkleEvent>()({
  initial: "/normal",
  states: {
    normal: { on: { STAR: "/sparkling" } },
    sparkling: {
      initial: "/sparkling/shown",
      after: { 2: "/normal" }, // the whole thing lasts 2 s
      exit: (ctx) => msg.post(ctx.sprite, "enable"), // always end visible
      states: {
        shown: {
          enter: (ctx) => msg.post(ctx.sprite, "enable"),
          after: { 0.1: "/sparkling/hidden" },
        },
        hidden: {
          enter: (ctx) => msg.post(ctx.sprite, "disable"),
          after: { 0.1: "/sparkling/shown" },
        },
      },
    },
  },
});
```

## 8. Waiting for things to finish

Some work takes a while: an animation, loading a level, a web request. Start it in the state's `task`. It receives a `finish` function; call it with an event when the work is done.

Walk into the door's trigger, and press `CLOSE` halfway through the fade. Then turn off "cancel in exit" and do it again. The fade keeps running on a door that's already closed, so the door ends up invisible while the machine says `closed`. That's the bug cleanup in `exit` prevents. Notice too that the late `finish` is ignored, because `opening` was already left.

<div data-hsm-demo="door"></div>

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import type { MessageEvent } from "@defold-typescript/types/hsm/defold";

interface DoorCtx {
  readonly sprite: Url;
  opens: number;
}

// Defold's trigger_response message, as a machine event
type DoorEvent = MessageEvent<"trigger_response"> | { type: "OPENED" } | { type: "CLOSE" };

export const doorMachine = defineMachine<DoorCtx, DoorEvent>()({
  initial: "/closed",
  states: {
    closed: {
      enter: (ctx) => go.set(ctx.sprite, "tint.w", 1),
      on: { trigger_response: { to: "/opening", when: (_ctx, event) => event.enter } },
    },
    opening: {
      task: (ctx, finish) => {
        go.animate(ctx.sprite, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, () => {
          finish({ type: "OPENED" });
        });
      },
      exit: (ctx) => go.cancel_animations(ctx.sprite, "tint.w"), // cleanup!
      on: { OPENED: "/open", CLOSE: "/closed" },
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
```

> [!WARNING] **Always clean up in exit.** `exit` runs however a state ends, including when the machine is stopped, so it's the one reliable place to cancel animations, timers and requests. Never put cleanup after an `await`: by the time it runs, the state may already be gone.

## 9. One thing at a time

You may call `m.send()` from inside a hook or `run`, but it won't run right away. The event waits in a queue until the current transition, every enter and exit included, has finished. All queued events run before the outer `send`, `update` or `start` call returns.

Start the level with a cached save and watch the log: `loading` sends `LOADED` from its enter hook, the event is queued, and it's handled before `start()` returns. Then press `QUIT`: `done` calls `m.stop()`, which exits every state and leaves `path` as `undefined`. After that, events do nothing.

<div data-hsm-demo="level"></div>

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
        if (ctx.cached) m.send({ type: "LOADED" }); // queued
      },
      on: { LOADED: "/playing" },
    },
    playing: { on: { QUIT: "/done" } },
    done: { enter: (_ctx, m) => m.stop() },
  },
});
```

## 10. Putting it in a Defold game

**Step 1.** Put each machine in its own plain file that doesn't export `defineScript`. Plain modules compile to `.lua` and any script can import them; a file exporting `defineScript` becomes a script component that nothing else can import.

```ts title="door-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

export interface DoorCtx {
  readonly sprite: Url;
  opens: number;
}

export type DoorEvent = MessageEvent<"trigger_response"> | { type: "OPENED" } | { type: "CLOSE" };

// the door from part 8
export const doorMachine = defineMachine<DoorCtx, DoorEvent>()({
  initial: "/closed",
  states: {
    closed: {
      enter: (ctx) => go.set(ctx.sprite, "tint.w", 1),
      on: { trigger_response: { to: "/opening", when: (_ctx, event) => event.enter } },
    },
    opening: {
      task: (ctx, finish) => {
        go.animate(ctx.sprite, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, () => {
          finish({ type: "OPENED" });
        });
      },
      exit: (ctx) => go.cancel_animations(ctx.sprite, "tint.w"),
      on: { OPENED: "/open", CLOSE: "/closed" },
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

// turns Defold's "trigger_response" message into a machine event
export const doorEvents = messageEvents(["trigger_response"]);
```

**Step 2.** Give every game object its own copy, and wire it to the four script callbacks:

```ts title="door.ts"
import { defineScript } from "@defold-typescript/types";
import { doorEvents, doorMachine } from "./door-machine";

export default defineScript({
  // one machine for THIS door
  init() {
    return { door: doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 }) };
  },
  // the heartbeat
  update(self, dt) {
    self.door.update(dt);
  },
  // Defold message -> event
  on_message(self, message_id, message, sender) {
    const event = doorEvents.toEvent(message_id, message, sender);
    if (event !== undefined) {
      self.door.send(event);
    }
  },
  // object deleted: run the exit hooks
  final(self) {
    self.door.stop();
  },
});
```

> [!WARNING] **Create machines in init.** A machine created at the top of a script file is shared by every object that runs the script, so all your doors would open together.

`messageEvents` converts the Defold messages you list into typed events and returns `undefined` for any other message, which is why the script checks before sending. Build it once, at the top of a module.

**Step 3.** The script in step 2 passes `opens: 0`, a number only the machine uses. The `privateCtx` key lets the machine build it. The context keeps what the script hands in:

```ts excerpt
export interface DoorCtx {
  readonly sprite: Url;
}
```

The machine builds the rest in `privateCtx`, at the top of its config:

```ts excerpt
export const doorMachine = defineMachine<DoorCtx, DoorEvent>()({
  // the machine's own data, built fresh for every door
  privateCtx: () => ({ opens: 0 }),
  initial: "/closed",
```

The hooks still read `ctx.opens`. `start` takes the sprite alone, and `self.door.ctx` shows the sprite alone:

```ts excerpt
return { door: doorMachine.start({ sprite: msg.url("#sprite") }) };
```

> [!NOTE] **Hidden, not locked.** The field is hidden by type only: at run time it sits on the same `ctx` as the sprite. A machine with no data of its own leaves `privateCtx` out. [Private fields with `privateCtx`](./state-machines.md#private-fields-with-privatectx) has the rules.

## 11. Designing your own

1. **List the modes.** What can this thing be doing? Each one is a state.
2. **List what can happen.** Presses, bumps, messages, timeouts. Each is an event or an `after`.
3. **Draw the arrows.** For each state, which events move it, and where?
4. **Look for groups.** States that share arrows can live inside a parent.
5. **Add conditions last.** `when` and `run` handle the "it depends" cases.
6. **Plan cleanup.** Whatever a state starts, its `exit` should stop.
7. **Split the data.** What a script hands in goes in the context. What only the machine uses goes in `privateCtx`.

### Common beginner mistakes

- Forgetting to call `update(dt)`, so timers never fire.
- Forgetting `initial` on a state that has children.
- Writing `"resting"` when you meant `"/resting"`. Every path starts with `/`.
- Expecting `send()` inside a hook to happen instantly.
- Cleaning up anywhere other than `exit`.
- Starting the machine at the top of a script file instead of in `init`.
