---
toc-title: State machines
---
# State machines

`hsm` is a small typed Hierarchical State Machine library that ships with the toolchain. It drives whole-game flow (boot, menu, playing, paused) and per-object behavior (a door, an enemy, a UI widget) through one model: a config of `initial`, `states`, `on`, `after` and `always`, where each rule goes `to` a state `when` a check passes and may `run` code on the way, ticked from `update(dt)` with timers on game time. Events, their payloads and the machine's context are all checked at compile time, and the library compiles to plain Lua with no `lualib_bundle`; only the opt-in [scripted sequences](#scripted-sequences) module needs it.

It replaces the `if (self.state === ...)` branches that otherwise spread across `update` and `on_message`.

This page covers the model first (states, transitions, timers and the order things run in), then how to use a machine from a script, its types, a worked migration, a [cheat sheet](#cheat-sheet) of snippets to copy, and a reference table. Every sample on it compiles against the declarations the import resolves to.

## Import it

`hsm` is not a separate install. Its declarations ship in `@defold-typescript/types` and the build compiles its source, so you import it the way you import the [timers polyfill](./typescript-gotchas.md#asyncawait-work-but-there-is-no-event-loop):

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import { messageEvents } from "@defold-typescript/types/hsm/defold";
```

`@defold-typescript/types/hsm` is the machine, `@defold-typescript/types/hsm/defold` is the message bridge, `@defold-typescript/types/hsm/debug` is the [debug inspector](#debug-a-machine) and `@defold-typescript/types/hsm/async` holds [scripted sequences](#scripted-sequences). `build` and `watch` write each module your code uses to `defold_typescript_hsm/index.lua`, `defold_typescript_hsm/defold.lua`, `defold_typescript_hsm/debug.lua` or `defold_typescript_hsm/async.lua` at the project root, or under `outDir` when one is set; a module nothing uses, or only uses for its types, is not written. The library upgrades with the CLI, and a project scaffolded by `init` gitignores `defold_typescript_hsm/` with the rest of the build output. A source of your own that would compile to one of those paths fails the build. Importing `@defold-typescript/types/hsm/async` also writes `lualib_bundle.lua`, which its promises need; the other modules never do.

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
- an object of `to`, `when` and `run`, each optional;
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
          { to: "/dead", when: (ctx, event) => ctx.health <= event.damage },
          {
            run: (ctx, event) => {
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
            SEE_PLAYER: "/alive/chase",
            FALL: "/dead",
          },
        },
      },
    },
    dead: {
      on: {
        RESPAWN: {
          to: "/alive",
          run: (ctx) => {
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

**Which transition runs.** An event starts at the deepest active state. If that state has no `on` entry for the event's `type`, or every `when` in its entry fails, the event moves up to the parent, and so on to the root. The first transition with no `when`, or whose `when` returns `true`, runs, and the event goes no further. An event that no active state handles is dropped. Above, `HIT` sent in `/alive/chase` finds nothing on `chase` and reaches `alive`, where the first entry moves to `/dead` if the hit is fatal and the second takes the damage otherwise.

**Transitions with no `to`.** A transition with no `to` runs its `run` and nothing else: no state exits or enters. The damage branch of `HIT` is one.

**Where a target points.** Every target is a full path from the root, wherever it is declared: `/dead` from `/alive/chase`, `/alive/chase` from its sibling `/alive/patrol`, and `/alive/patrol` from `/alive` for its own child. There are no relative targets: `./patrol`, `../patrol` and a bare name such as `patrol` are not paths, and `defineMachine` throws on them, naming the state that declares them.

**What runs, in what order.** A transition exits states from the deepest active state up, runs its `run`, then enters states down to the target and on through each `initial` child. Only the states below the nearest one that contains both the source and the target exit and re-enter; that state stays active. With `/alive/chase` active, a fatal `HIT` handled by `alive` runs:

1. `exit` of `/alive/chase`
2. `exit` of `/alive`
3. the transition's `run`
4. `enter` of `/dead`

A `to` below the state the rule is on keeps that state active and re-enters only below it: from `/alive`, a `to` of `/alive/patrol` exits the current child and enters `patrol`, while `alive` stays. A `to` naming the state the rule is on exits and re-enters it, which restarts its `after` timers and its `task`, as `SEE_PLAYER` in `chase` does above; the same holds for an `after` timer, an `always` entry or an `update` hook that names its own state, so `after: { 1: "/blink" }` on `blink` repeats every second. To restart only a state's children, name the child to start in: `/alive/patrol` from `/alive`. A rule that should run code and leave every state alone has no `to`. Targeting an ancestor of the source exits and re-enters that ancestor.

`when` receives `(ctx, event)` and `run` `(ctx, event, machine)`, where `event` is narrowed to the variant the `on` key names: the `HIT` `when` reads `event.damage` with no cast. `run` is one function or a list run in order. Keep `when` free of side effects: it is also called when the move does not happen, for each candidate in a list and on every `always` recheck.

## `update` and `after`

`m.update(dt)` advances the machine by one tick. Every active state adds that `dt` to its own clock on every call, whether or not a hook transitions, and starts from zero each time it is entered, so a machine whose `update` is not called is frozen in time. The tick then runs in two phases.

First the `update` hooks run, from the deepest active state up, each with `(ctx, dt, machine)`. A hook returns a path to move to or `undefined` to pass. The first hook to return a path wins: the remaining hooks do not run, and the path is a full path, like an `on` target. A hook move has no `run`.

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

## Resume with history

Set `restoreDepth` on a compound state to make it remember which child was active when it was last left. Every later entry goes back to that child instead of `initial`, and the count says how many levels down to go back:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type PlayEvent =
  | { type: "JUMP" }
  | { type: "FALL" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESTART" };

export const game = defineMachine<object, PlayEvent>()({
  initial: "/playing",
  states: {
    playing: {
      restoreDepth: 1,
      initial: "/playing/ground",
      on: { PAUSE: "/paused" },
      states: {
        ground: { on: { JUMP: "/playing/air" } },
        air: {
          initial: "/playing/air/rise",
          states: {
            rise: { on: { FALL: "/playing/air/fall" } },
            fall: {},
          },
        },
      },
    },
    paused: { on: { RESUME: "/playing", RESTART: "/playing/ground" } },
  },
});
```

Pausing in mid-air and sending `RESUME` lands on `/playing/air/rise`, running the `enter` hooks of `playing`, `air` and `rise`. The rules:

- **The count sets how deep the restore goes.** With `restoreDepth: 1`, leaving from `/playing/air/fall` brings back `air`, and `air` is entered through its own `initial`, so the jump resumes at `/playing/air/rise`. With `restoreDepth: 2` it also brings back `fall`, and `"all"` brings back every level below the state. In statechart terms, `1` is shallow history and `"all"` is deep history.
- **Inner levels restore only through the flagged state.** The count applies when `playing` itself is entered. A move that targets `/playing/air` enters `air` through its `initial`, unless `air` has a `restoreDepth` of its own.
- **A parallel state is not a level.** The count passes through a parallel state to every region, so `restoreDepth: 2` on the parent of a parallel state brings back each region's last child.
- **A target inside the state wins.** `RESTART` names `/playing/ground`, so it lands there whatever `playing` remembers. Every other entry uses the memory: a target of `/playing` itself, including one on `playing`'s own rules, and a parent's `initial` chain that passes through `playing`.
- **The first entry uses `initial`.** Each instance keeps its own memory, so a new instance starts at `/playing/ground` even while another one is paused in the air.

`restoreDepth` throws when the machine is defined if it is not a whole number from 1 or `"all"`, if it is larger than the number of levels below the state, or if the state has no child states. Two of these are also compile errors: a count that is not a whole number from 1, and a count larger than the levels of child states written below the state. The compile check counts a parallel state as a level and follows the tree five levels down, so three mistakes compile and are caught only by the throw: `restoreDepth` on a state with no child states, a count that is too large only because a parallel state below it is not a level, and a wrong count on a state with more than five levels of child states below it.

## Move on at once with `always`

`always` lists the targets a state moves to as soon as it is entered, without waiting for an event. Use it for a state that only decides where to go next:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

interface Hero {
  health: number;
}

type HeroEvent = { type: "HIT" };

export const hero = defineMachine<Hero, HeroEvent>()({
  initial: "/fine",
  states: {
    fine: { on: { HIT: "/hurt" } },
    hurt: {
      enter: (ctx) => {
        ctx.health -= 1;
      },
      always: [{ to: "/dead", when: (ctx) => ctx.health <= 0 }, { to: "/fine" }],
    },
    dead: {},
  },
});
```

`HIT` runs `hurt`'s `enter`, then moves on to `/dead` or back to `/fine` in the same `send`. The rules:

- **Checked after every move.** That is `start`, an event, an `after` timer, a path returned from an `update` hook, a hot reload, and another `always` move. The active states are checked deepest first, the way events bubble, after the `enter` hooks and before the next queued event. The first candidate whose `when` is missing or passes is taken, with the cause `always`.
- **Not checked on ticks or transitions with no `to`.** A `when` reading `ctx` that a `run` or an `update` hook changed waits for the next move. To watch a condition every frame, return a target from an `update` hook instead.
- **No event and no `run`.** A candidate is a `to` and an optional `when(ctx)`. Put side effects in the target's `enter`.
- **Loops throw.** At most 10 `always` moves follow one move. The 11th throws `hsm: state "<path>" took 10 always transitions in a row; check for an always loop`, drops the queued events and leaves the instance usable in the state it reached.

An unknown target, or a candidate without a `to`, throws when the machine is defined.

## Run regions side by side with `parallel`

A state with `type: "parallel"` keeps every child active at once. Each child is a region with its own active state, so a player can run and fire independently:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type PlayerEvent = { type: "START_FIRE" } | { type: "DIE" } | { type: "REVIVE" };

export const player = defineMachine<object, PlayerEvent>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      on: { DIE: "/dead" },
      states: {
        move: {
          initial: "/alive/move/idle",
          states: {
            idle: { on: { START_FIRE: "/alive/move/run" } },
            run: {},
          },
        },
        weapon: {
          initial: "/alive/weapon/ready",
          states: {
            ready: { on: { START_FIRE: "/alive/weapon/cooldown" } },
            cooldown: { after: { 0.5: "/alive/weapon/ready" } },
          },
        },
      },
    },
    dead: { on: { REVIVE: "/alive" } },
  },
});

const m = player.start({});
m.send({ type: "START_FIRE" });
m.leaves; // ["/alive/move/run", "/alive/weapon/cooldown"]
m.path; // "/alive/move/run", the first of them
```

Entering `/alive` enters `move` and its `initial` chain, then `weapon` and its chain. A target inside one region, such as `/alive/weapon/cooldown`, enters that region through the target and every other region through its `initial`. Leaving `/alive` exits the last region first, each one deepest state first, then `/alive` itself. The rules:

- **Each region moves on its own.** An event is offered to every region in order, and each takes at most its first enabled transition, from its active leaf up to the region's root. `START_FIRE` above moves both regions in one `send`, and each move is reported to `onMove` with that region's old and new leaf.
- **The parallel state waits for its regions.** An event reaches `/alive`'s own `on`, and bubbles above it, only when no region took it. A region transition that leaves or re-enters `/alive` ends the offer, so later regions do not see that event.
- **Ticks and `always` run per region.** In `update(dt)`, each region runs its `update` hooks deepest first, then its first due `after` timer if no hook moved it, so `weapon`'s cooldown can end in the same frame that `move` changes. The parallel state's own hooks and timers run only when no region moved. `always` is checked in the same order, one move at a time, with the same limit of 10.
- **A target in another region re-enters the parallel state.** A transition from `/alive/move/idle` to `/alive/weapon/cooldown` exits all of `/alive` and enters it again. A region's transitions to its own states leave the other regions alone.
- **Regions run in name order.** Neither Lua nor JavaScript keeps the written order of a table's keys, so regions are ordered by child name: `move` before `weapon`, whatever order the config lists them in. Names compare by Unicode code point, so the order is the same in Bun and in Defold, accented and emoji names included. Name regions to match the order you want.

`path` stays one leaf, so code written for a machine without regions keeps working: it is the first region's leaf. `leaves` lists every active leaf in region order, and `matches` is true for every active state in every region. A region root can carry `restoreDepth`, and resumes its last child when the parallel state is entered again.

A parallel state with `initial`, `restoreDepth` or no child states throws when the machine is defined, naming its path; `initial` is also a compile error. The root config cannot be parallel: put the regions in a child state, as `/alive` does above.

## Run to completion, `task` and `stop`

A machine handles one event at a time, to completion. A `send` from inside a hook, `when`, `run` or `task` does not run at once: it queues the event, which runs after the current transition, every `enter` and `exit` included, has finished. Queued events run in order before the outer `send`, `update` or `start` call returns, so `start` hands back a machine that has already handled whatever its `enter` hooks sent.

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
      enter: (ctx, machine) => {
        if (ctx.cached) {
          machine.send({ type: "LOADED" });
        }
      },
      on: { LOADED: "/playing" },
    },
    playing: { on: { QUIT: "/done" } },
    done: {
      enter: (_ctx, machine) => machine.stop(),
    },
  },
});

