---
toc-title: State machines
---
# State machines

`hsm` is a small typed hierarchical state machine library that ships with the toolchain and compiles to plain Lua. It replaces the `if (self.state === ...)` branches that otherwise spread across `update` and `on_message`. Learn it in the [tutorial](./state-machines-tutorial.md), copy a snippet from the [cheat sheet](#cheat-sheet), or look a field up in the [reference](#reference).

## Import it

`hsm` needs no install: its declarations ship in `@defold-typescript/types`, and the build compiles its source.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";
import { messageEvents } from "@defold-typescript/types/hsm/defold";
```

| Module | Holds | Written to |
| --- | --- | --- |
| `@defold-typescript/types/hsm` | the machine | `defold_typescript_hsm/index.lua` |
| `@defold-typescript/types/hsm/defold` | the [message bridge](#the-message-bridge) | `defold_typescript_hsm/defold.lua` |
| `@defold-typescript/types/hsm/debug` | the [debug inspector](#debug-a-machine) | `defold_typescript_hsm/debug.lua` |
| `@defold-typescript/types/hsm/async` | [scripted sequences](#scripted-sequences) | `defold_typescript_hsm/async.lua`, and `lualib_bundle.lua` for its promises |

- `build` and `watch` write each module your code uses to the project root, or under `outDir` when one is set. A module nothing uses, or only uses for its types, is not written.
- A source of your own that would compile to one of those paths fails the build.
- The library upgrades with the CLI, and a project scaffolded by `init` gitignores `defold_typescript_hsm/`.
- The library Lua ships with no source map: an error or a debugger frame inside it names `defold_typescript_hsm/<module>.lua`, not a TypeScript line.

## States and paths

A machine is a tree of states. The config passed to `defineMachine` is the root, a state with `states` of its own is a compound state and names the `initial` child to enter, and a state without children is a leaf. The active states form one chain from the root down to a leaf.

```ts
import { defineMachine } from "@defold-typescript/types/hsm";

type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

export const lamp = defineMachine<object, LampEvent>()({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: {
      initial: "/on/bright",
      on: { TOGGLE: "/off" },
      states: {
        bright: { on: { DIM: "/on/dim" } },
        dim: { on: { DIM: "/on/bright" } },
      },
    },
  },
});

const m = lamp.start({});
m.send({ type: "TOGGLE" });
m.path; // "/on/bright"
m.matches("/on"); // true: an ancestor of the current state
```

A parent holds what its children share: `TOGGLE` on `on` applies in `bright` and in `dim`, because an event a child does not handle moves up to its parent.

- **A path** is a leading `/`, then the state names from the root down, as in `/on/dim`. It is how `initial`, `path` and `matches()` name a state, and how a rule names its [target](#events-and-transitions).
- **`path`** is the deepest active state, or `undefined` once the machine has [stopped](#run-to-completion-task-and-stop), so `if (m.path)` means the same in TypeScript and in Lua.
- **`matches(p)`** is true for every active state, ancestors included.
- **The root has no name.** `/` alone is not a state, so the root is never a target and never matched.
- **A state name** is non-empty and holds no `/`. Any other character is allowed, `.` and `#` included.

`defineMachine` checks the config when the module loads. It throws, naming the state path, on a compound state with no `initial`, an `initial` that is not the full path of one of the state's children, a target that names no state, and a state name that is empty or holds `/`. Most of these fail to compile first; see [Types](#types).

## Events and transitions

`on` maps an event's `type` to a rule. A rule is a target path, an object of `to`, `when` and `run`, each optional, or a non-empty list of those objects, tried in order.

```ts excerpt
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
    chase: { on: { SEE_PLAYER: "/alive/chase", LOSE_PLAYER: "/alive/patrol", FALL: "/dead" } },
  },
},
```

