---
toc-title: Entity systems
---
# Entity systems

`ecs` is a small typed entity system library that ships with the toolchain and compiles to plain Lua. It is a TypeScript port of [tiny-ecs](https://github.com/bakpakin/tiny-ecs) by Calvin Rose, released under the MIT license, and keeps every tiny-ecs feature. Each system picks its entities with a filter, and inside the system the compiler knows which components those entities have. Drive membership from state machines with [ecs and hsm together](./ecs-and-hsm.md), copy a snippet from the [cheat sheet](#cheat-sheet), or look a name up in the [reference](#reference).

Use [`hsm`](./state-machines.md) for what one object is doing, and `ecs` for the same work done to many objects every frame: movement, springs, tweens, pools, level of detail. A system runs one loop over every entity that has the components it needs, so the per-object branches leave `update`.

## Import it

`ecs` needs no install: its declarations ship in `@defold-typescript/types`, and the build compiles its source.

```ts
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
import { member } from "@defold-typescript/types/ecs/hsm";
```

| Module | Holds | Written to |
| --- | --- | --- |
| `@defold-typescript/types/ecs` | worlds, systems and filters | `lib/defold_typescript/ecs/index.lua` |
| `@defold-typescript/types/ecs/hsm` | the [state machine bridge](./ecs-and-hsm.md) | `lib/defold_typescript/ecs/hsm.lua` |

- `build` and `watch` write each module your code uses to the [runtime folder](./build.md#the-runtime-folder) (`lib/defold_typescript/ecs/` by default), inside `outDir` when one is set. A module nothing uses, or only uses for its types, is not written.
- Both modules are plain Lua 5.1 and need no `lualib_bundle`.
- The Lua opens with the tiny-ecs license, and the CLI package ships `THIRD_PARTY_NOTICES.md`, which lists tiny-ecs.
- A source of your own that would compile to one of those paths fails the build.

## Entities and components

An entity is a plain table. Its fields are its components, and a component is present when its field is not `undefined` (`nil` in Lua). Declare one entity type whose components are optional fields, next to the fields every entity has:

```ts title="entities.ts"
interface Vec {
  x: number;
  y: number;
}

export interface Ent {
  readonly name: string;
  position?: Vec;
  velocity?: Vec;
  frozen?: true;
}

export const ball: Ent = { name: "ball", position: { x: 0, y: 10 }, velocity: { x: 2, y: 0 } };
export const wall: Ent = { name: "wall", position: { x: 5, y: 0 } };
```

- A field set to `false` is present, since a filter tests for `undefined` as tiny-ecs tests for `nil`. Type a marker component `true` and clear it with `undefined`.
- One entity can belong to several worlds at once.
- A copy of an entity is a different entity: a spread, a `msg.post` payload or a `sys.save` round trip gives a table that joins a world on its own.

## Filters

A filter picks the entities a system sees. Build one from component names and other filters:

| Filter | Takes an entity that |
| --- | --- |
| `requireAll(...)` | has every component and passes every filter given |
| `requireAny(...)` | has at least one component or passes at least one filter given |
| `rejectAll(...)` | lacks at least one component or fails at least one filter given |
| `rejectAny(...)` | has none of the components and passes none of the filters given |

Inside a system, the entity has the components the top-level `requireAll` names. A filter nested inside it, and the other three filters, narrow nothing:

```ts title="filters.ts"
import { processingSystem, rejectAny, requireAll, requireAny } from "@defold-typescript/types/ecs";
import type { Ent } from "./entities";

export const move = processingSystem<Ent>()(requireAll("position", "velocity"), {
  process(e, dt) {
    e.position.x += e.velocity.x * dt;
    e.position.y += e.velocity.y * dt;
  },
});

export const settle = processingSystem<Ent>()(requireAll("velocity", rejectAny("frozen")), {
  process(e) {
    e.velocity.y = 0;
  },
});

export const watch = processingSystem<Ent>()(requireAny("velocity", "frozen"), {
  process(e) {
    if (e.velocity !== undefined) {
      print(`${e.name} moves at ${e.velocity.x}`);
    }
  },
});
```

A name that is not a component of the entity type fails to compile, nested or not:

```ts title="filter-typo.ts"
import { processingSystem, requireAll } from "@defold-typescript/types/ecs";
import type { Ent } from "./entities";

export const broken = processingSystem<Ent>()(
  // @ts-expect-error `velocty` is not a component of Ent
  requireAll("position", "velocty"),
  { process() {} },
);
```

A function `(system, entity) => boolean` is a filter too. It narrows nothing:

```ts title="custom-filter.ts"
import { processingSystem } from "@defold-typescript/types/ecs";
import type { Ent } from "./entities";

export const high = processingSystem<Ent>()(
  (_system: unknown, e: Ent) => e.position !== undefined && e.position.y > 100,
  {
    process(e) {
      print(`${e.name} is high`);
    },
  },
);
```

### String filters

`filter(pattern)` builds a filter from a tiny-ecs pattern, parsed once:

- `a&b` takes entities that have `a` and `b`; `a|b`, those that have either; `!a`, those that lack `a`.
- Parentheses group, and `&` binds tighter than `|`, as `and` does `or` in Lua: `a|b&c` means `a|(b&c)`.
- Names are letters, digits and `_`. `!` comes once, before a name or a group, and a pattern has no spaces.

A string filter narrows nothing. In a literal pattern, a name that is not a component of the entity type fails to compile; a pattern typed as `string` is checked only for its syntax, when `filter` runs. `filter` throws on a bad pattern, naming the position where it stops; `tryFilter` returns `{ ok: true, filter }` or `{ ok: false, error }` instead:

```ts title="string-filters.ts"
import { filter, processingSystem, tryFilter } from "@defold-typescript/types/ecs";
import type { Ent } from "./entities";

export const placed = processingSystem<Ent>()(filter("position&(velocity|frozen)"), {
  process(e) {
    if (e.position !== undefined) {
      print(`${e.name} is at ${e.position.x}`);
    }
  },
});

export const broken = processingSystem<Ent>()(
  // @ts-expect-error `velocty` is not a component of Ent
  filter("position&!velocty"),
  { process() {} },
);

export function fromConfig(pattern: string) {
  const result = tryFilter(pattern);
  if (!result.ok) {
    print(result.error);
    return undefined;
  }
  return processingSystem<Ent>()(result.filter, { process() {} });
}
```

## Systems

Four factories build systems. Each is called with the entity type first, then with the filter and the definition:

| Factory | Runs | You write |
| --- | --- | --- |
| `system<E>()` | `update(dt)` once per world update | `update`; the filter is optional |
| `processingSystem<E>()` | `preProcess(dt)`, then `process(e, dt)` for each entity, then `postProcess(dt)` | any of the three; its `update` is its own |
| `sortedSystem<E>()` | `update(dt)`, with `entities` kept in `compare` order | `compare` and `update`; the filter is optional |
| `sortedProcessingSystem<E>()` | the three processing callbacks, in `compare` order | `compare` and `process` |

The filter is the factory's own argument rather than a field of the definition. On TypeScript 6.0.2, a `requireAll(...)` written inside the definition infers no components when `process` has an unannotated parameter, so nothing would narrow. The factory writes the filter to the system's `filter` field, so the system is the table tiny-ecs builds.

`this` inside a callback is the system. The definition's own fields are typed on it, next to the fields `ecs` manages, such as `world`, `entities` and `index`:

```ts title="systems.ts"
import { processingSystem, requireAll, sortedSystem, system } from "@defold-typescript/types/ecs";
import type { Ent } from "./entities";

export const clock = system<Ent>()({
  elapsed: 0,
  update(dt) {
    this.elapsed += dt;
  },
});

export const tally = processingSystem<Ent>()(requireAll("velocity"), {
  moving: 0,
  onAdd(e) {
    print(`${e.name} has a velocity of ${e.velocity.x}`);
  },
  onRemove(e) {
    print(`${e.name} lost its velocity`);
  },
  preProcess() {
    this.moving = 0;
  },
  process(e) {
    if (e.velocity.x !== 0 || e.velocity.y !== 0) {
      this.moving += 1;
    }
  },
  postProcess() {
    print(`${this.moving} moving`);
  },
});

export const leftToRight = sortedSystem<Ent>()(requireAll("position"), {
  compare(a, b) {
    return a.position.x < b.position.x;
  },
  update() {
    const first = this.entities?.[0];
    if (first !== undefined) {
      print(`${first.name} is leftmost`);
    }
  },
});
```

- `onAdd(e)` sees the entity with the filter's components. `onRemove(e)` does not, since an entity that lost a component leaves after the change.
- A sorted system sorts its entities with a stable sort whenever they change; `compare(a, b)` returns whether `a` goes first. Its `onModify` is the sort itself, and it cannot be `nocache`.
- `compare` is read once, at the first sort, and again after a [hot reload](#hot-reload). Changing a field `compare` reads does not sort again: set `modified = true` on the system, and it sorts at the next update.
- A processing system's `update` runs its three callbacks, so a definition with its own `update` fails to compile.
- A system belongs to one world at a time, and `addSystem` throws when it already belongs to one. When several worlds need the same system, build it inside the function that builds each world.

## The world

A world holds entities and systems:

```ts title="world.ts"
import { hasEntity, world } from "@defold-typescript/types/ecs";
import { ball, type Ent, wall } from "./entities";
import { move, settle } from "./filters";

export const w = world<Ent>(move, settle, ball);

export function addWall(): void {
  w.add(wall);
  print(hasEntity(w, wall));
  w.refresh();
  print(hasEntity(w, wall));
}

export function freeze(e: Ent): void {
  e.frozen = true;
  w.changed(e);
}
```

- `world<E>(...items)` creates a world and applies its systems and entities at once. It runs no `onModify`; the first `update` or `refresh` does.
- `add`, `addEntity`, `addSystem`, `remove`, `removeEntity` and `removeSystem` wait for the next `refresh` or `update`, so no system sees its entities change in the middle of a loop. `add` and `remove` take systems and entities alike.
- After you give an entity a component or take one away, call `changed(e)`: each system checks the entity again at the next `refresh` or `update`. `changed` is `addEntity` under another name.
- `refresh()` applies what is waiting now, and runs `onModify(0)` on each active system whose entities changed.
- `hasEntity(w, e)` tells whether the world holds `e` as of its last `refresh` or `update`: `false` while its add is waiting, and `true` while its removal is. `addWall` above prints `false`, then `true`.
- `entities` and `systems` list what the world holds. `getEntityCount`, `getSystemCount`, `setSystemIndex`, `clearEntities` and `clearSystems` work as they do in tiny-ecs.
- Each method is also a function that takes the world first: `update(w, dt)` is `w.update(dt)`. `hasEntity` is a function only.

## One frame

`w.update(dt)` runs one frame in four passes:

1. Systems waiting to join or leave do so, then entities.
2. From the last system to the first, each active system runs `onModify(dt)` if its entities changed, then `preWrap(dt)`. The two interleave: system N runs both before system N-1 runs either.
3. From the first system to the last, each active system runs `update(dt)`. A processing system's `update` runs `preProcess`, `process` for each entity, and `postProcess`.
4. From the first system to the last, each active system runs `postWrap(dt)`.

```ts title="frame-order.ts"
import { system, world } from "@defold-typescript/types/ecs";

interface Thing {
  readonly name: string;
}

function traced(name: string) {
  return system<Thing>()({
    onModify() {
      print(`${name} onModify`);
    },
    preWrap() {
      print(`${name} preWrap`);
    },
    update() {
      print(`${name} update`);
    },
    postWrap() {
      print(`${name} postWrap`);
    },
  });
}

export function firstFrame(): void {
  const w = world<Thing>(traced("a"), traced("b"));
  w.update(1 / 60);
}
```

`firstFrame` prints:

```text
b onModify
b preWrap
a onModify
a preWrap
a update
b update
a postWrap
b postWrap
```

Both systems run `onModify` because a system that just joined counts as changed.

- A system with `active = false` skips passes 2 to 4. It still gains and loses entities, with `onAdd` and `onRemove`.
- A system with `interval` set runs `update` once for each whole `interval` of time it has buffered, with `interval` as `dt`: zero, one or several times a frame.
- A processing system with `nocache = true` keeps no `entities` list. It filters the world's entities on every update, and it gets no `onAdd` or `onRemove`.
- `w.update(dt, filter)` runs `preWrap`, `update` and `postWrap` only on the systems `filter` takes, called as `filter(world, system)`, so a name in it tests a field of the system. `onModify` still runs on every active system. A system the filter leaves out keeps its `modified` flag, so its `onModify` runs again at each update until an update includes it.

## Run a world from a script

Build the world in `init`, so it lands on `self`, and update it from `update`:

```ts title="swarm.ts"
import { defineScript } from "@defold-typescript/types";
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";

interface Bug {
  readonly id: Hash;
  position?: Vector3;
  velocity?: Vector3;
}

function swarm() {
  return world<Bug>(
    processingSystem<Bug>()(requireAll("position", "velocity"), {
      process(e, dt) {
        e.position.x += e.velocity.x * dt;
        e.position.y += e.velocity.y * dt;
        go.set_position(e.position, e.id);
      },
    }),
  );
}

export default defineScript({
  init() {
    const bugs = swarm();
    for (let i = 0; i < 10; i++) {
      const id = factory.create("#bug_factory");
      if (id !== undefined) {
        bugs.add({
          id,
          position: go.get_position(id),
          velocity: vmath.vector3(math.random(-50, 50), math.random(-50, 50), 0),
        });
      }
    }
    return { bugs };
  },
  update(self, dt) {
    self.bugs.update(dt);
  },
});
```

- Each game object that runs the script gets its own world on `self`; see [Where script state lives](./script-state.md). `swarm()` builds new systems for each world, since a system belongs to one world.
- A world in a plain module is one world for every script that imports it. Update it from one script only, or it runs several frames per frame.

## Hot reload

Hot reload lets you edit a system while the game runs and see the change without restarting. Give the factory a key, a name for this system, as in `processingSystem<Mover>("move")`.

When [`watch --hot-reload`](./watch.md#hot-reload) or [`reload`](./reload.md) pushes an edit, Defold runs the changed file again, and every script that already imported it keeps the first copy. With a key, the factory finds the system it built the first time, in a table the `ecs` library keeps across reloads, puts the new definition into that same system and returns it, so the world keeps running it with its entities. Without a key the edited call builds a new system that no world holds, and the world keeps running the old one until you restart.

Define keyed systems at the top level of a module, and build their world in the `init` of one script:

```ts title="movement.ts"
import { processingSystem, requireAll, sortedSystem } from "@defold-typescript/types/ecs";

export interface Mover {
  readonly id: Hash;
  position?: Vector3;
  velocity?: Vector3;
}

export const move = processingSystem<Mover>("move")(requireAll("position", "velocity"), {
  speed: 1,
  process(e, dt) {
    e.position.x += e.velocity.x * this.speed * dt;
    e.position.y += e.velocity.y * this.speed * dt;
    go.set_position(e.position, e.id);
  },
});

export const leftToRightMovers = sortedSystem<Mover>("left to right")(requireAll("position"), {
  compare(a, b) {
    return a.position.x < b.position.x;
  },
});
```

```ts title="movers.ts"
import { defineScript } from "@defold-typescript/types";
import { world } from "@defold-typescript/types/ecs";
import { leftToRightMovers, type Mover, move } from "./movement";

export default defineScript({
  init() {
    return { movers: world<Mover>(move, leftToRightMovers) };
  },
  update(self, dt) {
    self.movers.update(dt);
  },
});
```

Editing `speed` or `process` in `movement.ts` changes how every mover moves from the next frame on, and the world keeps every mover it holds.

- **The definition replaces the old one.** The system takes every field the new definition states, such as `speed`, along with its callbacks, `filter`, `interval` and `compare`. A callback, `filter`, `interval` or `compare` the new definition leaves out is dropped.
- **What `ecs` manages stays.** `world`, `entities`, `indices`, `index`, `modified` and `bufferedTime` keep their values, so the system keeps its place in the world, its entities in their order, and the time an `interval` system has buffered. A field the definition does not state, such as one a callback wrote, keeps its value too.
- **The new filter applies at the next `refresh` or `update`.** Every entity of the world is checked again then: one that no longer passes leaves with `onRemove`, and one that now passes joins with `onAdd`, both from the new definition.
- **A sorted system sorts again** with the new `compare` at its next `refresh` or `update`.
- **Changing `nocache` throws** and keeps the old definition, since a `nocache` system keeps no entities of its own. Restart the game to switch.
- **A reload runs no `onAddToWorld` and no `init`.** Set-up they did on the first load stays as it was.
- **A key names one system in one world.** Build that world once, in one script. A system built per object in `init`, as in [Run a world from a script](#run-a-world-from-a-script), stays unkeyed: a reload does not run `init` again, so it keeps its code until you restart.
- **Build the world outside the module that defines its keyed systems.** That module runs again on a reload, and a second `world(move)` throws, since `move` already belongs to a world.
- **Different systems need different keys.** If another system also used `"move"`, its factory call would return `move`, with that other definition put into it.

## Coming from tiny-ecs

- Import each function by name: `tiny.world(...)` is `world<E>(...)`, and `tiny.requireAll(...)` is `requireAll(...)`.
- `tiny.processingSystem({ filter = ... })` is `processingSystem<E>()(filter, { ... })`, since the filter is the factory's own argument.
- `world(...)` returns the world alone, and `add` and `remove` return nothing. `addEntity`, `addSystem`, `removeEntity` and `removeSystem` return their argument.
- `tiny.filter(pattern)` is `filter(pattern)`, which throws where `tiny.filter` returns `nil, err`; `tryFilter(pattern)` returns the error instead. A pattern `tiny.filter` reads only through a quirk of its scanner, such as `a&&b`, `!!a`, `a | b` or `""`, throws.
- `requireAll`, `requireAny`, `rejectAll` and `rejectAny` throw for a token that is neither a component name nor a filter, `undefined` included, where tiny-ecs's combinators return `nil, err`. Called with no tokens, `requireAll` and `rejectAny` take every entity and `requireAny` and `rejectAll` take none, where tiny-ecs builds no filter.
- `hasEntity` and a factory's [hot reload](#hot-reload) key have no tiny-ecs counterpart.

## Where tiny-ecs's docs and code differ

The tiny-ecs docs say `postWrap` is "called on each system in reverse order". Its code, `tiny.lua` at the tiny-ecs commit `ecs` ports (vendored here as `packages/ecs/src/parity/tiny.lua`), runs `postWrap` in index order, first system first. `ecs` follows the code, and a test runs the same scenarios against `tiny.lua` and against `ecs` and holds the two to the same trace.

## Cheat sheet

Short answers to common tasks. Each snippet is an excerpt of one set of systems over an `Ent` with `position`, `velocity`, `sprite`, `label`, `depth`, `frozen` and `gameplay` components, held in a world `w`.

<div class="table-scroll code-table">
<table>
<thead>
<tr><th>I want to</th><th>Solution</th><th>Snippet</th></tr>
</thead>
<tbody>
<tr><td>

Run code on each entity that has some components

</td><td>

A `processingSystem` with [`requireAll`](#filters); those components are present inside `process`

</td><td>

```ts excerpt
const move = processingSystem<Ent>()(requireAll("position", "velocity"), {
  process(e, dt) {
    e.position.x += e.velocity.x * dt;
    e.position.y += e.velocity.y * dt;
  },
});
```

</td></tr>
<tr><td>

Skip the entities that carry a marker

</td><td>

`rejectAny` nested in `requireAll`

</td><td>

```ts excerpt
requireAll("velocity", rejectAny("frozen"))
```

</td></tr>
<tr><td>

Take the entities that have either of two components

</td><td>

`requireAny`; it narrows nothing, so check a component before reading it

</td><td>

```ts excerpt
requireAny("sprite", "label")
```

</td></tr>
<tr><td>

Run code once per frame

</td><td>

A [`system`](#systems) with `update`; the definition's own fields are typed on `this`

</td><td>

```ts excerpt
const clock = system<Ent>()({
  elapsed: 0,
  update(dt) {
    this.elapsed += dt;
  },
});
```

</td></tr>
<tr><td>

Run code at a fixed rate

</td><td>

`interval`; `update` gets the interval as `dt`

</td><td>

```ts excerpt
interval: 0.5,
```

</td></tr>
<tr><td>

Process entities in an order

</td><td>

A `sortedProcessingSystem` with `compare`, which returns whether `a` goes first

</td><td>

```ts excerpt
compare(a, b) {
  return a.depth < b.depth;
},
```

</td></tr>
<tr><td>

Sort again after a field `compare` reads changed

</td><td>

Set `modified` on the system; it sorts at the next update

</td><td>

```ts excerpt
layers.modified = true;
```

</td></tr>
<tr><td>

React when an entity joins or leaves a system

</td><td>

`onAdd`, which sees the filter's components, and `onRemove`, which does not

</td><td>

```ts excerpt
onAdd(e) {
  print(`${e.name} joined at ${e.position.x}`);
},
onRemove(e) {
  print(`${e.name} left`);
},
```

</td></tr>
<tr><td>

Add an entity

</td><td>

`add`; it joins at the next `refresh` or `update`

</td><td>

```ts excerpt
w.add(ball);
```

</td></tr>
<tr><td>

Give an entity a component, or take one away

</td><td>

Set the field, then call [`changed`](#the-world)

</td><td>

```ts excerpt
ball.frozen = true;
w.changed(ball);

ball.frozen = undefined;
w.changed(ball);
```

</td></tr>
<tr><td>

Remove an entity

</td><td>

`remove`; it leaves at the next `refresh` or `update`

</td><td>

```ts excerpt
w.remove(ball);
```

</td></tr>
<tr><td>

Apply waiting changes now

</td><td>

`refresh`; `hasEntity` then reads the result

</td><td>

```ts excerpt
w.refresh();
if (hasEntity(w, ball)) {
  print("ball is in the world");
}
```

</td></tr>
<tr><td>

Pause one system

</td><td>

`active`

</td><td>

```ts excerpt
move.active = false;
```

</td></tr>
<tr><td>

Freeze gameplay while the game is paused

</td><td>

Give the gameplay systems a field such as `gameplay: true`, and leave them out with a [system filter](#one-frame)

</td><td>

```ts excerpt
w.update(dt, rejectAny("gameplay"));
```

</td></tr>
<tr><td>

Collect entities during a pass and handle them after it

</td><td>

An array field on the system, emptied with a `pop()` loop in `postProcess`; `length = 0` would pull in `lualib_bundle`

</td><td>

```ts excerpt
postProcess() {
  while (this.landed.length > 0) {
    const e = this.landed.pop() as Ent;
    e.frozen = true;
    this.world?.changed(e);
  }
},
```

</td></tr>
<tr><td>

Add an entity from inside a system

</td><td>

`this.world`, the world the system belongs to

</td><td>

```ts excerpt
this.world?.add({ name: "spark", position: { x: 0, y: 0 } });
```

</td></tr>
</tbody>
</table>
</div>

## Reference

### Functions

| Function | Does |
| --- | --- |
| `requireAll` | Builds a filter that takes entities with every component and passing every filter given; narrows its components. |
| `requireAny` | Builds a filter that takes entities with at least one component or passing at least one filter given. |
| `rejectAll` | Builds a filter that rejects entities with every component and passing every filter given. |
| `rejectAny` | Builds a filter that rejects entities with at least one component or passing at least one filter given. |
| `filter` | `filter(pattern)` builds a filter from a [tiny-ecs pattern](#string-filters) such as `"a&!b"`; throws on a bad pattern. Narrows nothing. |
| `tryFilter` | `tryFilter(pattern)` returns `{ ok: true, filter }`, or `{ ok: false, error }` where `filter` throws. |
| `system` | `system<E>(key?)` returns a factory for plain systems: `(def)` or `(filter, def)`. With a `key`, a later call [reloads](#hot-reload) the system built first. |
| `processingSystem` | `processingSystem<E>(key?)` returns a factory for processing systems: `(filter, def)`. With a `key`, a later call [reloads](#hot-reload) the system built first. |
| `sortedSystem` | `sortedSystem<E>(key?)` returns a factory for plain systems kept in `compare` order. With a `key`, a later call [reloads](#hot-reload) the system built first. |
| `sortedProcessingSystem` | `sortedProcessingSystem<E>(key?)` returns a factory for processing systems run in `compare` order. With a `key`, a later call [reloads](#hot-reload) the system built first. |
| `world` | `world<E>(...items)` creates a world holding `items`, applied at once. |
| `add` | `add(w, ...items)`: the same as `w.add(...items)`. |
| `addEntity` | `addEntity(w, e)`: the same as `w.addEntity(e)`. |
| `changed` | `changed(w, e)`: the same as `w.changed(e)`. |
| `addSystem` | `addSystem(w, s)`: the same as `w.addSystem(s)`. |
| `remove` | `remove(w, ...items)`: the same as `w.remove(...items)`. |
| `removeEntity` | `removeEntity(w, e)`: the same as `w.removeEntity(e)`. |
| `removeSystem` | `removeSystem(w, s)`: the same as `w.removeSystem(s)`. |
| `refresh` | `refresh(w)`: the same as `w.refresh()`. |
| `update` | `update(w, dt, filter?)`: the same as `w.update(dt, filter)`. |
| `clearEntities` | `clearEntities(w)`: the same as `w.clearEntities()`. |
| `clearSystems` | `clearSystems(w)`: the same as `w.clearSystems()`. |
| `getEntityCount` | `getEntityCount(w)`: the same as `w.getEntityCount()`. |
| `getSystemCount` | `getSystemCount(w)`: the same as `w.getSystemCount()`. |
| `hasEntity` | `hasEntity(w, e)`: whether `w` holds `e` as of its last `refresh` or `update`; `false` while its add waits, `true` while its removal does. |
| `setSystemIndex` | `setSystemIndex(w, s, index)`: the same as `w.setSystemIndex(s, index)`. |

### World

| Member | Type | Meaning |
| --- | --- | --- |
| `systems` | `readonly SystemFields<E>[]` | The world's systems, in index order. |
| `entities` | `readonly E[]` | The entities the world holds, as of its last `refresh` or `update`. |
| `add` | `(...items: (E \| SystemFields<E>)[]) => void` | Adds each item as a system or an entity, at the next `refresh` or `update`. |
| `addEntity` | `(entity: T) => T` | Adds an entity, or checks one again after its components changed. |
| `changed` | `(entity: T) => T` | Checks an entity again after its components changed; the same as `addEntity`. |
| `addSystem` | `(system: S) => S` | Adds a system. Throws if the system already belongs to a world. |
| `remove` | `(...items: (E \| SystemFields<E>)[]) => void` | Removes each item as a system or an entity, at the next `refresh` or `update`. |
| `removeEntity` | `(entity: T) => T` | Removes an entity. |
| `removeSystem` | `(system: S) => S` | Removes a system. Throws if the system belongs to another world or to none. |
| `refresh` | `() => void` | Applies waiting changes and runs `onModify(0)` on each active system whose entities changed. |
| `update` | `(dt: number, systemFilter?: Filter) => void` | Applies waiting changes and runs [one frame](#one-frame) on every active system, or on those `systemFilter` takes. |
| `clearEntities` | `() => void` | Removes every entity. |
| `clearSystems` | `() => void` | Removes every system. |
| `getEntityCount` | `() => number` | The number of entities the world holds. |
| `getSystemCount` | `() => number` | The number of systems the world holds. |
| `setSystemIndex` | `(system: SystemFields<E>, index: number) => number` | Moves a system to a 1-based index, negative counting from the end, and returns its old index. |

### SystemFields

The fields every system carries. `ecs` sets `world`, `entities`, `indices` and `index`.

| Field | Type | Meaning |
| --- | --- | --- |
| `world` | `World<E> \| undefined` | The world the system belongs to. |
| `active` | `boolean` | Whether `update` and `refresh` run the system. Defaults to `true`. |
| `entities` | `readonly E[]` | The entities the system holds, in the order it processes them. A `nocache` system has none. |
| `indices` | `Record<number, number>` | Each held entity's position in `entities`, by the entity's id in the system's world. |
| `index` | `number` | The system's 1-based position in its world. Change it with `setSystemIndex`. |
| `modified` | `boolean` | Whether the system's entities changed since its last update; `onModify` runs while it is set. |
| `interval` | `number` | When set, `update` runs once per `interval` of buffered time instead of once per frame. |
| `bufferedTime` | `number` | The time an interval system has buffered toward its next update. |
| `nocache` | `boolean` | When `true`, a processing system filters the world's entities on every update and keeps no `entities` list. |
| `filter` | `Filter` | Picks the system's entities; the factory sets it from its first argument. |

### Callbacks

What a system's definition may hold besides its fields. `this` is the system in each.

| Callback | Systems | Meaning |
| --- | --- | --- |
| `onAdd` | all | `(entity)`: an entity joined the system; it has the filter's components. |
| `onRemove` | all | `(entity)`: an entity left the system. |
| `onModify` | all but sorted | `(dt)`: runs before the next update after the system's entities changed. A sorted system's is its sort. |
| `onAddToWorld` | all | `(world)`: the system joined a world, before it takes the world's entities. |
| `onRemoveFromWorld` | all | `(world)`: the system left a world, after its entities left it. |
| `preWrap` | all | `(dt)`: runs before any system updates, from the last system to the first. |
| `postWrap` | all | `(dt)`: runs after every system updated, from the first system to the last. |
| `update` | plain and sorted | `(dt)`: runs once per world update, or once per `interval`. A processing system's is its own. |
| `preProcess` | processing | `(dt)`: runs before the system processes its entities. |
| `process` | processing | `(entity, dt)`: runs once for each entity the system holds; the entity has the filter's components. |
| `postProcess` | processing | `(dt)`: runs after the system processed its entities. |
| `compare` | sorted | `(e1, e2)`: whether `e1` goes before `e2`. Read once, at the first sort. |