const m = level.start({ cached: true });
m.path; // "/playing": start ran the queued LOADED before returning
m.send({ type: "QUIT" });
m.path; // undefined: done stopped the machine
```

`stop()` exits every active state, deepest first and the root last, and sets `path` to `undefined`. Called inside a step, as `done` does above, it lets that step finish, then drops any queued events instead of running them. After `stop`, `send` and `update` do nothing.

### Engine callbacks: `task` and `finish`

An engine callback that finishes later (an animation, a proxy load, an HTTP response) belongs in a state's `task`. It runs after the state's `enter` hook on every entry, lives as long as that entry, and receives a one-shot `finish(event)`; pass it whichever typed event means success or failure. If the state was left, re-entered, or the machine was stopped before the callback fires, that `finish` is ignored, so a late callback never moves a machine that has moved on. The door's `opening` state [below](#define-a-machine-in-a-plain-module) finishes when its fade ends.

A `task` may return a cleanup function. The machine calls it once when that entry ends: after the state's `exit` hook, on `stop()`, before a re-entry starts the next `task`, and when a [hot reload](#hot-reload) removes the state.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type BlinkEvent = { type: "HIDE" };

export const blink = defineMachine<{ readonly sprite: Url }, BlinkEvent>()({
  initial: "/blinking",
  states: {
    blinking: {
      task: (ctx) => {
        const handle = timer.delay(0.2, true, () => {
          msg.post(ctx.sprite, "disable");
        });
        return () => {
          timer.cancel(handle);
        };
      },
      on: { HIDE: "/hidden" },
    },
    hidden: {},
  },
});
```