- **Which rule runs.** An event starts at the deepest active state and moves up to the root. The first rule with no `when`, or whose `when` returns `true`, runs, and the event goes no further: `HIT` sent in `/alive/chase` reaches `alive`. An event no rule takes is dropped; see [React to an unhandled event](#react-to-an-unhandled-event).
- **A rule with no `to`** runs its `run` and nothing else: no state exits or enters. The second `HIT` rule is one.
- **A target is a full path,** wherever it is declared. `./patrol`, `../patrol` and a bare `patrol` are not paths, and `defineMachine` throws on them, naming the state that declares them.
- **Exit, `run`, enter.** A move runs `exit` from the deepest active state up, then the rule's `run`, then `enter` down to the target and on through each `initial`. A fatal `HIT` in `/alive/chase` runs `exit` of `chase`, `exit` of `alive`, the `run`, then `enter` of `dead`.
- **Only the states below the nearest one that holds both the source and the target exit and re-enter.** A `to` below the state the rule is on keeps that state: `/alive/patrol` from `alive` changes the child only.
- **A rule naming its own state restarts it.** The state exits and re-enters, so its timers and its `task` start over, as `SEE_PLAYER` in `chase` does. The same holds for an `after` timer, an `always` entry and an `update` hook: `after: { 1: "/blink" }` on `blink` repeats every second. A target that is an ancestor of the source exits and re-enters that ancestor.
- **Arguments.** `when` and `run` receive `(ctx, event, machine)`, with `event` narrowed to the variant the `on` key names. `run` is one function or a list run in order. The `machine` of a `when` is a read-only view with `path`, `leaves`, `matches` and `hasTag`.
- **A `when` has no side effects.** It is also called when the move does not happen: for each candidate of a list, and on every `always` recheck. Write in `run`, which is called only when the move happens; the [types](#types) reject a `when` that assigns to `ctx`.

### React to an unhandled event

`unhandled` on a state is the machine's reaction to any event it did not take, such as refusing a request by name:

```ts excerpt
initial: "/closed",
// in every state: refuse, by name, whatever request the door did not take
unhandled: (_ctx, event) => msg.post(event.sender, "door_refused", { request: event.type }),
states: {
  closed: { on: { open_door: "/open", lock_door: "/locked" } },
  open: { on: { close_door: "/closed" } },
  locked: {
    // in this state only: any request but the unlock rattles the handle
    unhandled: (ctx) => sprite.play_flipbook(ctx.sprite, "rattle"),
    on: { unlock_door: "/closed" },
  },
},
```

A locked door asked to open rattles its handle, then tells the sender the request was refused; `closed` and `open` only refuse. No rule took the request, so [`can`](#ask-whether-an-event-would-be-taken) still answers `false` for it.

- **It runs for the events an [`onUnhandled` listener](#listen-for-unhandled-events) hears, and no others.** An event a parent state takes runs no hook, on any state.
- **Every active state that has the hook runs it, deepest first.** The [regions](#run-regions-side-by-side-with-parallel) of a parallel state run in name order and the parallel state after them. The `onUnhandled` listeners run after the hooks.
- **`event` is the machine's whole event union.** Check `event.type` before reading a payload field. A field every variant has, such as `sender` on a machine that takes only messages, needs no check.
- **The hook moves nothing.** It returns nothing, no state exits or enters, and a `stop()` from it ends the step once every hook and listener has run for the event.
- **A state that should ignore an event takes it with an empty rule.** With `PAUSE: {}` on the state, neither a parent's rule nor any `unhandled` hook runs.
- **For one named event, write a rule.** `HIT: { run }` takes the event with its payload narrowed, and `can` answers `true` for it.

## `update` and `after`

`m.update(dt)` advances the machine by one tick. `after` maps a delay in seconds to a target path or to a [rule](#rules-on-a-timer), and an `update` hook returns a path to move to:

```ts excerpt
grounded: {
  update: (ctx) => (ctx.on_ground ? undefined : "/coyote"),
  on: { JUMP: "/jumping" },
},
// Just after walking off a ledge, a jump still counts.
coyote: {
  update: (ctx) => (ctx.on_ground ? "/grounded" : undefined),
  after: { 0.1: "/falling" },
  on: { JUMP: "/jumping" },
},
```

- **Clocks count the `dt` passed in.** Every active state adds `dt` to its own clock on every call and starts from zero each time it is entered, so a machine whose `update` is not called is frozen in time.
- **`update` hooks go first,** from the deepest active state up, each with `(ctx, dt, machine)`. A hook returns the path to move to, or `undefined` to pass. The first path returned wins: the remaining hooks do not run, and the move has no `run`.
- **Timers run only when no hook moved.** Each active state, deepest first, then runs its [`every` entries](#repeat-while-a-state-is-active) and tries its `after` timers in delay order. Landing on the tick `coyote`'s timer is due wins over falling.
- **One timer moves a region per `update`.** The first timer that moves ends the timers of its region for that call, and another timer that is due waits for the next call.
- **A state that stays active keeps counting while its children change,** so `after: { 2: "/normal" }` on a parent ends a blink that its two children pass back and forth every tenth of a second.

### A delay that reads the context

`after` also takes a list. Each entry holds a `delay`, a number or a function of the context that returns one, beside its `to`, as in `after: [{ delay: (ctx) => ctx.patrolFor, to: "/rest" }]`. One keyed machine then serves guards with different delays, because each instance reads its own; the cheat sheet has [the snippet](#type-self).

- The function is read once each time the state is entered, after the state's `enter` hook, so the hook can set what the delay reads.
- The delay is fixed for that stay, and a change to the context takes effect on the next entry. A delay that must change during a stay belongs in an `update` hook that counts the time and returns the path.
- A [hot reload](#hot-reload) reads the function again, and the state's clock keeps its time.
- Timers fire in delay order, and entries with one delay fire in list order.
- A delay that is not a non-negative number throws, naming the state.

### Rules on a timer

A timer also takes a rule in place of a target path:

```ts excerpt
charging: {
  after: {
    // Code at a set time, without leaving the state.
    1: { run: () => sound.play("#beep") },
    // Code that belongs to one move.
    3: { to: "/idle", run: countTimeout },
  },
  on: { RELEASE: "/idle" },
},
landing: {
  // A minimum time, and then a condition.
  after: { 0.3: { to: "/idle", when: (ctx) => ctx.grounded } },
},
```

- A rule takes `to`, `when(ctx, machine)` and `run(ctx, machine)`, each optional, and a list entry takes them beside `delay`. A rule with neither a `to` nor a `run` throws when the machine is defined.
- A timer fires at most once per stay.
- A due timer whose `when` fails is tried again on every `update` call until it passes or the state is left, so `landing` lasts at least 0.3 seconds and ends on the first tick that finds the hero on the ground. The timers after it are still tried.
- A timer with no `to` is not a move: no `update` hook is skipped, `always` is not rechecked, `onMove` is not called, and the call goes on to the next due timer.

### Repeat while a state is active

`every` runs code each time a delay passes while the state is active, such as damage every half second, a spawn or a rate of fire:

```ts excerpt
firing: {
  // A rate of fire read from the context.
  every: [{ delay: (ctx) => ctx.fireEvery, run: (ctx) => msg.post(ctx.muzzle, "fire") }],
  on: { LOSE: "/cooling" },
},
cooling: {
  // A fixed delay, beside a timer that leaves the state.
  every: {
    0.5: (ctx) => {
      ctx.heat -= 1;
    },
  },
  after: { 3: "/idle" },
},
```

- `every` takes a record of seconds to `run`, or a list of `{ delay, run }` whose `delay` is read as an [`after` delay](#a-delay-that-reads-the-context) is. `run` is one function or a list run in order, called with `(ctx, machine)`. A delay that is not a positive number throws, naming the state.
- An entry first runs one delay after the state is entered, then each time another delay has passed on the state's clock. It runs at most once per `update` call: a long frame runs it once, and its later runs stay on multiples of the delay.
- A run is not a move, as a [timer with no `to`](#rules-on-a-timer) is not.
- A state's entries run before its `after` timers, list entries in list order and a record's shortest delay first. On a call in which an `update` hook or a timer of a deeper state moved, they wait for the next call.
- An entry takes no `to` and no `when`: an `after` timer leaves the state, and a `run` tests a condition itself. An effect that depends on the frame time belongs in an `update` hook.

## Resume with history

Set `restoreDepth` on a compound state to make it remember which child was active when it was last left. Every later entry goes back to that child instead of `initial`, this many levels down:

```ts excerpt
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
```

Pausing in mid-air and sending `RESUME` lands on `/playing/air/rise`, running the `enter` hooks of `playing`, `air` and `rise`.

- **The count sets how deep the restore goes.** With `1`, leaving from `/playing/air/fall` brings back `air`, which is entered through its own `initial`. With `2` it also brings back `fall`, and `"all"` brings back every level below the state.
- **Inner levels restore only through the flagged state.** A move that targets `/playing/air` enters `air` through its `initial`, unless `air` has a `restoreDepth` of its own.
- **A parallel state is not a level.** The count passes through it to every region.
- **A target inside the state wins.** `RESTART` names `/playing/ground` and lands there whatever `playing` remembers. Every other entry uses the memory: a target of `/playing` itself, and a parent's `initial` chain that passes through it.
- **The first entry uses `initial`,** and each instance keeps its own memory.
- **What throws.** `restoreDepth` throws when the machine is defined if it is not a whole number from 1 or `"all"`, if it is larger than the number of levels below the state, or if the state has no child states. The first two are also compile errors. The compile check counts a parallel state as a level and follows the tree five levels down, so three mistakes are caught only by the throw: `restoreDepth` on a state with no child states, a count too large only because a parallel state is not a level, and a wrong count on a state with more than five levels below it.

## Move on at once with `always`

`always` lists the targets a state moves to as soon as it is entered, without waiting for an event. Use it for a state that only decides where to go next: a `HIT` that leads to `hurt` runs its `enter`, then moves on to `/dead` or back to `/fine` in the same `send`.

```ts excerpt
hurt: {
  enter: (ctx) => {
    ctx.health -= 1;
  },
  always: [{ to: "/dead", when: (ctx) => ctx.health <= 0 }, { to: "/fine" }],
},
```

- **Checked after every move:** `start`, an event, an `after` timer, a path an `update` hook returned, a hot reload, and another `always` move. The active states are checked deepest first, after the `enter` hooks and before the next queued event, and the first candidate whose `when` is missing or passes is taken.
- **Not checked on a tick or after a rule with no `to`.** A `when` reading `ctx` that a `run` or an `update` hook changed waits for the next move. To watch a condition every frame, return a target from an `update` hook.
- **A candidate has no event.** It is a `to`, an optional `when(ctx, machine)` and an optional `run(ctx, machine)`. A candidate without a `to`, or with an unknown target, throws when the machine is defined.
- **Loops throw.** At most 10 `always` moves follow one move. The 11th throws `hsm: state "<path>" took 10 always transitions in a row; check for an always loop`, drops the queued events and leaves the instance usable in the state it reached.

## Run regions side by side with `parallel`

A state with `type: "parallel"` keeps every child active at once. Each child is a region with its own active state, so a player can run and fire independently:

```ts excerpt
alive: {
  type: "parallel",
  on: { DIE: "/dead" },
  states: {
    move: {
      initial: "/alive/move/idle",
      states: { idle: { on: { START_FIRE: "/alive/move/run" } }, run: {} },
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
```

- **Entering and leaving.** Entering `/alive` enters each region through its `initial`, or through the target when the target is inside that region. Leaving it exits the last region first, each one deepest state first, then `/alive` itself.
- **Each region moves on its own.** An event is offered to every region in order, and each takes at most its first enabled rule, so `START_FIRE` moves both regions in one `send`. `onMove` hears each move with that region's old and new leaf.
- **The parallel state waits for its regions.** An event reaches `/alive`'s own `on`, and bubbles above it, only when no region took it. A region rule that leaves or re-enters `/alive` ends the offer, so later regions do not see that event.
- **Ticks and `always` run per region.** Each region runs its `update` hooks, then its due timers if no hook moved it, and the parallel state's own hooks and timers run only when no region moved. `always` is checked in the same order, one move at a time.
- **A target in another region re-enters the parallel state.** A rule from `/alive/move/idle` to `/alive/weapon/cooldown` exits all of `/alive` and enters it again.
- **Regions run in name order,** `move` before `weapon`, whatever order the config lists them in. Names compare by Unicode code point, so the order is the same in Bun and in Defold. Name regions to match the order you want.
- **`path` stays one leaf,** the first region's, so code written for a machine without regions keeps working. `leaves` lists every active leaf in region order: after one `START_FIRE` it is `["/alive/move/run", "/alive/weapon/cooldown"]`. `matches` is true for every active state in every region.
- **A region root can carry `restoreDepth`** and resumes its last child when the parallel state is entered again.
- **What throws.** A parallel state with `initial`, `restoreDepth` or no child states throws when the machine is defined, naming its path; `initial` is also a compile error. The root config cannot be parallel: put the regions in a child state.

### Read another region in a `when`

A `when` receives the running machine as its last argument, so a rule in one region can depend on the state of another. This knight has a `move` and a `posture` region, and jumps only while standing:

```ts excerpt
JUMP: {
  to: "/alive/move/jump",
  when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing"),
},
```

- **The view is read-only.** It has no `send`, `stop` or `ctx`: the context is the first argument of the `when`.
- **A `when` sees the regions that already moved.** Regions take an event in name order, so a `when` in `posture` sees where `move` went for that event, and a `when` in `move` sees `posture` as it was.
- **A `when` that asks about a group of states,** in one region or across several, reads a [tag](#name-a-group-of-states-with-tags).

## Name a group of states with tags

A state has one parent, so a group of states that crosses branches of the tree has no path of its own. A tag names such a group. This knight's `roll` state, in one region, and its raised shield `up`, in another, each carry `tags: ["invulnerable"]`, and a hit lands only while neither is active:

```ts excerpt
HIT: {
  when: (_ctx, _event, machine) => !machine.hasTag("invulnerable"),
  run: (ctx, event) => {
    ctx.health -= event.damage;
  },
},
```

- **A tag holds while any state that carries it is active.** A parent's tag holds while any of its children is active, and a tag in any region of a parallel state counts. Landing from a roll with the shield up leaves the knight invulnerable, which a flag set in `enter` and cleared in `exit` gets wrong.
- **Tag names are the third type argument of `defineMachine`,** here `defineMachine<KnightCtx, KnightEvent, KnightTag>()` with `type KnightTag = "invulnerable"`. A `tags` entry and a `hasTag` argument accept only those names, on the instance and on the `machine` every callback receives. Without the third argument neither compiles.
- **`hasTag` only reads.** It answers `false` for a name no state carries and once the machine is stopped. It builds no table, so an `update` hook can call it every frame.
- **A tag names a group and nothing else.** It carries no rule, hook or timer: behavior the states share goes on a parent state, and one branch of the tree is asked with `matches`.

## Run to completion, `task` and `stop`

A machine handles one event at a time, to completion.

- **A `send` during a step queues.** Called from a hook, a `run`, a `task` or a listener, it runs after the current move, every `enter` and `exit` included, has finished.
- **Queued events run in order before the outer `send`, `update` or `start` returns,** so `start` hands back a machine that has already handled whatever its `enter` hooks sent.
- **`stop()` exits every active state,** deepest first and the root last, and sets `path` to `undefined`. After it, `send` and `update` do nothing.
- **`stop()` inside a step lets that step finish,** then drops any queued events instead of running them.

This level's `loading` state calls `machine.send({ type: "LOADED" })` from its `enter` hook when the level is cached, and its last state, `done`, calls `machine.stop()` from `enter`:

```ts excerpt
const m = level.start({ cached: true });
m.path; // "/playing": start ran the queued LOADED before returning
m.send({ type: "QUIT" });
m.path; // undefined: done stopped the machine
```

### Engine callbacks: `task` and `finish`

Work that finishes later, such as an animation, a proxy load or an HTTP response, belongs in a state's `task`:

```ts excerpt
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
```

- **A `task` runs after the state's `enter` hook on every entry,** and lives as long as that entry.
- **`finish(event)` is one-shot.** Pass it whichever typed event means success or failure.
- **A late `finish` is ignored.** If the state was left, re-entered, or the machine was stopped before the callback fires, it moves nothing.
- **A `task` may return a cleanup function.** The machine calls it once when that entry ends: after the state's `exit` hook, on `stop()`, before a re-entry starts the next `task`, and when a [hot reload](#hot-reload) removes the state. [A machine that lives during one state](#a-machine-that-lives-during-one-state) returns one.
- **Several pieces of work** are counted with a [`WaitGroup`](#waitgroup); see [Wait for something to finish](#wait-for-something-to-finish).

### Cleanup runs on exit, never after an `await`

Whatever a state starts, its `exit` hook stops: an animation, a timer, a pending request. The cleanup a `task` returns does the same job. Both run on every way out of the state, `stop()` included, so `opening` above cancels its fade even when the object is deleted mid-fade.

Never put cleanup after an `await` in a `task` or a hook. By the time the awaited work resumes, the state may be gone, and that code cleans up after a state that no longer exists, or never runs at all.

### Scripted sequences

`sequence` from `@defold-typescript/types/hsm/async` turns an `async` function into a `task`. The function receives the context and a `signal`, and the event it returns is sent to the machine:

```ts excerpt
task: sequence(async (ctx, signal) => {
  msg.post(ctx.title, "enable");
  await signal.wait(2);
  msg.post(ctx.title, "disable");
  await signal.wait(0.5);
  return { type: "DONE" };
}),
on: { DONE: "/menu", SKIP: "/menu" },
```

- **`await signal.wait(seconds)` pauses for that long in engine time.** It waits on `timer.delay`, not on `update(dt)`, so it keeps counting while a machine's updates are paused.
- **Leaving the state cancels a pending `signal.wait`,** so the code after it never runs: `SKIP` stops the sequence at its current `wait`. An event the sequence returns after the state is left is ignored.
- **Only `signal.wait` is cancelled.** Any other promise you `await` can still resolve after the state is left, and the code after it then runs. Check `signal.aborted`, which turns `true` once the state is left, and return before doing work that belongs to the state, as [A group inside a sequence](#a-group-inside-a-sequence) does.
- **An error thrown inside the sequence** leaves the machine where it is and is raised again from a fresh timer callback, so it shows in the engine console.

### Watchdog

`task` and `sequence` take no timeout option. Put the deadline on the state: an `after` entry leaves the state when nothing finished in time, and leaving it ignores the late `finish` and runs the cleanup.

```ts excerpt
loading: {
  task: (ctx, finish) => {
    http.request(ctx.url, "GET", (_self, _id, response) => {
      finish(response.status === 200 ? { type: "LOADED" } : { type: "FAILED" });
    });
  },
  after: { 5: "/failed" },
  on: { LOADED: "/ready", FAILED: "/failed" },
},
```

## Wait for something to finish

Many states exist to wait: an intro plays to its end, a level loads, every door of a room opens. The library has no final state, so what finishes picks the recipe:

| What finishes | Recipe |
| --- | --- |
| A chain of child states that run one after another | The last child names the next state; see [A chain of child states](#a-chain-of-child-states) |
| Several pieces of engine work a state started | A `task` waits on a `waitGroup`; see [Work that completes](#work-that-completes) |
| Regions with states of their own | `always` on the parallel state; see [Regions with states of their own](#regions-with-states-of-their-own) |
| Several pieces of work inside a [`sequence`](#scripted-sequences) | The sequence awaits the group; see [A group inside a sequence](#a-group-inside-a-sequence) |

A piece that never reports keeps its state waiting, whichever recipe counts it: put a deadline on the state, as the [watchdog](#watchdog) does. A machine that has finished altogether ends itself with [`stop()`](#run-to-completion-task-and-stop) in the `enter` hook of its last state.

### A chain of child states

When the children run one after another, the last one names what comes next. `/intro/credits` ends the intro by naming `/menu`, a state outside its parent:

```ts excerpt
states: {
  logo: { after: { 2: "/intro/title" } },
  title: { after: { 2: "/intro/credits" } },
  credits: { after: { 2: "/menu" } },
},
```

Let the parent decide when the chain should not know what follows it: the next state depends on a condition, or more than one child can end the chain. The last timer then leads to a child that sends an event:

```ts excerpt
credits: { after: { 2: "/intro/done" } },
done: { enter: (_ctx, machine) => machine.send({ type: "INTRO_DONE" }) },
```

`INTRO_DONE` is [queued](#run-to-completion-task-and-stop): it runs as soon as the move into `done` has finished, and bubbles to `/intro`, whose rule `INTRO_DONE: [{ to: "/tutorial", when: (ctx) => ctx.firstRun }, { to: "/menu" }]` picks the next state.

### Work that completes

Engine work that reports through a callback is counted with a [`WaitGroup`](#waitgroup). A `task` builds the group and hands one `group.add()` to each engine call, and `group.wait` finishes with an event once every piece has reported:

```ts excerpt
task: (ctx, finish) => {
  const group = waitGroup();
  go.animate(ctx.curtain, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, group.add());
  const loaded = group.add();
  http.request(ctx.url, "GET", (_self, _id, response) => {
    if (response.status === 200) {
      loaded();
    } else {
      finish({ type: "FAILED" });
    }
  });
  group.wait(() => finish({ type: "READY" }));
},
```

The fade takes `group.add()` as its callback. The request can fail, so it gets a callback of its own: a response with status 200 reports to the group, and any other status calls `finish` with `FAILED` itself.

The number of pieces need not be written in the code. A loop adds one piece per item of a list whose length is known only while the game runs:

```ts excerpt
const group = waitGroup();
for (const enemy of ctx.enemies) {
  go.animate(enemy, "position.y", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_OUTQUAD, 1, 0, group.add());
}
group.wait(() => finish({ type: "ARRIVED" }));
```

`group.wait` goes after the loop. With an empty list nothing is pending, so `wait` calls back at once and the machine is in `/fighting` when `start` returns.

### Regions with states of their own

When each part has states of its own, make the parts regions of a parallel state and put an [`always`](#move-on-at-once-with-always) rule on that state. Its `when` asks `matches` for the last state of each region:

```ts excerpt
setup: {
  type: "parallel",
  always: {
    to: "/fight",
    when: (_ctx, machine) => machine.matches(DOORS_OPEN) && machine.matches(MUSIC_READY),
  },
  states: {
    doors: {
      initial: "/setup/doors/opening",
      states: { opening: { on: { OPENED: DOORS_OPEN } }, open: {} },
    },
    music: {
      initial: "/setup/music/fading",
      states: { fading: { on: { FADED: MUSIC_READY } }, ready: {} },
    },
  },
},
```

`OPENED` and `FADED` can arrive in either order. The move that brings the second region to its last state is followed by the move to `/fight`, in the same `send`.

- **Hold each last state's path in a constant,** as in `const DOORS_OPEN = "/setup/doors/open"`. One constant is the region's `to` and the path the join asks about, and each fails to compile when it names no state.
- **The join is asked after the regions.** A region's own `always` rules run before the parallel state's rule, so its `when` sees each region where it came to rest.
- **The active states already hold the answer.** A counter in the context, raised by each region as it finishes, repeats what `matches` reads and has to be reset on every entry.

### A group inside a sequence

A [`sequence`](#scripted-sequences) waits on a group through a promise around `wait`:

```ts excerpt
task: sequence(async (ctx, signal) => {
  const group = waitGroup();
  http.request(ctx.url, "GET", group.add());
  go.animate(ctx.logo, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 0.5, 0, group.add());
  await new Promise<void>((resolve) => group.wait(() => resolve()));
  if (signal.aborted) return;
  msg.post(ctx.logo, "disable");
  return { type: "READY" };
}),
```

- **Leaving `/booting` does not cancel that promise.** It resolves when the last piece reports, so the `signal.aborted` check returns before the logo is hidden for a state that is no longer active.
- **`wait` takes an arrow function that calls `resolve`.** `group.wait(resolve)` passes the type check and fails the build with `Unable to convert function with a 'this' parameter to function 'callback' with no 'this'`.

## Define a machine in a plain module

Put each machine definition in a plain module, a file with no `defineScript` export. A plain module compiles to `.lua`, which any script can `require`; a file that exports a `defineScript` factory compiles to a `.ts.script` component, which other files cannot import. The door's script [below](#one-instance-per-object-on-self) imports `doorMachine` and its [message mapper](#the-message-bridge) `doorEvents` from `./door-machine`.

## One instance per object, on `self`

`start(ctx)` creates an independent instance from the definition. Create it in `init` so it lands on `self`, one per game object, then tick it from `update(dt)` and stop it in `final`:

```ts excerpt
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

- `self.door.matches("/open")`, `self.door.path` and `self.door.ctx` read the current state from any callback.
- A machine sees only its `ctx` and its events, never `self`, so script data a hook needs goes into `ctx` at `start`.
- A module-level instance, `const door = doorMachine.start(...)` at the top of a script file, is shared by every object that runs the script; see [Where script state lives](./script-state.md).
- Here `self` takes its type from what `init` returns. For a named `Self` type, a `properties` block, or a machine that starts later, see [Type `self`](#type-self).

### Ask whether an event would be taken

`can(event)` answers whether a rule of some active state would take the event if it were sent now. Use it for a button that should look disabled, or in a script that picks between two events. Pass the event as `send` would get it, payload included: this enemy's only `HIT` rule moves to `/dead` when `ctx.health <= event.damage`, so two hits get different answers.

```ts excerpt
const e = enemy.start({ health: 3 });
e.can({ type: "HIT", damage: 3 }); // true: this hit is fatal
e.can({ type: "HIT", damage: 1 }); // false: the only rule's `when` fails
// @ts-expect-error a HIT carries its damage
e.can({ type: "HIT" });
```

- **It checks `when`.** A rule counts when its `when` is missing or passes.
- **A rule with no `to` counts.** `can` asks whether a rule would take the event, not whether the state would change.
- **Nothing runs.** No hook, `unhandled` included, no `run` and no `onMove` or `onUnhandled` listener is called, and the event is not queued.
- **Inside a hook it answers for the states active at that moment.** A state's `enter` hook already counts that state. A stopped machine answers `false`.
- **A `when` cannot call it.** The view a `when` receives has no `can`.

### Listen for unhandled events

`onUnhandled(listener)` calls the listener with each event no rule took, for logging or a tool. A reaction the machine owns is an [`unhandled` hook](#react-to-an-unhandled-event) instead. This door's `closed` state has a rule for `OPEN` and the empty rule `KNOCK: {}`:

```ts excerpt
const off = m.onUnhandled((event) => {
  print(`door ignored ${event.type} in ${m.path}`);
});

m.send({ type: "CLOSE" }); // prints: door ignored CLOSE in /closed
m.send({ type: "KNOCK" }); // nothing: the empty rule takes KNOCK
```

- **It reports the events [`can`](#ask-whether-an-event-would-be-taken) answers `false` for.** An event whose every `when` fails is one of them, and an event an empty rule takes is not.
- **A `send` from a hook, a `run` or a `finish` counts.** The listener hears every event the machine processes, not only the ones a script sends.
- **The listener runs inside the step,** after the states' `unhandled` hooks. `path` and `leaves` show the states the event found.
- **A stopped machine reports nothing:** not a `send` after `stop()`, not an event still queued when `stop()` ends the step, not a late `finish`.
- **Each call adds a listener.** The function it returns, `off` above, removes it.

### Restart a machine

A stopped instance does not start again. To restart, stop the instance, start a new one from the same definition, and store it where the old one was: `self.door.stop()`, then `self.door = startDoor()`, where `startDoor` is the function `init` calls too. The cheat sheet has [the snippet](#configure-a-state).

- **`start` enters `initial` with the context it is given:** a new object for a clean start, or the old instance's `ctx` to keep its fields. To enter other states, pass [saved paths](#start-at-saved-paths).
- **Restart from a script callback, not from a hook.** Inside a hook, `stop()` waits for the step to end, so a `start` on the next line runs the new instance's `enter` hooks before the old instance's `exit` hooks.
- **Listeners stay with the old instance.** Call `onMove`, `onUnhandled` and [`inspect`](#debug-a-machine) again on the new one.
- **`on_reload` suits a restart;** see [Restart on a hot reload](#restart-on-a-hot-reload).
- **To restart one state and keep the instance,** [name the state as its own target](#events-and-transitions).

## Several machines

Parts of one object that each have a state are compound or [parallel](#run-regions-side-by-side-with-parallel) states of one machine. A second machine is for a second thing: another game object, or something that has a life of its own. An instance is a plain object that fits in a context or on `self`, so the library has no spawn call and no parent or child helper. How the two machines relate picks the recipe:

| The machines | Recipe |
| --- | --- |
| On separate game objects | Each script runs its own machine, and they post messages; see [Separate objects talk with messages](#separate-objects-talk-with-messages) |
| Two in one script, where one reads the other | The reader holds the other instance in its context; see [Two machines in one script](#two-machines-in-one-script) |
| One that exists only while a state of another is active | The state's `task` starts it and the cleanup stops it; see [A machine that lives during one state](#a-machine-that-lives-during-one-state) |

### Separate objects talk with messages

Machines on separate game objects never hold each other. Each script runs its own machine, and the two talk the way any two scripts do, with `msg.post`. A boss wakes its minions from the `enter` hook of `/shielded`, which runs inside `start`, and drops its shield once the last one is down:

```ts excerpt
enter: (ctx) => {
  for (const minion of ctx.minions) {
    msg.post(minion, "minion_wake");
  }
},
```

A minion answers `event.sender`, the boss's script, and keeps that url:

```ts excerpt
minion_wake: {
  to: "/awake",
  run: (ctx, event) => {
    ctx.owner = event.sender;
    msg.post(event.sender, "minion_ready");
  },
},
```

- **A minion out of `hp` tells its owner.** The `enter` hook of `/down` posts `minion_down` to `ctx.owner`.
- **The boss counts.** `minion_ready` adds one to `ctx.alive`, and `minion_down` takes one off or, for the last minion, moves to `/exposed`.
- **Neither module imports the other.** The boss knows its minions by the ids its script got from `factory.create` and passed to `start`, and a minion knows its owner by the sender of the message that woke it, so the same minion serves any object that wakes it.
- **`CustomMessages` is global.** The three messages are declared once, in the boss's module, and both modules see them; see [The message bridge](#the-message-bridge).
- **The minion's script has the shape of [the door's](#one-instance-per-object-on-self),** and sends `HIT` itself when something hurts the minion.

### Two machines in one script

Two machines in one script are two instances on `self`. When a rule of one depends on the state of the other, the first holds the second in its context and asks it in a `when`. A hero whose context holds `round`, typed `ReturnType<typeof roundMachine.start>`, jumps only while the round is being played:

```ts excerpt
JUMP: { to: "/airborne", when: (ctx) => ctx.round.matches("/playing") },
```

The script starts the round first, because the hero's context needs it:

```ts excerpt
init() {
  const round = roundMachine.start({});
  return { round, hero: heroMachine.start({ round }) };
},
update(self, dt) {
  self.round.update(dt);
  self.hero.update(dt);
},
final(self) {
  self.hero.stop();
  self.round.stop();
},
```

- **Tick the machine that is read first.** `update` ticks the round, then the hero, so a rule of the hero sees where the round is in this frame.
- **Stop them in the opposite order.** `final` stops the hero while the round it reads is still running.
- **A mistyped path fails to compile.** The type of `round` carries the round's paths, so `ctx.round.matches("/playng")` is an error where it is written.

### A machine that lives during one state

A machine that exists only while one state of another is active is started in that state's [`task`](#engine-callbacks-task-and-finish) and stopped in the cleanup the `task` returns. A brawler counts a combo while it fights. The combo is a machine of its own: every hit gives it one more second, and it ends when a second passes with no hit.

```ts excerpt
task: (ctx, finish) => {
  const combo = comboMachine.start({
    hits: 0,
    done: (hits) => finish({ type: "COMBO_ENDED", hits }),
  });
  ctx.combo = combo;
  return () => {
    combo.stop();
    ctx.combo = undefined;
  };
},
update: (ctx, dt) => {
  ctx.combo?.update(dt);
  return undefined;
},
```

1. **Start in the `task`.** Every entry of `/fighting` starts a new combo and keeps it in `ctx.combo`.
2. **Tick in `update`.** The hook passes its `dt` on, because [a machine nobody ticks is frozen](#update-and-after).
3. **Send from a rule.** `PUNCH: { run: (ctx) => ctx.combo?.send({ type: "HIT" }) }` has no `to`: the brawler stays where it is and the combo gets a `HIT`, whose rule [names its own state](#events-and-transitions) to start the second over.
4. **Report through a callback.** The combo's last state calls `ctx.done`, which calls the `finish` of the brawler's `task`. The brawler takes `COMBO_ENDED` once its own step has ended.
5. **Stop in the cleanup,** which [runs on every way out](#cleanup-runs-on-exit-never-after-an-await) of `/fighting`, so no combo outlives the fight.

The callback sits in the combo's context because [a machine sees only its context and its events](#one-instance-per-object-on-self). The combo knows nothing about the brawler, and any machine can start one.

## Hot reload

Hot reload lets you edit a machine while the game runs and see the change without restarting. Give `defineMachine` a key, a name for this definition, as in `defineMachine<EnemyCtx, EnemyEvent>("enemy")`.

When [`watch --hot-reload`](./watch.md#hot-reload) or [`reload`](./reload.md) pushes an edit, Defold runs the changed file again, and every script that already imported it keeps the first copy. With a key, `defineMachine` finds the machine it built the first time, in a table the `hsm` library keeps across reloads, and puts the new states into that same object, so every running instance sees the edit. Without a key the edited call builds a new machine that no script holds, and the instances already running keep the old states until you restart.

Call a keyed `defineMachine` once, at the top level of a module, so it runs once each time the file loads. Inside `init` it runs once per object: each new enemy redefines `"enemy"`, every enemy already alive switches to that definition, and values its hooks took from that `init` replace everyone's.

### What happens after a reload

1. The file runs again, and `defineMachine("enemy")` puts the new states into the existing machine. If the new config has a mistake, it throws and the old states stay in use.
2. The running instances do not change yet: `path` still reads the old state, and `can` still answers from the old rules.
3. On its next `send` or `update`, each instance sees the new definition and switches to it. Because `update` runs every frame, that is the next frame. The script needs no `on_reload` for this.

### What each instance keeps

An instance always keeps its `ctx`. What happens to its current state depends on the edit:

| After the edit, the current state… | The instance… |
| --- | --- |
| still exists | stays in it and runs no `enter` or `exit` hook. The edited rules, `when` checks and hooks apply from now on. |
| still exists, but now has child states | enters its `initial` child, and that child's `initial`, and so on, running their `enter` hooks. |
| was removed | moves to the closest parent state that still exists and enters that parent's `initial` chain, running those `enter` hooks. The removed states run no `exit` hook, because their code is gone, but a cleanup their `task` returned still runs, deepest state first. |
| is a [parallel](#run-regions-side-by-side-with-parallel) state that gained a region | keeps its other regions as they are and enters only the new one. |
| was a parallel state and is now compound | keeps its first region in name order and drops the others like removed states. |

- **A state that stays keeps its clock,** and which of its timers fired: by entry for a list that holds a delay function, so each mark stays on its own timer when the delays read differently after the reload, and by position in delay order for every other form. The delay functions of its timers and `every` entries are read again, and each [`every` entry](#repeat-while-a-state-is-active) next runs at the first multiple of its delay above that clock.
- **States are matched by path,** so renaming `chase` to `hunt` counts as removing `/chase`.
- **A state with [`restoreDepth`](#resume-with-history) keeps its remembered children the same way.** If the edit removed a remembered child, the next entry uses `initial` at that level.
- **A change of state is reported.** `onMove` listeners get the move with the cause `"reload"`, and the [debug inspector](#debug-a-machine) prints it.
- **The key names the definition, not an object.** Twenty enemies that start `enemyMachine` in `init` are twenty instances of one machine: a reload changes the machine once, and each instance switches on its own next `update`, following the table for its own state.
- **Different machines need different keys.** If doors also used `"enemy"`, each reload of one file would replace the other machine's states.

### Restart on a hot reload

A reload keeps each instance in its current state when that state still exists, so an edited `enter` hook waits for the next entry and the instance keeps the `ctx` it started with. To start over instead, [restart the machine](#restart-a-machine) in the script's `on_reload`. The two work side by side, and which one runs depends on the file you edit:

| You edit | What runs | The instance… |
| --- | --- | --- |
| the machine's module, defined with a key | the switch [described above](#what-happens-after-a-reload), on the next `send` or `update` | stays in its state with its `ctx`, under the new rules. |
| the machine's module, defined without a key | nothing | keeps the old states, and so does an instance a later restart starts. |
| the script file, with a restart in `on_reload` | `stop()`, then `start` | is replaced by a new one at `initial`, with the context the script builds. |

- **A restart starts the newest definition.** With a key, `start` uses the states the definition holds when it is called.
- **Editing only the machine's module restarts nothing.** Defold calls `on_reload` only on a script whose own file was reloaded, and a reload does not run `init` again.
- **Every object that runs the script restarts.** `on_reload` runs once per object, so 20 enemies all go back to `initial`.
- **Build the starting context in the script file.** A reloaded script still gets the first copy of every module it imports, so a context factory exported from the machine's module stays the old one.

## Save and load

A saved game resumes each object in the state it was in: an opened chest stays open. Where the fact lives picks the way: in data the game already saves, or only in the machine's current state.

### Route from saved data

When the saved data tells the state, such as a flag or a count, start the machine as usual and let an [`always`](#move-on-at-once-with-always) list on its first state pick where to go:

```ts excerpt
restore: {
  always: [{ to: "/open", when: (ctx) => ctx.opened }, { to: "/closed" }],
},
```

The `enter` hook of `open` sets `ctx.opened`, and the game saves it with the rest of its data and passes it back in the context.

### Start at saved paths

When the state itself is the fact, as for a door, a chest or a switch, save the active paths and start the machine at them. This chest plays its animation when `open` is entered:

```ts excerpt
open: {
  enter: (ctx) => {
    sprite.play_flipbook(ctx.sprite, "open");
  },
},
```

`start` takes a list of state paths as its second argument. The script loads the list in `init` and saves `leaves` in `final`:

```ts excerpt
init() {
  const save = sys.load(SAVE_FILE) as ChestSave;
  return { chest: chestMachine.start({ sprite: msg.url("#sprite") }, save.at) };
},
final(self) {
  sys.save(SAVE_FILE, { at: self.chest.leaves });
  self.chest.stop();
},
```

`ChestSave` types `at` as an optional list of the machine's paths. `sys.load` returns an empty table when there is no save yet, so `save.at` is `undefined` and the chest starts at `initial`.

- **The entry is an ordinary one.** `privateCtx` runs, `enter` hooks run outermost first, tasks start, delay functions are read and `always` rules are checked. The opened chest plays its animation because its `enter` runs.
- **A path may name a state with children.** Below it the entry goes through `initial`, as does a level or region no path names.
- **A path the machine lacks falls back to its closest parent that exists,** as [a hot reload treats a removed state](#what-each-instance-keeps). A save made before an edit still loads.
- **Of two paths that cannot be active together, the first in the list wins.**
- **Only the active states are part of a start position.** Every clock starts at zero, no state remembers a child for `restoreDepth`, and a `task` starts again. The context is the game's own table to save.
- **`leaves` is the same array on every read, updated in place.** `sys.save` writes it at the call, and a table kept for later takes a copy, `[...self.chest.leaves]`.

## Private fields with `privateCtx`

Some of a machine's data belongs to the machine alone: a counter, a heat level, a list it builds up. The root config takes one optional key for such fields: `privateCtx`, a function that returns them. Every hook, `when`, `run`, `task` and `update` sees the fields beside `Ctx`, while `start` takes `Ctx` alone and the instance it returns shows `Ctx` alone in its `ctx`.

**Inferred.** For a few fields, write them inline and let TypeScript infer their types:

```ts excerpt
privateCtx: () => ({ heat: 0, targets: [] as Hash[] }),
```

Add `as` where the inferred type is wrong: an empty array is `never[]` until it reads `[] as Hash[]`, and a field holding one of several strings is any `string` until it reads `"cool" as "cool" | "hot"`.

**A named type.** For more fields, or when a helper outside the config needs the whole context, declare the fields as an interface and make it the factory's return type:

```ts excerpt
privateCtx: (): TurretPrivate => ({ heat: 0, mode: "cool" }),
```

The fields need no `as`, a misspelled or unknown field is a compile error, and a helper types the whole context as `TurretOptions & TurretPrivate`.

> [!WARNING] `satisfies TurretPrivate` does not do the same job. It checks the object but keeps its narrow types, so an empty array stays `never[]` and nothing can be pushed to it:
>
> ```ts excerpt
> privateCtx: () => ({ heat: 0, targets: [] }) satisfies TurretPrivate,
> ```

**From the starting context.** The factory receives the object passed to `start`, so a private field can start from a field of `Ctx`:

```ts excerpt
privateCtx: (ctx: TurretOptions) => ({ heat: ctx.startHeat }),
```

- **It runs once per `start`, before the root's `enter` hook,** so the fields are there when the first hook runs.
- **Every instance gets fresh fields of its own.** A value written straight into the config would be one array or table shared by every instance.
- **It receives the object passed to `start`,** typed `Ctx`, and adds the fields to that object, which stays the instance's `ctx`. A factory that reads `ctx` gives it a type: write `(ctx: TurretOptions) => ...`, not `(ctx) => ...`: without the type, TypeScript can type a hook or a `sequence` task before it knows the private fields, and that hook reports the field as missing.
- **A restart builds them fresh.** `start(old.ctx)` keeps the public fields and builds the private ones again; see [Restart a machine](#restart-a-machine).
- **A hot reload adds fields and keeps values.** A reload under the machine's key adds the fields a new `privateCtx` introduces and leaves every field that already holds a value alone.
- **A private field may not share a name with a field of `Ctx`.** Such a config fails to compile.
- **The fields are hidden by type only.** At run time `ctx` is one table, and hooks, [`hsm-view`](./hsm-view.md) and a debugger see every field.

## Performance

The budget is 200 game objects, each running its own instance of one three-level machine, for under 0.5 ms of `update` and `send` per frame in the stock engine, with neither call building a table. A bench in the repository measures it: every enemy ticks its machine each frame through `after` timers and an `update` hook and sends one event every 20 frames, over 300 frames that sample the heap around each call and 300 that time each call.

| Avg ms per frame | Worst frame ms | Allocating calls (update / send) | Heap KB (update / send) | Engine | System | Date |
| --- | --- | --- | --- | --- | --- | --- |
| 0.05 | 0.10 | 3 of 60,000 / 6 of 3,000 | 2.2 / 7.0 | 1.13.2 | macOS, arm64 | 2026-10-03 |

The few allocating calls are the Lua VM's own one-time work the first time a path runs (a JIT trace, a deeper call stack), not the machine. Reproduce it from a clone of the repository with Java and a display:

```sh
bun run --cwd packages/api-probe bench:hsm
```

`update` and `send` build nothing, but the event you pass is a table: an event literal written at the `send` call builds a new one on every call, and so does `toEvent` from the [message bridge](#the-message-bridge). On a hot path, hoist a constant event to the top of the module and send that:

```ts excerpt
const SPOT = { type: "SPOT" } as const;

const m = guard.start({ seen: 0 });
m.send(SPOT); // the same table on every call
m.send({ type: "LOSE" }); // a new table on every call
```

## Types

- **`defineMachine` takes two calls.** `defineMachine<Ctx, E>()` fixes the context and event types and takes the optional [hot reload](#hot-reload) key. The second call takes the config, which has to be inferred: its literal shape is where the state paths come from.
- **Events are objects with a string `type`,** plus any payload fields. `on` accepts only the `type` values of `E` as keys, and each `when` and `run` sees the variant its key names.
- **Tags are the third type argument;** see [Name a group of states with tags](#name-a-group-of-states-with-tags).
- **`start` returns a `MachineInstance<Ctx, E, P, Tag>`,** where `P` is the union of the machine's state paths. `path` can be `undefined`, so a lookup table keyed by path is indexed only after a check. Name the type with `ReturnType<typeof doorMachine.start>`; see [Read types off the machine](#read-types-off-the-machine).
- **The second argument of `start` is `readonly P[]`,** so a copy of `leaves` fits, and a list loaded as `string[]` takes a cast where it is loaded; see [Start at saved paths](#start-at-saved-paths).
- **`MessageEvent<K>` and `messageEvents`** turn Defold messages into machine events; see [The message bridge](#the-message-bridge).

**A `when` reads its arguments.** `ctx` is `Readonly<Ctx>` in every `when`, under `on`, `always` and `after`, and in a `delay` function of `after` and `every`, so the write [a `when` must not make](#events-and-transitions) fails to compile:

```ts excerpt
when: (ctx, event) => {
  // @ts-expect-error -- a `when` cannot assign to a field of `ctx`
  ctx.health -= event.damage;
  return ctx.health <= event.damage;
},
```

- The event is read-only in a `when`, a `run`, the `unhandled` hook and the `onMove` and `onUnhandled` listeners, so an event kept in a constant is the same on every `send`.
- The check is one level deep: a list or table held in a field can still be changed.
- A helper declared outside the config with ordinary parameter types still fits, and its own writes are not checked. The one exception is a helper typed with a context class that has a private or protected member: its parameter takes `Readonly<...>` of the class, as in `(ctx: Readonly<Tank>) => ctx.hp > 0`.

**A bad path is an error where it is written.** An `initial`, a target (`on`, `to`, `after`, `always`) and the path an `update` hook returns accept only the machine's full paths, and an `on` key accepts only an event type. A typo, a bare name such as `"idle"` included, fails to compile on that property, and the editor suggests the paths and event types as you type:

```ts excerpt
// @ts-expect-error -- "/nowhere" is not one of the machine's paths
GO: "/nowhere",
```

**A callback's `machine` knows the machine's paths.** In a hook, a `when`, a `run` and a `task`, `path`, `leaves` and `matches()` take the machine's paths, and so does `onMove` on the `machine` of a hook, a `run` and a `task`. A variable typed `string` does not fit `matches()` there: give it a union of the paths it can hold, such as `"/off" | "/on"`.

Some paths that name no state still compile:

- **Below a leaf.** A path below a state with no children, such as `"/idle/deeper"`, compiles, and so do `initial` and `restoreDepth` on a leaf. Each one throws when the machine is defined, except in `matches()`, where the path never matches.
- **A hook declared outside the config.** An `update` hook returns one of the machine's paths or `undefined`; a plain `string` does not compile. TypeScript widens a function's single returned path to `string`, so such a hook needs `as const`: `const land = () => "/grounded" as const`.
- **A level of callbacks only.** When every state at one `states` level holds nothing but callbacks with unannotated parameters, its targets are still checked, but the editor does not suggest its children, and `matches()` in a callback accepts any path below that level's parent. Annotate the parameters of one callback in that level, as in `enter: (ctx: LampCtx) => { ... }`, and `matches()` checks the level's states.

**`StatePath<C>` lists a config's paths,** each with its leading `/`. Paths are spelled out four levels deep; below that, any string under a fourth-level path is accepted. Here `game` is a config object written `as const`:

```ts excerpt
// "/menu" | "/playing" | "/playing/running" | "/playing/paused"
type GamePath = StatePath<typeof game>;

const resume: GamePath = "/playing/running";
// @ts-expect-error -- "/playing/over" is not one of the paths
const over: GamePath = "/playing/over";
// @ts-expect-error -- a path without the leading "/" is not a path
const bare: GamePath = "playing";
```

### The message bridge

Defold delivers a message as a hashed `message_id`, a payload table and the sender's URL. `messageEvents(ids)` turns the ones you list into typed events `{ type: id, ...payload, sender }`.

- The payload types are the ones already declared through `BuiltinMessages` and `CustomMessages`, so a payload is declared once.
- `MessageEvent<K>` is that event's type, for the machine's event union, and carries `sender: Url`.
- `toEvent(message_id, message, sender)` takes the `on_message` parameters of both `defineScript` and `defineGuiScript` and returns `undefined` for any id you did not list.
- A payload field named `type` or `sender` never overrides the event's own.
- Build the mapper once at module scope: it hashes the ids when it is created.

A `when` or `run` reads `event.sender` to answer whoever sent the message. This lift takes `MessageEvent<"call_lift">`:

```ts excerpt
call_lift: {
  run: (ctx, event) => {
    ctx.floor = event.floor;
    msg.post(event.sender, "lift_arrived", { floor: ctx.floor });
  },
},
```

A script that already dispatches with `onMessage` (see [Messages](./messages.md)) has narrowed payloads in hand and can `send` them directly, with no mapper. An event built by hand for a `MessageEvent` union includes `sender`, which the `onMessage` handler receives. For two objects whose machines message each other, see [Separate objects talk with messages](#separate-objects-talk-with-messages).

### Events from an addon

An addon that sends messages to your script needs no adapter. Declare its messages once in `CustomMessages`, then list the ones the machine handles in `messageEvents`. This works when the addon builds each id as `hash("<name>")` for the name you declare, so check the addon's source for how it makes its ids.

[Monarch](/api/monarch.monarch) tells every script registered with `monarch.add_listener` when a screen starts or finishes showing or hiding, and when it fails to show. Its `SCREEN_TRANSITION_*` constants are `hash("monarch_screen_transition_in_started")` and so on, so the five messages are declared by those names, beside one of the game's own:

```ts excerpt
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
```

- `previous_screen` is `undefined` when the stack was empty, and `next_screen` on a `back` past the first screen.
- Register the script with `monarch.add_listener()` in `init` and remove it with `monarch.remove_listener()` in `final`.
- One mapper covers Monarch's messages and your own.
- Collection proxies need no adapter: `proxy_loaded`, `proxy_ready`, `proxy_error` and `proxy_unloaded` are Defold messages, so list them in `messageEvents`.

## Debug a machine

To run a machine away from the game, with its source on screen and its active states highlighted, open its file with [`hsm-view`](./hsm-view.md).

`inspect(instance, label)` from `@defold-typescript/types/hsm/debug` logs every move a machine makes and draws its current path over a game object. Call it once after `start`, keep the inspector it returns on `self`, and call its `draw` from `update`:

```ts excerpt
init() {
  const door = doorMachine.start({ sprite: msg.url("#sprite"), opens: 0 });
  return { door, inspector: inspect(door, "door") };
},
update(self, dt) {
  self.door.update(dt);
  self.inspector.draw(".");
},
```

`inspect` prints one line when it is called, then one line for each move and one for an event no active state took:

```text
hsm door frame 0: inspecting [/closed]
hsm door frame 120: /closed -> /opening (trigger_response: /closed, 0) [/opening]
hsm door frame 150: /opening -> /open (OPENED: /opening, 0) [/open]
hsm door frame 200: unhandled (trigger_response) [/open]
hsm door frame 330: /open -> /closed (after: /open, 3) [/closed]
```

| Part of a line | Meaning |
| --- | --- |
| `frame 120` | Counts `draw` calls, so it tracks `update` when you draw every frame. |
| `/closed -> /opening` | The old and new leaf paths. After `stop()` the new path reads `(stopped)`. |
| `(trigger_response: /closed, 0)` | The event's `type`, or the cause when no event moved the machine: `after`, `update`, `always`, `stop` or `reload`. Then the path of the state whose rule made the move, empty for the root, and that rule's key. |
| `[/opening]` | Every active leaf after the move, joined by `, `, so a parallel machine's line names each region's leaf. Empty after `stop()`. |

- **The rule's key** is the entry's index in an `on` or `always` list (`0` for a single rule), the delay of an `after` record entry, or the index of an `after` list entry. An `update` move names the state alone; `stop` and `reload` name neither.
- **An `unhandled` line** carries the event's `type` and the active leaves. It prints once per type until the machine's next move, so an event sent every frame does not flood the console.
- **A label already used by another `inspect` call** gets the next ordinal no other call has used, `enemy#2`, `enemy#3`, in both the console lines and the drawn text.
- **Names are escaped in a console line.** A backslash escapes each `\`, `[`, `]`, `(`, `)`, `,`, `>` and `:` inside the label, a path or the event's `type`, and a line break reads `\n` (a carriage return `\r`), so every line splits back into the same parts. The drawn text shows the names as they are.
- **`draw(target)`** posts `draw_debug_text` to `@render:` with the label and the active leaves joined by `, `, 40 units above the target's world position.
- **In a release build,** where `sys.get_engine_info().is_debug` is `false`, `inspect` registers nothing and `draw` does nothing, so the calls can stay in shipped code.

`inspect` is built on `onMove(listener)` and [`onUnhandled(listener)`](#listen-for-unhandled-events), which every instance has. The `onMove` listener receives the old leaf path, the new one (`undefined` after `stop()`), the cause and the event (`undefined` unless the cause is `event`), after the move's `enter` hooks have run. It is not called for the first entry at `start` or for a rule with no `to`. Each call adds a listener and returns a function that removes it.

## Animation states with one-shots

A character has three kinds of animation:

| Kind | Example | Rule |
| --- | --- | --- |
| Looping | idle, run | Can be left at any time. |
| One-shot | jump | Must finish before the next animation starts. |
| In-between | crouching down, standing up | Plays on the way from one posture to the other and must not be skipped. |

Defold's [Finite State Machines](https://defold.com/examples/animation/animation_states/) example drives a knight this way with a table of legal transitions and a path search. Here the tree does that job: the only rules that leave one posture lead to its in-between state, so that animation cannot be skipped. A one-shot is a `task`, and ends in a `pick` state that decides what comes next:

```ts excerpt
jump: {
  enter: noJump,
  task: once("jump"),
  on: { DONE: "/standing/pick" },
},
pick: {
  always: [
    { to: "/to_crouch", when: (ctx) => ctx.crouch },
    { to: "/standing/jump", when: (ctx) => ctx.jump },
    { to: "/standing/free/run", when: (ctx) => ctx.run },
    { to: "/standing/free/idle" },
  ],
},
```

The script writes what the player wants into `knight.ctx.run` and `knight.ctx.crouch`, then sends `INTENT`, and sends `JUMP` when the jump key is pressed. The machine decides when to act on it:

- **A looping state plays on `enter`,** as in `enter: loop("idle")`, where `loop` returns a hook that calls `sprite.play_flipbook`. It can be left at any time, so it needs no `task`.
- **A one-shot is a [`task`](#engine-callbacks-task-and-finish).** `once("jump")` returns a `task` that plays the flipbook and calls `finish` from its completion callback; the state has no `INTENT` rule, so a new request waits in the context. Set the flipbook's playback to Once Forward in the atlas: a looping flipbook never completes, so its callback never runs.
- **An in-between state is the only way across.** No rule leads from a standing state to a crouching one, so `to_crouch` always plays, whatever was asked for. A new posture adds its in-between state and the rules that lead to it.
- **`pick` settles on the latest request.** Each one-shot ends in a `pick` state, whose [`always`](#move-on-at-once-with-always) rules read the context and choose, in order: the other posture, a waiting jump, run, idle.
- **A trigger during a one-shot is kept.** `JUMP` on `standing` and on `to_standing` has a `run` and no `to`: it sets `ctx.jump` and the state stays. The looping states take `JUMP` first, so a jump from one of them starts at once, and `crouching` has no `JUMP` rule, so the knight cannot jump while crouched. `jump` and `to_crouch` clear `ctx.jump` on `enter`, so a kept jump plays once and crouching down drops it.
- **An unchanged request restarts nothing.** When no rule's `when` passes, the event is dropped and the flipbook keeps playing, so the script can send `INTENT` on every input.

## Migrate a script

The [platformer example](https://github.com/defold-typescript/toolchain/tree/main/docs/examples/platformer) moved its player onto one machine, and [`src/player-machine.ts`](https://github.com/defold-typescript/toolchain/blob/main/docs/examples/platformer/src/player-machine.ts) is the whole of it. Before, the player's state lived in flags that every frame re-read to pick an animation, and the jump checked a flag of its own:

```ts excerpt
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
```

After, those branches are states, and each state plays its animation once in `enter`:

```ts excerpt
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
```

- **The state itself is the check.** `JUMP` is a rule of their parent `grounded` alone, with a `run` that sets the takeoff speed, so no flag guards the jump.
- **The script keeps the physics and hands the rest to the machine.** `fixed_update` calls `self.motion.update(dt)` while the contacts from the last physics step still hold, and `on_input` sends `JUMP` and `JUMP_RELEASED`.
- **A leaf's `update` hook checks what its parent checks.** `grounded` leaves for `/airborne` when `ground_contact` is lost, but [`update` hooks run deepest first](#update-and-after), so `idle` and `walk` check `ground_contact` too. Without it, a leaf whose velocity check fires on the step the ground disappears would move to its sibling, and the player would stay grounded for that step.
- **Give the machine an object, not `self`.** `init`'s return value is copied onto the engine-owned `self`, so a context built from loose fields in `init` would keep stale copies of them. The player's `init` builds one `body` object, starts the machine on it and returns `{ body, motion }`; every hook then reads and writes `self.body`, the same object the machine sees.
- **A state is as fresh as its last update.** `grounded` reflects the contacts seen by the last `fixed_update`, while the old check read `ground_contact` after the physics step that followed it. So the player can now jump on the one physics step after walking off a ledge, a single step of leniency the example accepts.

## Cheat sheet

Short answers to common tasks. Each snippet is an excerpt of a guard machine: one with `health` that patrols, goes on alert, takes hits and dies, or a variant of it written for that row.

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

Ask whether any of several states is active

</td><td>

`tags` on those states and `hasTag` in a `when`; see [Name a group of states with tags](#name-a-group-of-states-with-tags)

</td><td>

```ts excerpt
when: (_ctx, _event, machine) =>
  machine.hasTag("alert"),
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

Run code at a set time without leaving the state

</td><td>

A [rule in `after`](#rules-on-a-timer) with a `run` and no `to`; a `when` makes a timer wait for a condition

</td><td>

```ts excerpt
after: {
  2: {
    run: (ctx) =>
      msg.post(ctx.sprite, "shout"),
  },
  5: {
    to: "/patrol",
    when: (ctx) => ctx.calm,
  },
}
```

</td></tr>
<tr><td>

Repeat an action while a state is active

</td><td>

[`every`](#repeat-while-a-state-is-active), keyed by seconds on the state's clock; the list form reads the delay from the context

</td><td>

```ts excerpt
every: [
  {
    delay: (ctx) => ctx.scanEvery,
    run: (ctx) =>
      msg.post(ctx.sprite, "scan"),
  },
]
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

Wait for several engine callbacks

</td><td>

A [`waitGroup`](#waitgroup) in a `task`: one `add()` per callback, and `wait` calls `finish`; see [Work that completes](#work-that-completes)

</td><td>

```ts excerpt
task: (ctx, finish) => {
  const group = waitGroup();
  sprite.play_flipbook(
    ctx.sprite,
    "rise",
    group.add(),
  );
  sound.play("#yawn", {}, group.add());
  group.wait(() => finish({ type: "AWAKE" }));
}
```

</td></tr>
<tr><td>

Move on when every region has finished

</td><td>

[`always`](#move-on-at-once-with-always) on the parallel state, with a `when` that asks `matches` for the last state of each region; see [Regions with states of their own](#regions-with-states-of-their-own)

</td><td>

```ts excerpt
always: {
  to: "/fight",
  when: (_ctx, machine) =>
    machine.matches(SWORD_OUT) &&
    machine.matches(BACKUP_CALLED),
}
```

</td></tr>
<tr><td>

Run a second machine while a state is active

</td><td>

Start it in the state's [`task`](#engine-callbacks-task-and-finish), tick it from `update` and stop it in the cleanup; see [A machine that lives during one state](#a-machine-that-lives-during-one-state)

</td><td>

```ts excerpt
task: (ctx, finish) => {
  const duel = duelMachine.start({
    done: () => finish({ type: "DUEL_OVER" }),
  });
  ctx.duel = duel;
  return () => {
    duel.stop();
    ctx.duel = undefined;
  };
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

Resume a saved game in the state it was in

</td><td>

Pass the saved `leaves` as the second argument of `start`; see [Start at saved paths](#start-at-saved-paths)

</td><td>

```ts excerpt
guardMachine.start(ctx, save.at)
```

</td></tr>
<tr><td>

Know whether an event would do anything

</td><td>

`can` on the instance, which moves nothing; see [Ask whether an event would be taken](#ask-whether-an-event-would-be-taken)

</td><td>

```ts excerpt
guard.can({ type: "PAUSE" })
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

React to any event no state took

</td><td>

[`unhandled`](#react-to-an-unhandled-event) on a state or the root: one hook for every event type, and the event stays unhandled. One named event is a rule with no `to`; see the row [React to an event and stay in the state](#configure-a-state)

</td><td>

```ts excerpt
unhandled: () => sound.play("#blocked"),
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
<tr><td>

Keep fields only the machine uses

</td><td>

[`privateCtx`](#private-fields-with-privatectx) on the root config

</td><td>

```ts excerpt
privateCtx: (): GuardPrivate => ({
  hits: 0,
  seen: [],
}),
```

</td></tr>
</tbody>
</table>
</div>

### Read types off the machine

Every type comes from the exported machine, so nothing is declared twice; see [Types](#types). `import type` is enough for these. The one type the machine does not give back is that of its [private fields](#private-fields-with-privatectx), which is declared once, beside the machine.

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

Name the whole context a private machine's hooks see

</td><td>

Intersect the context type with the private fields' type; `ctx` on the instance names the public part alone

</td><td>

```ts excerpt
const beaten = (
  ctx: GuardOptions & GuardPrivate,
) => ctx.hits >= ctx.health;
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

Type the parameter `MachineInstance<Ctx, E>`: a started instance and a callback's `machine` both fit

</td><td>

```ts excerpt
function hurt(
  guard: MachineInstance<GuardCtx, GuardEvent>,
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

Set a timer's delay from a property

</td><td>

Pass the property to `start` and read it in a list-form `delay`; see [A delay that reads the context](#a-delay-that-reads-the-context). The machine keeps its hot reload key, and the instance type is `ReturnType<typeof guardMachine.start>`

</td><td>

```ts excerpt
patrol: {
  after: [
    { delay: (ctx) => ctx.patrolFor, to: "/rest" },
  ],
},
```

```ts excerpt
init(self): Self {
  return {
    guard: guardMachine.start({
      health: 3,
      patrolFor: self.patrol_for,
    }),
  };
},
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
| `tags`    | `readonly Tag[]`                            | Names that hold while the state is active, read with `hasTag`; see [Name a group of states with tags](#name-a-group-of-states-with-tags). |
| `on`      | `{ [type]: target \| config \| config[] }`  | Transitions by event `type`, each target a full path; see [Events and transitions](#events-and-transitions). |
| `after`   | `{ [seconds: number]: target \| rule } \| { delay, to, when, run }[]` | Full-path targets taken after this long in the state, in game time, or rules with a `to`, a `when` and a `run`; see [Rules on a timer](#rules-on-a-timer). In the list form `delay` is a number or `(ctx) => number`, read once per entry of the state; see [`update` and `after`](#update-and-after). |
| `every`   | `{ [seconds: number]: run \| run[] } \| { delay, run }[]` | Code run each time this many seconds pass on the state's clock while the state is active, without a move; see [Repeat while a state is active](#repeat-while-a-state-is-active). |
| `always`  | `target \| config \| config[]`               | Full-path targets taken right after any move that leaves this state active; the first whose `when(ctx, machine)` is missing or passes wins, and its `run(ctx, machine)` runs during the move. See [Move on at once with `always`](#move-on-at-once-with-always). |
| `enter`   | `(ctx, machine) => void`                    | Runs each time the state is entered.                                                          |
| `exit`    | `(ctx, machine) => void`                    | Runs each time the state is left, including on `stop()`.                                      |
| `update`  | `(ctx, dt, machine) => target \| undefined` | Runs on every `update(dt)` while active; a returned target, one of the machine's full paths, transitions. |
| `task`    | `(ctx, finish, machine) => (() => void) \| void` | Runs after `enter`; `finish(event)` sends one event if the state is still the one entered. A returned function runs once when that entry ends. |
| `unhandled` | `(ctx, event, machine) => void`           | Runs when the machine drops an event while the state is active; see [React to an unhandled event](#react-to-an-unhandled-event). |
| `invoke`  | `never`                                     | Renamed to `task`; setting it fails to compile.                                               |

### `PrivateCtxConfig`

The optional key the root config takes; see [Private fields with `privateCtx`](#private-fields-with-privatectx).

| Field        | Type                 | Meaning                                                                                       |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------- |
| `privateCtx` | `(ctx: Ctx) => Priv` | Builds the fields only the machine uses from the object passed to `start`. Runs once per `start`, before the root's `enter` hook, so every instance gets fresh fields of its own. |

### `Machine`

What the second `defineMachine` call returns.

| Member  | Type                                                               | Meaning                                                                            |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `start` | `(ctx: Ctx, at?: readonly P[]) => MachineInstance<Ctx, E, P, Tag>` | Creates an instance and enters `initial`, or the states the paths of `at` name; see [Start at saved paths](#start-at-saved-paths). |

### `MachineInstance`

| Member    | Type                    | Meaning                                                                            |
| --------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `ctx`     | `Ctx`                   | The context passed to `start`. A private machine's fields are on the same table and absent from its type. |
| `path`    | `P \| undefined`        | The deepest active state's full path (the first region's leaf in a parallel state), or `undefined` once stopped. |
| `leaves`  | `readonly P[]`          | Every active leaf's full path, in region order; one path without parallel states, empty once stopped. The same array, updated in place. |
| `matches` | `(path: P) => boolean`  | Whether the state at the full path `path` is active, ancestors included.           |
| `hasTag`  | `(tag: Tag) => boolean` | Whether an active state carries `tag`, parents and every region included.          |
| `can`     | `(event: E) => boolean` | Whether a rule of an active state would take `event` if it were sent at that moment. Moves nothing and runs no hook. |
| `send`    | `(event: E) => void`    | Handles `event`, or queues it when called during a step.                           |
| `update`  | `(dt: number) => void`  | Runs the `update` hooks, then, in every region no hook moved, each state's `every` entries and its `after` timers. |
| `stop`    | `() => void`            | Exits every active state; later `send` and `update` calls do nothing.              |
| `onMove` | `(listener: (from, to, cause, event) => void) => () => void` | Calls `listener` after each move with the old and new leaf, the cause and the event; inside a parallel state, the leaves are those of the region that moved. `to` is `undefined` on `stop()`. Returns a function that removes the listener. |
| `onUnhandled` | `(listener: (event: E) => void) => () => void` | Calls `listener` with each event the machine processes that no rule of an active state takes. Returns a function that removes the listener. |

### `WaitGroup`

`waitGroup()` returns a group that counts the engine work a `task` started and tells when all of it has finished.

```ts title="wait-group.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";

interface LevelCtx {
  readonly url: string;
  readonly curtain: Url;
}

type LevelEvent = { type: "READY" };

export const level = defineMachine<LevelCtx, LevelEvent>()({
  initial: "/loading",
  states: {
    loading: {
      task: (ctx, finish) => {
        const group = waitGroup();
        http.request(ctx.url, "GET", group.add());
        go.animate(ctx.curtain, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, group.add());
        group.wait(() => finish({ type: "READY" }));
      },
      on: { READY: "/playing" },
    },
    playing: {},
  },
});
```

| Member | Type                             | Meaning                                                                            |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------- |
| `add`  | `() => () => void`               | Records one pending piece of work and returns the function that reports it finished. That function counts once and ignores its arguments. |
| `wait` | `(callback: () => void) => void` | Calls `callback` once when nothing added is pending: at once when nothing is pending at the call, and otherwise inside the report that finishes the last piece. |

A group knows nothing about a machine. Built inside a `task`, it is new for each entry of the state. A report that arrives after the state was left ends in a `finish` that is ignored, and a piece that never reports is a case for the [watchdog](#watchdog). [Work that completes](#work-that-completes) has a group with a piece that can fail and one counted while the game runs, and [A group inside a sequence](#a-group-inside-a-sequence) waits on one with `await`.