### Cleanup runs on exit, never after an `await`

Release what a state holds (cancel an animation, a timer, a pending request) in its `exit` hook, as the door's `opening` does, or in the cleanup its `task` returns. Both run on every way out of the state, including `stop()`. Never put cleanup after an `await` in a `task` or a hook: by the time the awaited work resumes, the state may already be gone, and code that runs then cleans up after a state that no longer exists, or never runs at all.

### Scripted sequences

`sequence` from `@defold-typescript/types/hsm/async` turns an `async` function into a `task`. It receives the context and a `signal`: `await signal.wait(seconds)` pauses for that long in engine time, and the event the function returns is sent to the machine. `signal.aborted` turns `true` once the state is left.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import { sequence } from "@defold-typescript/types/hsm/async";

interface IntroCtx {
  readonly title: Url;
}

type IntroEvent = { type: "DONE" } | { type: "SKIP" };

export const intro = defineMachine<IntroCtx, IntroEvent>()({
  initial: "/playing",
  states: {
    playing: {
      task: sequence(async (ctx, signal) => {
        msg.post(ctx.title, "enable");
        await signal.wait(2);
        msg.post(ctx.title, "disable");
        await signal.wait(0.5);
        return { type: "DONE" };
      }),
      on: { DONE: "/menu", SKIP: "/menu" },
    },
    menu: {},
  },
});
```

Leaving the state cancels a pending `signal.wait`, so the code after it never runs: leaving `playing` (here on `SKIP`) stops the sequence at its current `wait`. An event the sequence returns after the state is left is ignored. An error thrown inside the sequence leaves the machine where it is and is raised again from a fresh timer callback, so it shows in the engine console. A `signal.wait` waits on `timer.delay`, not on `update(dt)`, so it keeps counting while a machine's updates are paused.

Only `signal.wait` is cancelled. Any other promise you `await` (a request, a message reply, a promise of your own) can still resolve after the state is left, and the code after it then runs. Check `signal.aborted` after such an `await`, and return before doing work that belongs to the state:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import { sequence } from "@defold-typescript/types/hsm/async";

declare function loadScores(): Promise<readonly number[]>;

interface BoardCtx {
  readonly board: Url;
}

type BoardEvent = { type: "LOADED" } | { type: "BACK" };

export const scores = defineMachine<BoardCtx, BoardEvent>()({
  initial: "/loading",
  states: {
    loading: {
      task: sequence(async (ctx, signal) => {
        const loaded = await loadScores();
        if (signal.aborted) return;
        msg.post(ctx.board, "enable");
        return loaded.length > 0 ? { type: "LOADED" } : { type: "BACK" };
      }),
      on: { LOADED: "/shown", BACK: "/menu" },
    },
    shown: {},
    menu: {},
  },
});
```

### Watchdog

`task` and `sequence` take no timeout option. Put the deadline on the state instead: an `after` entry leaves the state when nothing finished in time, and leaving it ignores the late `finish` and runs the cleanup.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type FetchEvent = { type: "LOADED" } | { type: "FAILED" };

export const fetcher = defineMachine<{ readonly url: string }, FetchEvent>()({
  initial: "/loading",
  states: {
    loading: {
      task: (ctx, finish) => {
        http.request(ctx.url, "GET", (_self, _id, response) => {
          finish(response.status === 200 ? { type: "LOADED" } : { type: "FAILED" });
        });
      },
      after: { 5: "/failed" },
      on: { LOADED: "/ready", FAILED: "/failed" },
    },
    ready: {},
    failed: {},
  },
});
```

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
        trigger_response: { to: "/opening", when: (_ctx, event) => event.enter },
      },
    },
    opening: {
      task: (ctx, finish) => {
        go.animate(ctx.sprite, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, () => {
          finish({ type: "OPENED" });
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

The `when` reads `event.enter` because a `trigger_response` payload has one; the [message bridge](#the-message-bridge) turns that engine message into the event.

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

Here `self` takes its type from what `init` returns. For a named `Self` type, a `properties` block, or a machine that starts later, see [Type `self`](#type-self) in the cheat sheet.

A module-level instance (`const door = doorMachine.start(...)` at the top of a script file) is shared by every object that runs the script; see [Where script state lives](./script-state.md).

### Restart a machine

A stopped instance does not start again. To restart, stop the instance and start a new one from the same definition, then store it where the old one was:

```ts title="door-restart.ts"
import { defineScript } from "@defold-typescript/types";
import { doorMachine } from "./door-machine";

function startDoor() {
  return doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 });
}

export default defineScript({
  init() {
    return { door: startDoor() };
  },
  update(self, dt) {
    self.door.update(dt);
  },
  on_reload(self) {
    self.door.stop();
    self.door = startDoor();
  },
  final(self) {
    self.door.stop();
  },
});
```

`stop()` runs the `exit` hooks of the old instance, and `start` enters `initial` with the context it is given: a new object for a clean start, or the old instance's `ctx` to keep its fields.

- **Restart from a script callback, not from a hook.** Inside a hook, `stop()` waits for the step to end, so a `start` on the next line runs the new instance's `enter` hooks before the old instance's `exit` hooks.
- **Listeners stay with the old instance.** Call `onMove` and [`inspect`](#debug-a-machine) again on the new one.
- **`on_reload` suits a restart.** A reload does not run `init` again, so restarting there is how a changed starting context reaches a running object; see [Restart on a hot reload](#restart-on-a-hot-reload).

To restart one state and keep the instance, name the state as its own target; see [Events and transitions](#events-and-transitions).

## Hot reload

Hot reload lets you edit a machine while the game runs and see the change without restarting. To use it, give `defineMachine` a key, a name for this definition:

```ts title="enemy-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface EnemyCtx {
  speed: number;
}

export type EnemyEvent = { type: "SPOTTED" } | { type: "LOST" };

export const enemyMachine = defineMachine<EnemyCtx, EnemyEvent>("enemy")({
  initial: "/patrol",
  states: {
    patrol: { on: { SPOTTED: "/chase" } },
    chase: { on: { LOST: "/patrol" }, after: { 5: "/patrol" } },
  },
});
```

### Why the key is needed

When [`watch --hot-reload`](./watch.md#hot-reload) or [`reload`](./reload.md) pushes your edit, Defold runs the changed file again but throws away what that run returns. Every script that already imported the file keeps the first copy. Without a key, the edited `defineMachine` call builds a new machine that no script holds, and the enemies already running keep the old states until you restart.

With a key, `defineMachine` first looks the key up in a table kept inside the `hsm` library, which a reload never replaces. It finds the machine it built the first time and puts the new states into that same object. Every script still holds that object, so every running instance sees the edit.

### What happens after a reload

1. You save `enemy-machine.ts`, and the edit is pushed to the game.
2. The file runs again, and `defineMachine("enemy")` puts the new states into the existing machine. If the new config has a mistake, it throws and the old states stay in use.
3. The running instances do not change yet: `path` still reads the old state.
4. On its next `send` or `update`, each instance sees the new definition and switches to it. Because `update` runs every frame, that is the next frame.

The script needs no `on_reload` for this.

### What each instance keeps

An instance always keeps its `ctx`. What happens to its current state depends on the edit:

| After the edit, the current state… | The instance… |
| --- | --- |
| still exists | stays in it, keeps its `after` timers counting, and runs no `enter` or `exit` hook. The edited transitions, `when` checks and hooks apply from now on. |
| still exists, but now has child states | enters its `initial` child (and that child's `initial`, and so on), running their `enter` hooks. |
| was removed | moves to the closest parent state that still exists and enters that parent's `initial` chain, running those `enter` hooks. The removed states run no `exit` hook, because their code is gone, but a cleanup their `task` returned still runs, deepest state first. |
| is a [parallel](#run-regions-side-by-side-with-parallel) state that gained a region | keeps its other regions as they are and enters only the new one. |
| was a parallel state and is now compound | keeps its first region in name order and drops the others like removed states. |

States are matched by path, so renaming `chase` to `hunt` counts as removing `/chase`. A state with [`restoreDepth`](#resume-with-history) keeps its remembered children the same way: if the edit removed a remembered child, the next entry uses `initial` at that level. When the current state changes, `onMove` listeners get the move with the cause `"reload"`, and the [debug inspector](#debug-a-machine) prints it.

### Many objects, one machine

The key names the definition, not an object. If 20 enemies run a script that starts `enemyMachine` in `init`, there are 20 instances of one machine. A reload changes the machine once, and each of the 20 instances switches on its own next `update`. An enemy in `/patrol` and an enemy in `/chase` each follow the table above for their own state.

Different machines need different keys. If doors also used `"enemy"`, each reload of one file would replace the other machine's states.

### Restart on a hot reload

A reload keeps each instance in its current state when that state still exists, so an edited `enter` hook waits for the next entry and the instance keeps the `ctx` it started with. To start over instead, [restart the machine](#restart-a-machine) in the script's `on_reload`. The two work side by side, and which one runs depends on the file you edit:

| You edit | What runs | The instance… |
| --- | --- | --- |
| the machine's module, defined with a key | the switch [described above](#what-happens-after-a-reload), on the next `send` or `update` | stays in its state with its `ctx`, under the new rules. |
| the machine's module, defined without a key | nothing | keeps the old states, and so does an instance a later restart starts. |
| the script file, with a restart in `on_reload` | `stop()`, then `start` | is replaced by a new one at `initial`, with the context the script builds. |

- **A restart starts the newest definition.** With a key, `start` uses the states the definition holds when it is called. If an edit replaces them later, the new instance switches like any other.
- **Editing only the machine's module restarts nothing.** Defold calls `on_reload` only on a script whose own file was reloaded. An edited `enter` hook runs the next time its state is entered.
- **Every object that runs the script restarts.** `on_reload` runs once per object, so 20 enemies all go back to `initial`.
- **Build the starting context in the script file.** A reloaded script still gets the first copy of every module it imports, so a context factory exported from the machine's module stays the old one.

### Define the machine once, at the top of a file

Call a keyed `defineMachine` at the top level of a module, as in the example above, so it runs once each time the file loads. Inside `init` it runs once per object:

```ts
import { defineScript } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";

export default defineScript({
  init() {
    // Wrong: runs for every enemy, and each run replaces the "enemy" definition.
    const machine = defineMachine<{ speed: number }, { type: "SPOTTED" }>("enemy")({
      initial: "/patrol",
      states: { patrol: {} },
    });
    return { ai: machine.start({ speed: 120 }) };
  },
});
```

Here each new enemy redefines `"enemy"`: the config is compiled again, every enemy already alive switches to it, and if the config's hooks or `when` checks use values from that `init`, the newest enemy's values replace everyone's.

Without a key, `defineMachine` builds a separate machine on every call, and a reload does not reach running instances.

## Performance

The budget is 200 game objects, each running its own instance of one three-level machine, for under 0.5 ms of `update` and `send` per frame in the stock engine, with neither call building a table. A bench in the repository measures it: every enemy ticks its machine each frame through `after` timers and an `update` hook, and sends one event every 20 frames. It runs 300 frames that sample the heap around each call, then 300 frames that time each call, so neither measurement includes the other's probes.

| Avg ms per frame | Worst frame ms | Allocating calls (update / send) | Heap KB (update / send) | Engine | System | Date |
| --- | --- | --- | --- | --- | --- | --- |
| 0.05 | 0.10 | 3 of 60,000 / 6 of 3,000 | 2.2 / 7.0 | 1.13.2 | macOS, arm64 | 2026-10-03 |

The few allocating calls are the Lua VM's own one-time work the first time a path runs (a JIT trace, a deeper call stack), not the machine. Reproduce it from a clone of the repository with Java and a display:

```sh
bun run --cwd packages/api-probe bench:hsm
```

`update` and `send` build nothing, but the event you pass is a table: an event literal written at the `send` call builds a new one on every call, and so does `toEvent` from the [message bridge](#the-message-bridge). On a hot path, hoist a constant event to the top of the module and send that:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type GuardEvent = { type: "SPOT" } | { type: "LOSE" };

export const guard = defineMachine<{ seen: number }, GuardEvent>()({
  initial: "/idle",
  states: {
    idle: { on: { SPOT: "/alert" } },
    alert: { on: { LOSE: "/idle" } },
  },
});

const SPOT = { type: "SPOT" } as const;

const m = guard.start({ seen: 0 });
m.send(SPOT); // the same table on every call
m.send({ type: "LOSE" }); // a new table on every call
```

## Types

**`defineMachine` takes two calls.** `defineMachine<Ctx, E>()` fixes the context and event types (and takes an optional [hot reload](#hot-reload) key), and the second call takes the config. TypeScript cannot infer some type arguments of one call while you write the others, and the config has to be inferred: its literal shape is where the state paths come from.

**Events are `EventObject`s.** `E` is a union of objects that each have a string `type`, plus any payload fields. `on` accepts only those `type` values as keys, and each `when` and `run` sees the variant its key names.

**`start` returns a `MachineInstance<Ctx, E, P>`,** where `P` is the union of the machine's state paths: `matches()` accepts only those, and `path` is one of them or `undefined` once stopped. Because `path` can be `undefined`, a lookup table keyed by path can only be indexed after a check. Hooks, `when` and `run` are typed before the paths are known, so the `machine` they receive is a `MachineInstance<Ctx, E>` whose `path` and `matches()` use plain `string`. To name an instance's type, for a field or a parameter, write `ReturnType<typeof doorMachine.start>`. The context, event and path types come from the machine the same way; see [Read types off the machine](#read-types-off-the-machine).

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

**A bad path is an error where it is written.** An `initial`, a target (`on`, `to`, `after`, `always`) and the path an `update` hook returns accept only the machine's full paths, and an `on` key accepts only an event type. A typo, a bare name such as `"idle"` included, fails to compile on that property, and the editor suggests the paths and event types as you type:

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type GoEvent = { type: "GO" };

defineMachine<{ steps: number }, GoEvent>()({
  initial: "/idle",
  states: {
    idle: {
      on: {
        // @ts-expect-error -- "/nowhere" is not one of the machine's paths
        GO: "/nowhere",
      },
    },
  },
});
```

Three cases fall outside that check:

- **Below a leaf.** A path below a state with no children, such as `"/idle/deeper"`, compiles, and so do `initial` and `restoreDepth` on a leaf. Each one throws when the machine is defined.
- **A hook declared outside the config.** An `update` hook returns one of the machine's paths or `undefined`; a plain `string` does not compile. TypeScript widens a function's single returned path to `string`, so a hook written outside the config needs `as const`: `const land = () => "/grounded" as const`.
- **A level of hooks only.** When every state at one `states` level holds nothing but hooks, that level is still checked, but the editor does not suggest its children while you type.

**`MessageEvent<K>` and `messageEvents`** turn Defold messages into machine events; see the next section.

### The message bridge

Defold delivers messages as a hashed `message_id`, a payload table and the sender's URL. `messageEvents(ids)` turns the ones you list into typed events `{ type: id, ...payload, sender }`, reusing the payload types already declared through `BuiltinMessages` and `CustomMessages`, so a payload is declared once. `MessageEvent<K>` is that event's type, for the machine's event union, and carries `sender: Url`. Its `toEvent(message_id, message, sender)` takes the `on_message` parameters of both `defineScript` and `defineGuiScript` and returns `undefined` for any id you did not list. A payload field named `type` or `sender` never overrides the event's own. Build the mapper once at module scope: it hashes the ids when it is created.

A `when` or `run` reads `event.sender` to answer whoever sent the message:

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
          run: (ctx, event) => {
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

### Events from an addon

An addon that sends messages to your script needs no adapter. Declare its messages once in `CustomMessages`, then list the ones the machine handles in `messageEvents`. This works when the addon builds each id as `hash("<name>")` for the name you declare, so check the addon's source for how it makes its ids.

[Monarch](/api/monarch.monarch) is an example. It tells every script registered with `monarch.add_listener` when a screen starts or finishes showing or hiding, and when it fails to show. Its `SCREEN_TRANSITION_*` constants are `hash("monarch_screen_transition_in_started")` and so on, so the five messages are declared by those names:

- `monarch_screen_transition_in_started` and `monarch_screen_transition_in_finished` carry `screen` and `previous_screen`, which is `undefined` when the stack was empty.
- `monarch_screen_transition_out_started` and `monarch_screen_transition_out_finished` carry `screen` and `next_screen`, which is `undefined` on a `back` past the first screen.
- `monarch_screen_transition_failed` carries `screen`.

Register the script in `init` and remove it in `final`. One mapper covers Monarch's messages and your own:

```ts title="flow.ts"
import { defineScript } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";
import * as monarch from "monarch.monarch";

declare global {
  interface CustomMessages {
    monarch_screen_transition_in_started: { screen: Hash; previous_screen?: Hash };
    monarch_screen_transition_in_finished: { screen: Hash; previous_screen?: Hash };
    monarch_screen_transition_out_started: { screen: Hash; next_screen?: Hash };
    monarch_screen_transition_out_finished: { screen: Hash; next_screen?: Hash };
    monarch_screen_transition_failed: { screen: Hash };
    game_over: { score: number };
  }
}

type FlowEvent = MessageEvent<
  "monarch_screen_transition_in_finished" | "monarch_screen_transition_failed" | "game_over"
>;

const flowMachine = defineMachine<{ screen: Hash | undefined; best: number }, FlowEvent>()({
  initial: "/loading",
  states: {
    loading: {
      on: {
        monarch_screen_transition_in_finished: {
          to: "/playing",
          run: (ctx, event) => {
            ctx.screen = event.screen;
          },
        },
        monarch_screen_transition_failed: "/failed",
      },
    },
    playing: {
      on: {
        game_over: {
          to: "/loading",
          run: (ctx, event) => {
            ctx.best = math.max(ctx.best, event.score);
          },
        },
      },
    },
    failed: {},
  },
});

const flowEvents = messageEvents([
  "monarch_screen_transition_in_finished",
  "monarch_screen_transition_failed",
  "game_over",
]);

export default defineScript({
  init() {
    monarch.add_listener();
    return { flow: flowMachine.start({ screen: undefined, best: 0 }) };
  },
  on_message(self, message_id, message, sender) {
    const event = flowEvents.toEvent(message_id, message, sender);
    if (event !== undefined) {
      self.flow.send(event);
    }
  },
  final(self) {
    monarch.remove_listener();
    self.flow.stop();
  },
});
```

Collection proxies need no adapter: `proxy_loaded`, `proxy_ready`, `proxy_error` and `proxy_unloaded` are Defold messages, so list them in `messageEvents`.

## Debug a machine

To run a machine away from the game, with its source on screen and its active states highlighted, open its file with [`hsm-view`](./hsm-view.md).

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

`inspect` prints one line when it is called, then one line for each move:

```text
hsm door frame 0: inspecting [/closed]
hsm door frame 120: /closed -> /opening (trigger_response) [/opening]
hsm door frame 150: /opening -> /open (OPENED) [/open]
hsm door frame 330: /open -> /closed (after) [/closed]
```

The frame number counts `draw` calls, so it tracks `update` when you draw every frame. The paths are leaf paths. The text in parentheses is the event's `type`, or, when no event moved the machine, the cause: `after`, `update`, `always`, `stop` or `reload`. The brackets list every active leaf after the move, joined by `, `, so a parallel machine's line names each region's leaf. After `stop()` the new path reads `(stopped)` and the brackets are empty. A label already used by another `inspect` call gets the next ordinal no other call has used, `enemy#2`, `enemy#3`, in both the console lines and the drawn text. In a console line, a backslash escapes each `\`, `[`, `]`, `(`, `)`, `,`, `>` and `:` inside the label, a path or the event's `type`, and a line break reads `\n` (a carriage return `\r`), so every line splits back into the same parts; the drawn text shows the names as they are. `draw(target)` posts `draw_debug_text` to `@render:` with the label and the active leaves joined by `, `, 40 units above the target's world position.

In a release build, where `sys.get_engine_info().is_debug` is `false`, `inspect` registers nothing and `draw` does nothing, so the calls can stay in shipped code.

`inspect` is built on `onMove(listener)`, which every instance has. The listener receives the old leaf path, the new one (`undefined` after `stop()`), the cause and the event (`undefined` unless the cause is `event`), after the move's `enter` hooks have run. It is not called for the first entry at `start` or for a transition with no `to`. Each call adds a listener and returns a function that removes it. Use it to feed your own tools.

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

After, those branches are states. Each state plays its animation once in `enter`, and `JUMP` is handled only in `grounded`, so the state itself is the check:

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
          to: "/airborne/rising",
          run: (ctx) => {
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
              run: (ctx) => {
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
- **A state is as fresh as its last update.** `grounded` reflects the contacts seen by the last `fixed_update`, while the old check read `ground_contact` after the physics step that followed it. So the player can now jump on the one physics step after walking off a ledge, a single step of leniency the example accepts.

## Cheat sheet

Short answers to common tasks. Each snippet is an excerpt of one enemy machine: a guard with `health` that patrols, goes on alert, takes hits and dies.

### Configure a state

<div class="table-scroll code-table">
<table>
<thead>
<tr><th>I want to</th><th>Solution</th><th>Snippet</th></tr>
</thead>
<tbody>
<tr><td>

Move to a state when an event arrives

</td><td>

Name the target under [`on`](#events-and-transitions)

</td><td>

```ts excerpt
on: { PAUSE: "/paused" }
```

</td></tr>
<tr><td>

Move only when a check passes

</td><td>

A rule with `to` and `when`; in a list of rules, the first that passes wins

</td><td>

```ts excerpt
on: {
  HIT: {
    to: "/dying",
    when: (ctx, event) =>
      ctx.health <= event.damage,
  },
}
```

</td></tr>
<tr><td>

React to an event and stay in the state

</td><td>

A rule with `run` and no `to`

</td><td>

```ts excerpt
on: {
  HIT: {
    run: (ctx, event) => {
      ctx.health -= event.damage;
    },
  },
}
```

</td></tr>
<tr><td>

Move after a delay

</td><td>

[`after`](#update-and-after), keyed by seconds on the state's clock

</td><td>

```ts excerpt
after: { 5: "/alive/patrol" }
```

</td></tr>
<tr><td>

Decide where to go as soon as a state is entered

</td><td>

[`always`](#move-on-at-once-with-always): the first rule whose `when` passes wins

</td><td>

```ts excerpt
always: [
  { to: "/gone", when: (ctx) => ctx.health <= 0 },
  { to: "/alive" },
]
```

</td></tr>
<tr><td>

Check something every frame

</td><td>

[`update`](#update-and-after): return a path to move there, `undefined` to stay

</td><td>

```ts excerpt
update: (ctx) =>
  ctx.health < 2 ? "/alive/patrol" : undefined
```

</td></tr>
<tr><td>

Come back to the child that was active

</td><td>

[`restoreDepth`](#resume-with-history) on the parent state

</td><td>

```ts excerpt
restoreDepth: 1
```

</td></tr>
<tr><td>

Wait for an engine callback

</td><td>

[`task`](#engine-callbacks-task-and-finish): call `finish` with an event when the work ends

</td><td>

```ts excerpt
task: (_ctx, finish) => {
  sound.play("#death", {}, () => {
    finish({ type: "DEAD" });
  });
}
```

</td></tr>
<tr><td>

Clean up on every way out of a state

</td><td>

`exit`, which also runs on `stop()`

</td><td>

```ts excerpt
exit: (ctx) =>
  go.cancel_animations(ctx.sprite, "tint.w")
```

</td></tr>
<tr><td>

Stop the machine from one of its states

</td><td>

`machine.stop()` in a hook; see [Run to completion, `task` and `stop`](#run-to-completion-task-and-stop)

</td><td>

```ts excerpt
enter: (_ctx, machine) => machine.stop()
```

</td></tr>
<tr><td>

Restart a machine

</td><td>

Stop the instance and start a new one from a script callback; see [Restart a machine](#restart-a-machine)

</td><td>

```ts excerpt
self.guard.stop();
self.guard = startGuard();
```

</td></tr>
<tr><td>

Take a Defold message as an event

</td><td>

List it in [`messageEvents`](#the-message-bridge), then send what `toEvent` returns from `on_message`, unless it is `undefined`

</td><td>

```ts excerpt
export const guardEvents = messageEvents([
  "trigger_response",
]);
```

```ts excerpt
on_message(self, message_id, message, sender) {
  const event = guardEvents.toEvent(
    message_id,
    message,
    sender,
  );
  if (event !== undefined) {
    self.guard.send(event);
  }
}
```

</td></tr>
<tr><td>

Keep running instances through a hot reload

</td><td>

Pass a [key](#hot-reload) to the first call

</td><td>

```ts excerpt
defineMachine<GuardCtx, GuardEvent>("guard")
```

</td></tr>
<tr><td>

Start over when the script is hot reloaded

</td><td>

Restart the machine in `on_reload`; see [Restart on a hot reload](#restart-on-a-hot-reload)

</td><td>

```ts excerpt
on_reload(self) {
  self.guard.stop();
  self.guard = startGuard();
}
```

</td></tr>
</tbody>
</table>
</div>

### Read types off the machine

Every type comes from the exported machine, so nothing is declared twice; see [Types](#types). `import type` is enough for these.

<div class="table-scroll code-table">
<table>
<thead>
<tr><th>I want to</th><th>Solution</th><th>Snippet</th></tr>
</thead>
<tbody>
<tr><td>

Name the type of a running instance

</td><td>

`ReturnType` of the machine's `start`

</td><td>

```ts excerpt
type Guard = ReturnType<
  typeof guardMachine.start
>;
```

</td></tr>
<tr><td>

Name the context type

</td><td>

Index the instance type

</td><td>

```ts excerpt
type GuardCtx = Guard["ctx"];
```

</td></tr>
<tr><td>

Name every event the machine takes

</td><td>

The parameter of `send`

</td><td>

```ts excerpt
type GuardEvent = Parameters<Guard["send"]>[0];
```

</td></tr>
<tr><td>

Name every state path

</td><td>

`path`, without its `undefined`

</td><td>

```ts excerpt
type GuardPath = NonNullable<Guard["path"]>;
```

</td></tr>
<tr><td>

Name the event a message mapper builds

</td><td>

What `toEvent` returns, without its `undefined`

</td><td>

```ts excerpt
type GuardMessage = NonNullable<
  ReturnType<typeof guardEvents.toEvent>
>;
```

</td></tr>
<tr><td>

Pass an instance to a function

</td><td>

Use the instance type as the parameter type

</td><td>

```ts excerpt
function isAlive(guard: Guard): boolean {
  return guard.matches("/alive");
}
```

</td></tr>
<tr><td>

Write a function for any machine with this context and these events

</td><td>

Add a type parameter for the paths: without it, `MachineInstance` takes `string` paths, which a started instance does not fit

</td><td>

```ts excerpt
function hurt<P extends string>(
  guard: MachineInstance<GuardCtx, GuardEvent, P>,
): void {
  guard.send({ type: "HIT", damage: 1 });
}
```

</td></tr>
</tbody>
</table>
</div>

### Type `self`

<div class="table-scroll code-table">
<table>
<thead>
<tr><th>I want to</th><th>Solution</th><th>Snippet</th></tr>
</thead>
<tbody>
<tr><td>

Get a typed `self.guard` with no annotation

</td><td>

Return the instance from `init`; see [One instance per object, on `self`](#one-instance-per-object-on-self)

</td><td>

```ts excerpt
init() {
  const sprite = msg.url("#sprite");
  const ctx = { sprite, health: 3 };
  return { guard: guardMachine.start(ctx) };
}
```

</td></tr>
<tr><td>

Pass `self` to a function

</td><td>

Name a `Self` type whose field comes from the definition, then call `defineScript<Self>`; `defineGuiScript` takes it the same way

</td><td>

```ts excerpt
type Self = {
  guard: ReturnType<typeof guardMachine.start>;
};

function tick(self: Self, dt: number): void {
  self.guard.update(dt);
}
```

</td></tr>
<tr><td>

Name `self` beside a `properties` block

</td><td>

Annotate what `init` returns: `defineScript<Self>` would read `Self` as the properties. See [Three ways to type `self`](./script-lifecycle.md#three-ways-to-type-self)

</td><td>

```ts excerpt
init(self): Self {
  const sprite = msg.url("#sprite");
  const ctx = { sprite, health: self.health };
  return { guard: guardMachine.start(ctx) };
}
```

</td></tr>
<tr><td>

Start the machine after `init`

</td><td>

Make the field optional and check it before each use

</td><td>

```ts excerpt
type Self = {
  guard?: ReturnType<typeof guardMachine.start>;
};
```

```ts excerpt
if (self.guard !== undefined) {
  self.guard.update(dt);
}
```

</td></tr>
<tr><td>

Build the machine in `init`, from a property

</td><td>

Build it in a function with no hot reload key, call that from `init`, and read the instance type through the function

</td><td>

```ts excerpt
function buildGuardMachine(patrolFor: number) {
  return defineMachine<Ctx, HitEvent>()({
    initial: "/patrol",
    states: {
      patrol: { after: { [patrolFor]: "/rest" } },
      rest: { on: { HIT: "/patrol" } },
    },
  });
}

type Guard = ReturnType<
  ReturnType<typeof buildGuardMachine>["start"]
>;
```

</td></tr>
</tbody>
</table>
</div>

## Reference

### `StateConfig`

Every field is optional on a state; the root config requires `initial` and `states`.

| Field     | Type                                        | Meaning                                                                                       |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `type`    | `"parallel"`                                | Keep every child active at once, each as a region; see [Run regions side by side with `parallel`](#run-regions-side-by-side-with-parallel). Not allowed on the root. |
| `initial` | `string`                                    | The full path of the child entered with this state (`/on/bright` inside `on`). Required when `states` is set, unless the state is parallel. |
| `restoreDepth` | `number \| "all"`                       | Enter the children that were active when this state was last left, this many levels down, instead of `initial`; see [Resume with history](#resume-with-history). |
| `states`  | `{ [name: string]: StateConfig }`           | Child states, by name. A name is non-empty and contains no `/`.                               |
| `on`      | `{ [type]: target \| config \| config[] }`  | Transitions by event `type`, each target a full path; see [Events and transitions](#events-and-transitions). |
| `after`   | `{ [seconds: number]: string }`             | Full-path targets taken after this long in the state, in game time; see [`update` and `after`](#update-and-after). |
| `always`  | `target \| config \| config[]`               | Full-path targets taken right after any move that leaves this state active; the first whose `when(ctx)` is missing or passes wins. See [Move on at once with `always`](#move-on-at-once-with-always). |
| `enter`   | `(ctx, machine) => void`                    | Runs each time the state is entered.                                                          |
| `exit`    | `(ctx, machine) => void`                    | Runs each time the state is left, including on `stop()`.                                      |
| `update`  | `(ctx, dt, machine) => target \| undefined` | Runs on every `update(dt)` while active; a returned target, one of the machine's full paths, transitions. |
| `task`    | `(ctx, finish, machine) => (() => void) \| void` | Runs after `enter`; `finish(event)` sends one event if the state is still the one entered. A returned function runs once when that entry ends. |
| `invoke`  | `never`                                     | Renamed to `task`; setting it fails to compile.                                               |

### `MachineInstance`

| Member    | Type                    | Meaning                                                                            |
| --------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `ctx`     | `Ctx`                   | The context passed to `start`.                                                     |
| `path`    | `P \| undefined`        | The deepest active state's full path (the first region's leaf in a parallel state), or `undefined` once stopped. |
| `leaves`  | `readonly P[]`          | Every active leaf's full path, in region order; one path without parallel states, empty once stopped. The same array, updated in place. |
| `matches` | `(path: P) => boolean`  | Whether the state at the full path `path` is active, ancestors included.           |
| `send`    | `(event: E) => void`    | Handles `event`, or queues it when called during a step.                           |
| `update`  | `(dt: number) => void`  | Runs the `update` hooks, then the `after` timers if no hook transitioned.          |
| `stop`    | `() => void`            | Exits every active state; later `send` and `update` calls do nothing.              |
| `onMove` | `(listener: (from, to, cause, event) => void) => () => void` | Calls `listener` after each move with the old and new leaf, the cause and the event; inside a parallel state, the leaves are those of the region that moved. `to` is `undefined` on `stop()`. Returns a function that removes the listener. |
