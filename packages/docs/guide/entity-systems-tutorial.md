---
toc-title: Learn entity systems
llms-full: false
---
# Entity systems, one system at a time

A hands-on introduction to [`ecs`](./entity-systems.md), the entity system library that ships with this toolchain. You build one night garden full of fireflies, a little at a time. Every lesson ends with code that compiles, and by the last one the garden uses every part of `ecs`.

## 1. Three words to learn

A game has many things that behave alike: raindrops, coins, falling leaves, sparks. An entity system is a way to write the behavior once and run it on all of them. Three words describe it.

| Word | Meaning | Example |
| --- | --- | --- |
| Entity | One thing in the game. It is a plain table of data, with no code of its own. | a firefly |
| Component | One piece of an entity's data, such as where it is or how fast it moves. An entity has a component when that field is set. | `position`, `velocity` |
| System | Code that runs on every entity with the components it needs, once a frame. | "move everything that has a velocity" |

A fourth word holds them together: a **world** is the list of entities and the list of systems that run on them.

### Try it

1. A coin spins, and a magnet pulls it toward the player. Which components would the coin need, and which systems?

> [!MORE] Answer
> 1. A `position`, a `spin` and something that marks it as pulled, such as `magnetic`. One system turns everything that has a `spin`, and another moves everything that is `magnetic` toward the player. A raindrop with a `position` and no `spin` is skipped by the first system without a single `if`.

## 2. Why bother?

The usual way to write a firefly is one object with an `update` that asks every question about it, every frame:

```ts
interface Bug {
  x: number;
  vx: number;
  glow: number;
  resting: boolean;
  lit: boolean;
}

export function updateBug(bug: Bug, dt: number): void {
  if (!bug.resting) {
    bug.x += bug.vx * dt;
  }
  if (bug.lit) {
    bug.glow -= dt;
    if (bug.glow <= 0) {
      bug.lit = false;
    }
  }
}
```

It works for one firefly. Now give the garden moths that fly but never glow, and lanterns that glow but never move. Each kind gets its own `update` with its own copy of the same branches, or one `update` grows a branch for every kind. A new behavior, such as fleeing from the cursor, means editing every one of them.

An entity system turns this inside out. The moving code lives in one place and runs on everything that has a velocity. The glowing code lives in another and runs on everything that has a light. A lantern has a light and no velocity, so the moving code never sees it, and nobody had to write `if (!lantern)`.

### Try it

1. In `updateBug`, what does a resting firefly that is not lit cost each frame?

> [!MORE] Answer
> 1. Two checks that both say no. With a thousand of them, that is two thousand questions a frame with nothing to do. A system holds only the entities it works on, so a resting firefly that is not lit costs the moving and glowing systems nothing.

## 3. Your first world

Start with fireflies that drift. Make a file named `garden.ts`:

```ts step title="garden.ts"
import { processingSystem, requireAll, update, world } from "@defold-typescript/types/ecs";

export interface Firefly {
  readonly name: string;
  readonly position: Vector3;
  velocity?: Vector3;
}

export const WIDTH = 960;
export const HEIGHT = 640;

/** Moves each firefly that has a velocity. */
export const drift = processingSystem<Firefly>()(requireAll("velocity"), {
  process(e, dt) {
    e.position.x += e.velocity.x * dt;
    e.position.y += e.velocity.y * dt;
  },
});

const flick: Firefly = {
  name: "Flick",
  position: vmath.vector3(WIDTH / 2, HEIGHT / 2, 0),
  velocity: vmath.vector3(20, 10, 0),
};
const dot: Firefly = { name: "Dot", position: vmath.vector3(100, 100, 0) };
const garden = world<Firefly>(drift, flick, dot);
update(garden, 1);
print(flick.position.x, dot.position.x);
```

- **`interface Firefly`** is the entity type: every field one firefly can have. `name` and `position` are always there. `velocity` is optional, because a component is present only when its field is set.
- **[`processingSystem`](./entity-systems.md#systems)** builds a system that runs `process` once for each entity it holds, with the frame's time step `dt`.
- **[`requireAll("velocity")`](./entity-systems.md#filters)** is the system's filter: it takes the entities that have a `velocity`. Inside `process`, TypeScript knows `e.velocity` is set, so no check is needed.
- **[`world`](./entity-systems.md#the-world)** makes a world that holds the system and both fireflies.
- **[`update(garden, 1)`](./entity-systems.md#one-frame)** runs one frame that lasts one second. It prints `500 100`: Flick moved 20 to the right, and Dot, with no velocity, never reached `process`.

> [!NOTE] **Why two sets of parentheses?** In `processingSystem<Firefly>()(filter, { ... })` the first call names the entity type. The second takes the filter and the definition, and TypeScript works out from the filter which components are present. It is a TypeScript limitation, so always write it this way.

### Try it

1. Change `requireAll("velocity")` to `requireAll("speed")`. What happens?
2. Give Dot a velocity of `vmath.vector3(0, 5, 0)`. What does the last line print?

> [!MORE] Answer
> 1. It fails to compile: `speed` is not a field of `Firefly`. A filter can only name components the entity type has.
> 2. `500 100` again. Dot moves up, along `y`, and the line prints `x`.

## 4. Putting it in a Defold game

So far the garden runs once, at the bottom of its file. In a game it runs every frame, on game objects. Two changes get it there.

**Step 1.** `garden.ts` defines the firefly and its systems, and runs nothing:

```ts step title="garden.ts"
import { processingSystem, requireAll, update, world } from "@defold-typescript/types/ecs"; // [!code --]
import { processingSystem, requireAll } from "@defold-typescript/types/ecs"; // [!code ++]

export interface Firefly {
  readonly name: string;
  id: Hash; // [!code ++]
  readonly position: Vector3;
// ...

/** Moves each firefly that has a velocity. */
export const drift = processingSystem<Firefly>()(requireAll("velocity"), { // [!code --]
  process(e, dt) { // [!code --]
    e.position.x += e.velocity.x * dt; // [!code --]
    e.position.y += e.velocity.y * dt; // [!code --]
  }, // [!code --]
}); // [!code --]
export function drift() { // [!code ++]
  return processingSystem<Firefly>()(requireAll("velocity"), { // [!code ++]
    process(e, dt) { // [!code ++]
      e.position.x += e.velocity.x * dt; // [!code ++]
      e.position.y += e.velocity.y * dt; // [!code ++]
      go.set_position(e.position, e.id); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]

const flick: Firefly = { // [!code --]
  name: "Flick", // [!code --]
  position: vmath.vector3(WIDTH / 2, HEIGHT / 2, 0), // [!code --]
  velocity: vmath.vector3(20, 10, 0), // [!code --]
}; // [!code --]
const dot: Firefly = { name: "Dot", position: vmath.vector3(100, 100, 0) }; // [!code --]
const garden = world<Firefly>(drift, flick, dot); // [!code --]
update(garden, 1); // [!code --]
print(flick.position.x, dot.position.x); // [!code --]
```

- **`id: Hash`** is the firefly's game object, and `go.set_position` moves that object to the firefly's position.
- **`drift` is a function now.** A system belongs to one world at a time, so each world needs its own. Calling `drift()` builds a new one.
- **The lines at the bottom are gone.** The script below makes the world.

**Step 2.** Make the script, `fireflies.ts`, next to it:

```ts step title="fireflies.ts"
import { defineScript } from "@defold-typescript/types";
import { addEntity, update, type World, world } from "@defold-typescript/types/ecs";
import { drift, type Firefly, HEIGHT, WIDTH } from "./garden";

let born = 0;

function spawn(garden: World<Firefly>): Firefly | undefined {
  const position = vmath.vector3(math.random(0, WIDTH), math.random(0, HEIGHT), 0);
  const id = factory.create("#factory", position);
  if (id === undefined) {
    return undefined;
  }
  born += 1;
  return addEntity(garden, {
    name: `firefly ${born}`,
    id,
    position,
    velocity: vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0),
  });
}

export default defineScript({
  init() {
    const garden = world<Firefly>(drift());
    for (let i = 0; i < 20; i++) {
      spawn(garden);
    }
    return { garden };
  },
  update(self, dt) {
    update(self.garden, dt);
  },
});
```

- **`init`** builds a world for this game object and keeps it on `self`, so a second garden would get a world of its own. See [Where script state lives](./script-state.md).
- **`spawn`** makes a game object with the factory and adds a firefly for it with [`addEntity`](./entity-systems.md#the-world), which returns the firefly it was given.
- **`update`** runs one frame of the world each time Defold runs one frame of the game.

To see it, add a `firefly.go` game object file with a sprite, and a game object named `garden` to your main collection. Give `garden` the script built from `fireflies.ts`, and a factory component named `factory` whose prototype is `firefly.go`. Twenty fireflies appear at random and drift off.

> [!WARNING] **A new firefly joins at the next update.** `addEntity` and every other change to a world waits for the next `update`, so no system ever sees its list change halfway through a loop.

### Try it

1. You put two `garden` game objects in the collection. How many worlds are there, and how many `drift` systems?
2. Why can't `drift` stay a `const`, as it was in lesson 3?

> [!MORE] Answer
> 1. Two of each. `init` runs once per game object, and each run builds a world and calls `drift()` once.
> 2. The second `init` would add the same system to a second world, and adding a system that already belongs to a world throws.

## 5. One loop over everyone

A processing system sees one firefly at a time. Some work needs all of them at once: to fly as a swarm, each firefly steers toward the middle of the group, and finding the middle takes every position.

That is a job for a plain [`system`](./entity-systems.md#systems). It has one `update` per frame, and its [`entities`](./entity-systems.md#systemfields) field lists every entity it holds:

```ts step title="garden.ts"
import { processingSystem, requireAll } from "@defold-typescript/types/ecs"; // [!code --]
import { processingSystem, requireAll, system } from "@defold-typescript/types/ecs"; // [!code ++]

// ...
  });
}

/** Steers each firefly toward the middle of the swarm. */ // [!code ++]
export function swarm() { // [!code ++]
  return system<Firefly>()(requireAll("velocity"), { // [!code ++]
    update(dt) { // [!code ++]
      const flock = this.entities; // [!code ++]
      if (flock === undefined || flock.length === 0) { // [!code ++]
        return; // [!code ++]
      } // [!code ++]
      let x = 0; // [!code ++]
      let y = 0; // [!code ++]
      for (const e of flock) { // [!code ++]
        x += e.position.x; // [!code ++]
        y += e.position.y; // [!code ++]
      } // [!code ++]
      x /= flock.length; // [!code ++]
      y /= flock.length; // [!code ++]
      for (const e of flock) { // [!code ++]
        if (e.velocity !== undefined) { // [!code ++]
          e.velocity.x += (x - e.position.x) * 0.2 * dt; // [!code ++]
          e.velocity.y += (y - e.position.y) * 0.2 * dt; // [!code ++]
        } // [!code ++]
      } // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`update(dt)`** runs once a frame, however many fireflies there are.
- **`this`** inside a callback is the system, and `this.entities` is the list of entities its filter took.
- **`e.velocity !== undefined`** is a check `process` never needed. `this.entities` is typed by the entity type alone, so a component the filter requires is still optional to TypeScript there.

Add the swarm to the world:

```ts step title="fireflies.ts"
import { defineScript } from "@defold-typescript/types";
import { addEntity, update, type World, world } from "@defold-typescript/types/ecs";
import { drift, type Firefly, HEIGHT, WIDTH } from "./garden"; // [!code --]
import { drift, type Firefly, HEIGHT, swarm, WIDTH } from "./garden"; // [!code ++]

// ...
export default defineScript({
  init() {
    const garden = world<Firefly>(drift()); // [!code --]
    const garden = world<Firefly>(drift(), swarm()); // [!code ++]
    for (let i = 0; i < 20; i++) {
```

The world runs its systems in the order it got them: `drift` first, then `swarm`.

### Try it

1. Could `swarm` be a processing system?
2. What does `swarm` do with a world that holds no fireflies?

> [!MORE] Answer
> 1. Not easily. `process` sees one firefly, and the middle of the swarm needs all of them before any firefly steers.
> 2. Nothing. `this.entities` is empty, so the `return` at the top skips the rest.

## 6. Choosing who a system sees

Real fireflies rest on leaves, and some glow while others are dark. Give the firefly two more components:

```ts step title="garden.ts"
import { processingSystem, requireAll, system } from "@defold-typescript/types/ecs"; // [!code --]
import { // [!code ++]
  filter, // [!code ++]
  processingSystem, // [!code ++]
  rejectAll, // [!code ++]
  requireAll, // [!code ++]
  requireAny, // [!code ++]
  system, // [!code ++]
  tryFilter, // [!code ++]
} from "@defold-typescript/types/ecs"; // [!code ++]

// ...
  readonly position: Vector3;
  velocity?: Vector3;
  light?: number; // [!code ++]
  flying?: true; // [!code ++]
}
// ...
export const HEIGHT = 640;

/** Moves each firefly that has a velocity. */ // [!code --]
/** Moves each flying firefly. */ // [!code ++]
export function drift() {
  return processingSystem<Firefly>()(requireAll("velocity"), { // [!code --]
  return processingSystem<Firefly>()(requireAll("velocity", "flying"), { // [!code ++]
    process(e, dt) {
// ...
}

/** Steers each firefly toward the middle of the swarm. */ // [!code --]
/** Steers each flying firefly toward the middle of the swarm. */ // [!code ++]
export function swarm() {
  return system<Firefly>()(requireAll("velocity"), { // [!code --]
  return system<Firefly>()(requireAll("velocity", "flying"), { // [!code ++]
    update(dt) {
```

- **`light`** is how bright a lit firefly glows, from 0 to 1. A dark firefly has none.
- **`flying: true`** marks a firefly in the air. One on a leaf has no `flying`. A marker component is typed `true` and taken away with `undefined`, since a filter treats `false` as present.
- **`drift` and `swarm`** now require `flying` as well, so a resting firefly stays where it is.

`requireAll` is one of four [filters](./entity-systems.md#filters), and each takes the names of components:

| Filter | Takes an entity that |
| --- | --- |
| `requireAll(...)` | has every one |
| [`requireAny(...)`](./entity-systems.md#filters) | has at least one |
| [`rejectAll(...)`](./entity-systems.md#filters) | lacks at least one |
| [`rejectAny(...)`](./entity-systems.md#filters) | has none |

A filter can take other filters in place of names, as in `requireAll("light", rejectAny("flying"))`. Only the names a top-level `requireAll` gives are known to be present inside the system.

Two systems use the new filters:

```ts step title="garden.ts"
      }
    },
  });
}
/** Writes how many fireflies are awake: lit, or flying. */ // [!code ++]
export function counter() { // [!code ++]
  return system<Firefly>()(requireAny("light", "flying"), { // [!code ++]
    update() { // [!code ++]
      label.set_text("/hud#awake", `${this.entities?.length ?? 0} awake`); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
/** Holds the fireflies you can catch: each one that is dark or not flying. */ // [!code ++]
export function catchable() { // [!code ++]
  return system<Firefly>()(rejectAll("light", "flying"), {}); // [!code ++]
} // [!code ++]
```

- **`counter`** takes a firefly that is lit or flying, and writes how many there are to a label.
- **`catchable`** takes a firefly that lacks a light or lacks `flying`: the ones that are easy to catch. It does nothing yet, and lesson 7 gives it work.

A filter can also be a string, a pattern as tiny-ecs writes it: `&` is and, `|` is or, `!` is not. [`filter`](./entity-systems.md#string-filters) reads a pattern you write in the code, and [`tryFilter`](./entity-systems.md#string-filters) reads one that comes from somewhere else:

```ts step title="garden.ts"
  return system<Firefly>()(rejectAll("light", "flying"), {});
}
/** Swells each lit firefly that sits still, as much as it glows. */ // [!code ++]
export function beacons() { // [!code ++]
  return processingSystem<Firefly>()(filter("light&!flying"), { // [!code ++]
    process(e) { // [!code ++]
      if (e.light !== undefined) { // [!code ++]
        go.set_scale(1 + e.light / 2, e.id); // [!code ++]
      } // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
/** Counts the fireflies `pattern` takes, or returns `undefined` for a pattern that does not parse. */ // [!code ++]
export function watch(pattern: string) { // [!code ++]
  const parsed = tryFilter(pattern); // [!code ++]
  if (!parsed.ok) { // [!code ++]
    print(`garden.watch: ${parsed.error}`); // [!code ++]
    return undefined; // [!code ++]
  } // [!code ++]
  return system<Firefly>()(parsed.filter, { // [!code ++]
    update() { // [!code ++]
      label.set_text("/hud#watch", `${pattern}: ${this.entities?.length ?? 0}`); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`filter("light&!flying")`** takes a lit firefly on a leaf. A string filter narrows nothing, so `beacons` checks `e.light` before it reads it.
- **`tryFilter(pattern)`** returns `{ ok: true, filter }` or `{ ok: false, error }`. `filter` would throw on a pattern that does not parse, and a pattern typed in a settings file can be wrong.

Now the script. Fireflies start lit or dark, flying or resting, and a click asks whether the firefly under the pointer is catchable:

```ts step title="fireflies.ts"
import { defineScript } from "@defold-typescript/types";
import { addEntity, update, type World, world } from "@defold-typescript/types/ecs"; // [!code --]
import { drift, type Firefly, HEIGHT, swarm, WIDTH } from "./garden"; // [!code --]
import { add, addEntity, update, type World, world } from "@defold-typescript/types/ecs"; // [!code ++]
import { // [!code ++]
  beacons, // [!code ++]
  catchable, // [!code ++]
  counter, // [!code ++]
  drift, // [!code ++]
  type Firefly, // [!code ++]
  HEIGHT, // [!code ++]
  swarm, // [!code ++]
  WIDTH, // [!code ++]
  watch, // [!code ++]
} from "./garden"; // [!code ++]

const TOUCH = hash("touch"); // [!code ++]
let born = 0;
// ...
    position,
    velocity: vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0),
    light: math.random() < 0.5 ? 1 : undefined, // [!code ++]
    flying: math.random() < 0.5 ? true : undefined, // [!code ++]
  });
// ...
export default defineScript({
  init() {
    const garden = world<Firefly>(drift(), swarm()); // [!code --]
    msg.post(".", "acquire_input_focus"); // [!code ++]
    const net = catchable(); // [!code ++]
    const garden = world<Firefly>( // [!code ++]
      drift(), // [!code ++]
      swarm(), // [!code ++]
      beacons(), // [!code ++]
      counter(), // [!code ++]
      net, // [!code ++]
    ); // [!code ++]
    const watcher = watch(sys.get_config_string("garden.watch", "light&flying")); // [!code ++]
    if (watcher !== undefined) { // [!code ++]
      add(garden, watcher); // [!code ++]
    } // [!code ++]
    for (let i = 0; i < 20; i++) {
      spawn(garden);
    }
    return { garden }; // [!code --]
    return { garden, net }; // [!code ++]
  },
// ...
    update(self.garden, dt);
  },
  on_input(self, action_id, action) { // [!code ++]
    const x = action.x ?? 0; // [!code ++]
    const y = action.y ?? 0; // [!code ++]
    if (action_id === TOUCH && action.pressed) { // [!code ++]
      for (const f of self.garden.entities) { // [!code ++]
        const near = math.abs(f.position.x - x) < 20 && math.abs(f.position.y - y) < 20; // [!code ++]
        if (near) { // [!code ++]
          const catchable = self.net.filter?.(self.net, f) === true; // [!code ++]
          print(`${f.name}: ${catchable ? "you can catch it" : "too quick"}`); // [!code ++]
        } // [!code ++]
      } // [!code ++]
    } // [!code ++]
  }, // [!code ++]
});
```

- **`sys.get_config_string("garden.watch", ...)`** reads a `watch` setting from a `[garden]` section in `game.project`, so you can change what the label counts without touching code.
- **[`add`](./entity-systems.md#the-world)** puts the watch system into the world. It takes systems and entities alike.
- **`self.net.filter`** is the filter `catchable` was built with. The factory stores it in the system's [`filter`](./entity-systems.md#systemfields) field, and calling it as `filter(system, entity)` asks whether the system would take that firefly.

Add a `hud` game object with labels named `awake` and `watch`, and a `touch` action on the left mouse button to your input bindings.

### Try it

1. A firefly is lit and resting. Which of `drift`, `counter`, `catchable` and `beacons` take it?
2. Set `watch = light|` in `game.project`. What happens?
3. Write `filter("light&!flyng")` in `beacons`. When do you find out?

> [!MORE] Answer
> 1. `counter`, because it is lit; `catchable`, because it is not flying; and `beacons`, because it is lit and not flying. `drift` needs `flying`.
> 2. `tryFilter` returns an error, `watch` prints it and returns `undefined`, and the garden runs without the watch label.
> 3. At once: a literal pattern is checked when it compiles, and `flyng` is not a field of `Firefly`.

## 7. Coming and going

Entities join and leave systems as their components change, and the world can tell a system when. Each system may define two hooks:

- [**`onAdd(e)`**](./entity-systems.md#callbacks) runs when an entity joins the system, with the filter's components present.
- [**`onRemove(e)`**](./entity-systems.md#callbacks) runs when it leaves. The entity may have lost those components by then.

That is enough to make lights work. Each firefly game object gets two more sprites, `light` and `hint`, that start disabled:

```ts step title="garden.ts"
import {
  changed, // [!code ++]
  filter,
  processingSystem,
  rejectAll,
  removeEntity, // [!code ++]
  requireAll,
// ...
      e.position.y += e.velocity.y * dt;
      go.set_position(e.position, e.id);
      const gone = // [!code ++]
        e.position.x < 0 || e.position.x > WIDTH || e.position.y < 0 || e.position.y > HEIGHT; // [!code ++]
      if (gone && this.world !== undefined) { // [!code ++]
        removeEntity(this.world, e); // [!code ++]
      } // [!code ++]
    },
// ...
/** Holds the fireflies you can catch: each one that is dark or not flying. */
export function catchable() {
  return system<Firefly>()(rejectAll("light", "flying"), {}); // [!code --]
  return system<Firefly>()(rejectAll("light", "flying"), { // [!code ++]
    onAdd(e) { // [!code ++]
      msg.post(msg.url(undefined, e.id, "hint"), "enable"); // [!code ++]
    }, // [!code ++]
    onRemove(e) { // [!code ++]
      msg.post(msg.url(undefined, e.id, "hint"), "disable"); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
}
// ...
export function beacons() {
  return processingSystem<Firefly>()(filter("light&!flying"), {
    onRemove(e) { // [!code ++]
      go.set_scale(1, e.id); // [!code ++]
    }, // [!code ++]
    process(e) {
// ...
      label.set_text("/hud#watch", `${pattern}: ${this.entities?.length ?? 0}`);
    },
  });
}
/** Deletes the game object of each firefly that leaves the world. */ // [!code ++]
export function bodies() { // [!code ++]
  return system<Firefly>()(requireAll("id"), { // [!code ++]
    onRemove(e) { // [!code ++]
      go.delete(e.id); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
function lampOf(e: Firefly): Url { // [!code ++]
  return msg.url(undefined, e.id, "light"); // [!code ++]
} // [!code ++]
/** Shows the light sprite of each lit firefly, as bright as it glows. */ // [!code ++]
export function lamps() { // [!code ++]
  return processingSystem<Firefly>()(requireAll("light"), { // [!code ++]
    onAdd(e) { // [!code ++]
      msg.post(lampOf(e), "enable"); // [!code ++]
    }, // [!code ++]
    onRemove(e) { // [!code ++]
      msg.post(lampOf(e), "disable"); // [!code ++]
    }, // [!code ++]
    process(e) { // [!code ++]
      go.set(lampOf(e), "tint.w", e.light); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
/** Dims each light, and takes it away when it runs out. */ // [!code ++]
export function fade() { // [!code ++]
  return processingSystem<Firefly>()(requireAll("light"), { // [!code ++]
    process(e, dt) { // [!code ++]
      e.light -= dt / 4; // [!code ++]
      if (e.light <= 0 && this.world !== undefined) { // [!code ++]
        const dark: Firefly = e; // [!code ++]
        dark.light = undefined; // [!code ++]
        changed(this.world, dark); // [!code ++]
      } // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`catchable`** shows the hint over a firefly while it can be caught, and hides it when it can't.
- **`beacons`** puts back the scale it changed when a firefly leaves.
- **`lamps`** shows the light sprite of each lit firefly and sets its alpha to the light.
- **`fade`** dims every light. When one runs out, it takes the `light` component away and calls [`changed`](./entity-systems.md#the-world), which tells each system to check the firefly again at the next update. `e` is typed with `light` present, so `fade` takes it away through a plain `Firefly`.
- **`drift`** takes a firefly that leaves the screen out of the world with [`removeEntity`](./entity-systems.md#the-world). `this.world` is the world the system belongs to.
- **`bodies`** holds every firefly and deletes its game object when it leaves the world. Every way out of the garden ends in `onRemove`, so this one system tidies up for all of them.

The script adds the new systems and catches a firefly on a click:

```ts step title="fireflies.ts"
import { defineScript } from "@defold-typescript/types";
import { add, addEntity, update, type World, world } from "@defold-typescript/types/ecs"; // [!code --]
import { // [!code ++]
  add, // [!code ++]
  addEntity, // [!code ++]
  refresh, // [!code ++]
  remove, // [!code ++]
  update, // [!code ++]
  type World, // [!code ++]
  world, // [!code ++]
} from "@defold-typescript/types/ecs"; // [!code ++]
import {
  beacons,
  bodies, // [!code ++]
  catchable,
  counter,
  drift,
  fade, // [!code ++]
  type Firefly,
  HEIGHT,
  lamps, // [!code ++]
  swarm,
// ...
      drift(),
      swarm(),
      lamps(), // [!code ++]
      beacons(),
      counter(),
      net,
      fade(), // [!code ++]
      bodies(), // [!code ++]
    );
// ...
      spawn(garden);
    }
    return { garden, net }; // [!code --]
    return { garden, net, caught: 0 }; // [!code ++]
  },
// ...
    const y = action.y ?? 0;
    if (action_id === TOUCH && action.pressed) {
      let picked: Firefly | undefined; // [!code ++]
      for (const f of self.garden.entities) {
        const near = math.abs(f.position.x - x) < 20 && math.abs(f.position.y - y) < 20;
        if (near) { // [!code --]
          const catchable = self.net.filter?.(self.net, f) === true; // [!code --]
          print(`${f.name}: ${catchable ? "you can catch it" : "too quick"}`); // [!code --]
        if (near && self.net.filter?.(self.net, f) === true) { // [!code ++]
          picked = f; // [!code ++]
        }
      }
      if (picked !== undefined) { // [!code ++]
        remove(self.garden, picked); // [!code ++]
        refresh(self.garden); // [!code ++]
        self.caught += 1; // [!code ++]
        label.set_text("/hud#caught", `${self.caught} caught`); // [!code ++]
      } // [!code ++]
    }
```

- **[`remove`](./entity-systems.md#the-world)** takes the caught firefly out of the world. It takes systems and entities alike.
- **[`refresh`](./entity-systems.md#the-world)** applies the waiting changes now. Without it, the caught firefly would stay in `self.garden.entities` until the next update, and a second click in the same frame could catch it again.
- **`fade` comes after `lamps`.** A firefly whose light runs out stays in the systems after `fade` until the next update, with `light` already `undefined`.

Add a label named `caught` to the `hud`.

### Try it

1. A lit firefly flies until its light runs out. Which hooks run, and when?
2. Why does `bodies` require `id`, which every firefly has?

> [!MORE] Answer
> 1. At the next update after `fade` takes its light, the firefly leaves `lamps`, whose `onRemove` hides its light sprite, and joins `catchable`, whose `onAdd` shows its hint. It leaves `fade` too, which has no hooks, and stays in `counter`, since it still flies.
> 2. To hold every firefly. It leaves `bodies` only by leaving the world, so its `onRemove` means "gone for good".

## 8. Before and after

A frame has more moments than `update`, and a system can hook into each of them. See [One frame](./entity-systems.md#one-frame) for the full order.

The awake counter writes its label every frame, though the number only changes when a firefly joins or leaves. [`onModify`](./entity-systems.md#one-frame) runs only then:

```ts step title="garden.ts"
export function counter() {
  return system<Firefly>()(requireAny("light", "flying"), {
    update() { // [!code --]
    onModify() { // [!code ++]
      label.set_text("/hud#awake", `${this.entities?.length ?? 0} awake`);
```

The world sets a system's [`modified`](./entity-systems.md#systemfields) flag when its entities change, runs `onModify` while the flag is set, and clears the flag after the system updates. A system that just joined counts as changed, so the label is right from the first frame. Lesson 10 sets the flag by hand.

A processing system has two more hooks, around its loop, and every system has two around the whole frame:

```ts step title="garden.ts"
        changed(this.world, dark);
      }
    },
  });
}
/** Tints `sprite` by how much light the fireflies give together. */ // [!code ++]
export function glowSum(sprite: Url) { // [!code ++]
  return processingSystem<Firefly>()(requireAll("light"), { // [!code ++]
    total: 0, // [!code ++]
    preProcess() { // [!code ++]
      this.total = 0; // [!code ++]
    }, // [!code ++]
    process(e) { // [!code ++]
      this.total += e.light; // [!code ++]
    }, // [!code ++]
    postProcess() { // [!code ++]
      go.set(sprite, "tint.w", math.min(1, this.total / 5)); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
/** Writes how long each world update takes, from before the first update to after the last. */ // [!code ++]
export function stopwatch() { // [!code ++]
  return system<Firefly>()({ // [!code ++]
    started: 0, // [!code ++]
    preWrap() { // [!code ++]
      this.started = os.clock(); // [!code ++]
    }, // [!code ++]
    postWrap() { // [!code ++]
      const spent = os.clock() - this.started; // [!code ++]
      label.set_text("/hud#time", `${math.floor(spent * 1000000)} microseconds`); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- [**`preProcess`**](./entity-systems.md#callbacks) runs before the loop and [**`postProcess`**](./entity-systems.md#callbacks) after it. `glowSum` empties its total, adds up every light, then tints a sprite by the result: the grass glows as brightly as the fireflies do together.
- [**`preWrap`**](./entity-systems.md#one-frame) runs before any system updates, and [**`postWrap`**](./entity-systems.md#one-frame) after they all have. `stopwatch` times the update pass between them.
- **`stopwatch` has no filter.** A system without one holds no entities and still runs every hook.

Add both to the world, with `stopwatch` first:

```ts step title="fireflies.ts"
  fade,
  type Firefly,
  glowSum, // [!code ++]
  HEIGHT,
  lamps,
  stopwatch, // [!code ++]
  swarm,
// ...
    const net = catchable();
    const garden = world<Firefly>(
      stopwatch(), // [!code ++]
      drift(),
      swarm(),
      lamps(),
      glowSum(msg.url("/grass#sprite")), // [!code ++]
      beacons(),
```

Add a `grass` game object with a sprite, and a `time` label to the `hud`.

### Try it

1. `stopwatch` sits first in the world. Does its `preWrap` run before the other systems' `preWrap`?
2. What would the grass do if `glowSum` had no `preProcess`?

> [!MORE] Answer
> 1. After them. `preWrap` runs from the last system to the first. It doesn't matter here: every `preWrap` runs before any `update`.
> 2. Grow brighter every frame until it is fully lit, and stay that way. The total would keep every frame's lights.

## 9. Every so often

Some work should happen now and then, not every frame. A system with an [`interval`](./entity-systems.md#one-frame) runs `update` once each time that much time has passed:

```ts step title="garden.ts"
  processingSystem,
  rejectAll,
  rejectAny, // [!code ++]
  removeEntity,
// ...
      label.set_text("/hud#time", `${math.floor(spent * 1000000)} microseconds`);
    },
  });
}
/** Lights one dark firefly at a time, at a pace that changes after each one. */ // [!code ++]
export function blink() { // [!code ++]
  return system<Firefly>()(rejectAny("light"), { // [!code ++]
    interval: 1, // [!code ++]
    update() { // [!code ++]
      const dark = this.entities; // [!code ++]
      if (dark !== undefined && dark.length > 0 && this.world !== undefined) { // [!code ++]
        const e = dark[math.random(0, dark.length - 1)]; // [!code ++]
        e.light = 1; // [!code ++]
        changed(this.world, e); // [!code ++]
      } // [!code ++]
      this.interval = 0.5 + math.random(); // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`interval: 1`** runs `update` once a second, with `1` as `dt`. On a slow frame it can run twice, and on most frames not at all.
- **`this.interval`** can change at any time. `blink` picks a new pause after each firefly it lights, so the garden never blinks in step.
- **`rejectAny("light")`** takes the dark fireflies, and `blink` lights one of them. Giving it a light is a change of components, so it calls `changed`.

The script adds `blink`, keeps it on `self`, and gets two new keys:

```ts step title="fireflies.ts"
  add,
  addEntity,
  changed, // [!code ++]
  refresh,
// ...
import {
  beacons,
  blink, // [!code ++]
  bodies,
// ...

const TOUCH = hash("touch");
const CLAP = hash("clap"); // [!code ++]
const BLINK = hash("blink"); // [!code ++]
let born = 0;
// ...
  init() {
    msg.post(".", "acquire_input_focus");
    const blinker = blink(); // [!code ++]
    const net = catchable();
// ...
      beacons(),
      counter(),
      blinker, // [!code ++]
      net,
// ...
      spawn(garden);
    }
    return { garden, net, caught: 0 }; // [!code --]
    return { garden, blinker, net, caught: 0 }; // [!code ++]
  },
// ...
        label.set_text("/hud#caught", `${self.caught} caught`);
      }
    } else if (action_id === CLAP && action.pressed) { // [!code ++]
      for (const f of self.garden.entities) { // [!code ++]
        f.light = undefined; // [!code ++]
        changed(self.garden, f); // [!code ++]
      } // [!code ++]
      self.blinker.bufferedTime = 0; // [!code ++]
    } else if (action_id === BLINK && action.pressed) { // [!code ++]
      self.blinker.active = !self.blinker.active; // [!code ++]
    }
```

- **`clap`** puts every light out. The world kept count of the time toward the next blink in [`bufferedTime`](./entity-systems.md#systemfields), and setting it to `0` makes the dark garden wait a full interval before the first new blink.
- **`blink`** turns blinking off and on with [`active`](./entity-systems.md#systemfields). An inactive system skips every hook of the frame, and it still gains and loses entities, so it is up to date when it starts again.

Add `clap` and `blink` actions on two keys.

### Try it

1. `interval` is 1 and a frame takes 2.5 seconds. How many times does `update` run, and what is `bufferedTime` afterward?
2. You turn `blink` off, and three lights go out. Does `blink` know when you turn it back on?

> [!MORE] Answer
> 1. Twice, and `bufferedTime` is `0.5`, which counts toward the next run.
> 2. Yes. The three dark fireflies joined `blink` while it was off, since an inactive system still gains entities.

## 10. In order

Systems run in order, but the entities inside one run in whatever order they joined. When order matters, sort them. [`sortedSystem`](./entity-systems.md#systems) and [`sortedProcessingSystem`](./entity-systems.md#systems) keep their entities in the order a `compare` function gives.

First, a label that names the brightest firefly:

```ts step title="garden.ts"
  requireAll,
  requireAny,
  sortedProcessingSystem, // [!code ++]
  sortedSystem, // [!code ++]
  system,
// ...
      this.interval = 0.5 + math.random();
    },
  });
}
/** Writes the name of the brightest firefly. */ // [!code ++]
export function byLight() { // [!code ++]
  return sortedSystem<Firefly>()(requireAll("light"), { // [!code ++]
    compare(a, b) { // [!code ++]
      return a.light > b.light; // [!code ++]
    }, // [!code ++]
    update() { // [!code ++]
      const brightest = this.entities?.[0]; // [!code ++]
      label.set_text("/hud#brightest", brightest === undefined ? "" : brightest.name); // [!code ++]
    }, // [!code ++]
    postWrap() { // [!code ++]
      this.modified = true; // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`compare(a, b)`** returns whether `a` goes before `b`. Brighter goes first, so `this.entities[0]` is the brightest.
- **A sorted system sorts when its entities change.** `fade` changes every light every frame without changing who is lit, so `byLight` sets `this.modified` in `postWrap` and sorts again at the next update. Set in `update`, the flag would be cleared at once, since the world clears it after each system's update.

Then the order the fireflies are drawn in. Lower on the screen means nearer, so a firefly lower down should cover one above it:

```ts step title="garden.ts"
      this.modified = true;
    },
  });
}
/** Draws the fireflies lower on the screen in front of the ones above them. */ // [!code ++]
export function depth() { // [!code ++]
  return sortedProcessingSystem<Firefly>()(requireAll("position"), { // [!code ++]
    nocache: false, // [!code ++]
    rank: 0, // [!code ++]
    compare(a, b) { // [!code ++]
      return a.position.y > b.position.y; // [!code ++]
    }, // [!code ++]
    preProcess() { // [!code ++]
      this.rank = 0; // [!code ++]
    }, // [!code ++]
    process(e) { // [!code ++]
      e.position.z = this.rank / 1000; // [!code ++]
      this.rank += 1; // [!code ++]
      go.set_position(e.position, e.id); // [!code ++]
    }, // [!code ++]
    postWrap() { // [!code ++]
      this.modified = true; // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- **`depth`** processes the fireflies from the top of the screen down and gives each a higher `z`, so the lower ones draw in front.
- **`nocache: false`** says what is always true of a sorted system: it keeps its list, because the order lives in that list. `nocache: true` fails to compile here. Lesson 12 shows what `nocache` does on a system that can have it.

The script adds both and uses `depth`'s order to pick which firefly a click catches:

```ts step title="fireflies.ts"
  blink,
  bodies,
  byLight, // [!code ++]
  catchable,
  counter,
  depth, // [!code ++]
  drift,
// ...
    const blinker = blink();
    const net = catchable();
    const layers = depth(); // [!code ++]
    print(`layers keeps its list: ${layers.nocache === false}`); // [!code ++]
    const garden = world<Firefly>(
// ...
      drift(),
      swarm(),
      layers, // [!code ++]
      lamps(),
      glowSum(msg.url("/grass#sprite")),
      byLight(), // [!code ++]
      beacons(),
// ...
      spawn(garden);
    }
    return { garden, blinker, net, caught: 0 }; // [!code --]
    return { garden, blinker, net, layers, caught: 0 }; // [!code ++]
  },
// ...
        const near = math.abs(f.position.x - x) < 20 && math.abs(f.position.y - y) < 20;
        if (near && self.net.filter?.(self.net, f) === true) {
          picked = f; // [!code --]
          if (picked === undefined || self.layers.sortDelegate?.(picked, f) === true) { // [!code ++]
            picked = f; // [!code ++]
          } // [!code ++]
        }
```

- **[`sortDelegate`](./entity-systems.md#systems)** is `compare` bound to the system, made at its first sort. The click keeps the catchable firefly that `depth` would draw last, the one in front.
- **`layers.nocache`** reads back the `false` from the definition. A sorted system's own `nocache` field is typed `false` as well, so even `layers.nocache === true` fails to compile.

Add a `brightest` label to the `hud`.

### Try it

1. Take `postWrap` out of `byLight`. What does the label show?
2. Two fireflies are at the same height. Which one does `depth` draw in front?

> [!MORE] Answer
> 1. The brightest firefly at the last moment one joined or left `byLight`, not the brightest now.
> 2. The one that came second in the list before the sort. The sort is stable: when neither goes first, they keep their order.

## 11. Systems come and go

A world can gain and lose systems while it runs, just as it does entities. Make a gust of wind that blows for four seconds and then leaves:

```ts step title="garden.ts"
  changed,
  filter,
  getSystemCount, // [!code ++]
  processingSystem,
// ...
  rejectAny,
  removeEntity,
  removeSystem, // [!code ++]
  requireAll,
// ...
      go.set_position(e.position, e.id);
    },
    postWrap() {
      this.modified = true;
    },
  });
}
/** Blows the flying fireflies sideways, with a sound, for four seconds after it joins a world. */ // [!code ++]
export function wind() { // [!code ++]
  return processingSystem<Firefly>()(requireAll("velocity", "flying"), { // [!code ++]
    left: 0, // [!code ++]
    onAddToWorld(world) { // [!code ++]
      this.left = 4; // [!code ++]
      msg.post("/wind#sound", "play_sound"); // [!code ++]
      print(`the wind is system ${this.index} of ${getSystemCount(world)}`); // [!code ++]
    }, // [!code ++]
    onRemoveFromWorld() { // [!code ++]
      msg.post("/wind#sound", "stop_sound"); // [!code ++]
    }, // [!code ++]
    preProcess(dt) { // [!code ++]
      this.left -= dt; // [!code ++]
      if (this.left <= 0 && this.world !== undefined) { // [!code ++]
        removeSystem(this.world, this); // [!code ++]
      } // [!code ++]
    }, // [!code ++]
    process(e, dt) { // [!code ++]
      e.velocity.x += 30 * dt; // [!code ++]
    }, // [!code ++]
  }); // [!code ++]
} // [!code ++]
```

- [**`onAddToWorld(world)`**](./entity-systems.md#callbacks) runs when the system joins a world, before it takes the world's entities. The wind starts its sound and prints where it stands: [`index`](./entity-systems.md#systemfields) is its 1-based place among the world's systems, and [`getSystemCount`](./entity-systems.md#the-world) says how many there are.
- [**`onRemoveFromWorld()`**](./entity-systems.md#callbacks) runs when the system leaves, after its entities left it. The wind stops its sound.
- [**`removeSystem`**](./entity-systems.md#the-world) takes the wind out when its time is up. Like every change, it waits for the next update.
- **`this.world`** is set while the system belongs to a world, and `undefined` once it has left.

The `gust` key adds the wind, or takes it away early:

```ts step title="fireflies.ts"
  add,
  addEntity,
  addSystem, // [!code ++]
  changed,
  refresh,
  remove,
  setSystemIndex, // [!code ++]
  update,
// ...
  WIDTH,
  watch,
  wind, // [!code ++]
} from "./garden";
// ...
const CLAP = hash("clap");
const BLINK = hash("blink");
const GUST = hash("gust"); // [!code ++]
let born = 0;
// ...
      spawn(garden);
    }
    return { garden, blinker, net, layers, caught: 0 }; // [!code --]
    return { garden, blinker, net, layers, gust: wind(), caught: 0 }; // [!code ++]
  },
// ...
    } else if (action_id === BLINK && action.pressed) {
      self.blinker.active = !self.blinker.active;
    } else if (action_id === GUST && action.pressed) { // [!code ++]
      if (self.gust.world === undefined) { // [!code ++]
        addSystem(self.garden, self.gust); // [!code ++]
        setSystemIndex(self.garden, self.gust, 1); // [!code ++]
      } else { // [!code ++]
        remove(self.garden, self.gust); // [!code ++]
      } // [!code ++]
    }
```

- [**`addSystem`**](./entity-systems.md#the-world) puts the wind at the end of the list, and it sets `world` at once, so a second press in the same frame sees it.
- [**`setSystemIndex`**](./entity-systems.md#the-world) moves it to the front, so it pushes the fireflies before `drift` moves them. It applies the waiting add first, and returns the old index.
- **`remove`** takes a system as easily as it takes a firefly.

Add a `wind` game object with a sound component named `sound`, and a `gust` action.

### Try it

1. What does the wind print when it joins?
2. You press `gust` twice in one second. What happens?

> [!MORE] Answer
> 1. `the wind is system 15 of 15`, with the watch system in the garden. `setSystemIndex` first applies the waiting add, which puts the wind at the end and runs `onAddToWorld` there, and only then moves it to the front.
> 2. The first press adds the wind, and the second takes it away at the next update, which runs its `onRemoveFromWorld` and stops the sound.

## 12. Counting and asking

Fireflies should flee from the pointer. Which ones are near it changes every frame, though no component changes, so a filter that reads the pointer would need `changed` on every firefly every frame. A [`nocache`](./entity-systems.md#one-frame) system skips that: it keeps no list, and runs its filter on every entity of the world at every update:

```ts step title="garden.ts"
      e.velocity.x += 30 * dt;
    },
  });
}
/** Pushes each flying firefly near `cursor` away from it. */ // [!code ++]
export function scare(cursor: Vector3) { // [!code ++]
  return processingSystem<Firefly>()( // [!code ++]
    (_system: unknown, e: Firefly) => // [!code ++]
      e.flying === true && // [!code ++]
      math.abs(e.position.x - cursor.x) < 60 && // [!code ++]
      math.abs(e.position.y - cursor.y) < 60, // [!code ++]
    { // [!code ++]
      nocache: true, // [!code ++]
      process(e, dt) { // [!code ++]
        if (e.velocity !== undefined) { // [!code ++]
          e.velocity.x += (e.position.x - cursor.x) * 4 * dt; // [!code ++]
          e.velocity.y += (e.position.y - cursor.y) * 4 * dt; // [!code ++]
        } // [!code ++]
      }, // [!code ++]
    }, // [!code ++]
  ); // [!code ++]
} // [!code ++]
```

- **The filter is a function** `(system, entity) => boolean`. Any function of that shape is a filter, and like a string filter it narrows nothing.
- **`nocache: true`** makes `scare` filter the whole world each update. It gets no `onAdd` or `onRemove`, since nothing joins or leaves.
- **`cursor`** is a vector the script updates as the pointer moves. The filter reads it each time it runs.

The script feeds the cursor, and a `census` key prints what the world holds:

```ts step title="fireflies.ts"
  addSystem,
  changed,
  getEntityCount, // [!code ++]
  getSystemCount, // [!code ++]
  hasEntity, // [!code ++]
  refresh,
// ...
  HEIGHT,
  lamps,
  scare, // [!code ++]
  stopwatch,
// ...
const BLINK = hash("blink");
const GUST = hash("gust");
const CENSUS = hash("census"); // [!code ++]
let born = 0;
// ...
  init() {
    msg.post(".", "acquire_input_focus");
    const cursor = vmath.vector3(); // [!code ++]
    const blinker = blink();
// ...
      drift(),
      swarm(),
      scare(cursor), // [!code ++]
      layers,
// ...
      add(garden, watcher);
    }
    let first: Firefly | undefined; // [!code ++]
    for (let i = 0; i < 20; i++) {
      spawn(garden); // [!code --]
      const f = spawn(garden); // [!code ++]
      first ??= f; // [!code ++]
    }
    return { garden, blinker, net, layers, gust: wind(), caught: 0 }; // [!code --]
    return { garden, cursor, first, blinker, net, layers, gust: wind(), caught: 0 }; // [!code ++]
  },
// ...
    const x = action.x ?? 0;
    const y = action.y ?? 0;
    if (action_id === TOUCH && action.pressed) { // [!code --]
    if (action_id === undefined) { // [!code ++]
      self.cursor.x = x; // [!code ++]
      self.cursor.y = y; // [!code ++]
    } else if (action_id === TOUCH && action.pressed) { // [!code ++]
      let picked: Firefly | undefined;
// ...
        remove(self.garden, self.gust);
      }
    } else if (action_id === CENSUS && action.pressed) { // [!code ++]
      print(`${getEntityCount(self.garden)} fireflies, ${getSystemCount(self.garden)} systems`); // [!code ++]
      for (const s of self.garden.systems) { // [!code ++]
        if (s.nocache === true) { // [!code ++]
          print(`system ${s.index}: no list (entities ${s.entities}, indices ${s.indices})`); // [!code ++]
        } else { // [!code ++]
          print(`system ${s.index}: ${s.entities?.length ?? 0} fireflies`); // [!code ++]
        } // [!code ++]
      } // [!code ++]
      if (self.first !== undefined) { // [!code ++]
        print(`${self.first.name} is ${hasEntity(self.garden, self.first) ? "here" : "gone"}`); // [!code ++]
      } // [!code ++]
    }
```

- **A mouse move** reaches `on_input` with no action, so `action_id === undefined` updates the cursor.
- [**`getEntityCount`**](./entity-systems.md#the-world) and **`getSystemCount`** count what the world holds, as of its last update.
- **`self.garden.systems`** lists the systems in order, and `self.garden.entities` the fireflies.
- **A system that keeps a list** has `entities` and [`indices`](./entity-systems.md#systemfields), which finds each entity's place in that list so a firefly can leave quickly. `scare` has neither, so the census prints `nil` for both.
- [**`hasEntity`**](./entity-systems.md#the-world) asks whether the world holds the first firefly, as of its last update.

Add a `census` action.

### Try it

1. Why doesn't `scare` require `flying` with `requireAll`, as `drift` does?
2. You catch the first firefly and press `census` in the same frame. Does it say `here` or `gone`?

> [!MORE] Answer
> 1. A filter is one function, and `scare`'s is the pointer test. It checks `flying` itself.
> 2. `gone`. Catching calls `refresh`, so the world no longer holds it.

## 13. A fresh night

Two last world controls. The first freezes every firefly in place while the lights keep blinking. `update` takes a third argument, a filter that picks the systems to run, called as `filter(world, system)` so the names it tests are fields of the system:

```ts step title="garden.ts"
export function drift() {
  return processingSystem<Firefly>()(requireAll("velocity", "flying"), {
    moving: true, // [!code ++]
    process(e, dt) {
// ...
export function swarm() {
  return system<Firefly>()(requireAll("velocity", "flying"), {
    moving: true, // [!code ++]
    update(dt) {
// ...
export function wind() {
  return processingSystem<Firefly>()(requireAll("velocity", "flying"), {
    moving: true, // [!code ++]
    left: 0,
// ...
      math.abs(e.position.y - cursor.y) < 60,
    {
      moving: true, // [!code ++]
      nocache: true,
```

Each system that moves fireflies gets a `moving` field. The script leaves those out while frozen, and adds a `dawn` key that starts the night over:

```ts step title="fireflies.ts"
  addSystem,
  changed,
  clearEntities, // [!code ++]
  clearSystems, // [!code ++]
  getEntityCount,
// ...
  hasEntity,
  refresh,
  rejectAny, // [!code ++]
  remove,
// ...
const GUST = hash("gust");
const CENSUS = hash("census");
const FREEZE = hash("freeze"); // [!code ++]
const DAWN = hash("dawn"); // [!code ++]
const STILL = rejectAny("moving"); // [!code ++]
let born = 0;
// ...
      first ??= f;
    }
    return { garden, cursor, first, blinker, net, layers, gust: wind(), caught: 0 }; // [!code --]
    return { garden, cursor, first, blinker, net, layers, gust: wind(), caught: 0, frozen: false }; // [!code ++]
  },
  update(self, dt) {
    update(self.garden, dt); // [!code --]
    update(self.garden, dt, self.frozen ? STILL : undefined); // [!code ++]
  },
// ...
        print(`${self.first.name} is ${hasEntity(self.garden, self.first) ? "here" : "gone"}`);
      }
    } else if (action_id === FREEZE && action.pressed) { // [!code ++]
      self.frozen = !self.frozen; // [!code ++]
    } else if (action_id === DAWN && action.pressed) { // [!code ++]
      clearEntities(self.garden); // [!code ++]
      for (let i = 0; i < 20; i++) { // [!code ++]
        spawn(self.garden); // [!code ++]
      } // [!code ++]
    }
  },
  final(self) { // [!code ++]
    clearSystems(self.garden); // [!code ++]
    refresh(self.garden); // [!code ++]
  }, // [!code ++]
});
```

- **`rejectAny("moving")`** takes every system without a `moving` field. Build it once, as `STILL` is, rather than every frame.
- **The left-out systems** skip `preWrap`, `update` and `postWrap`. `onModify` still runs on every active system.
- [**`clearEntities`**](./entity-systems.md#the-world) takes every firefly away at the next update, and `bodies` deletes their game objects. The twenty new ones join at that same update.
- [**`clearSystems`**](./entity-systems.md#the-world) in `final` makes every system leave, so each `onRemove` and `onRemoveFromWorld` runs: `bodies` deletes the fireflies, which the factory made and the garden's game object does not own, and the wind stops its sound. `refresh` applies it at once, since no update comes after `final`.

Add `freeze` and `dawn` actions.

### Try it

1. While frozen, does a resting firefly still light up?
2. You press `dawn` twice in one frame. How many fireflies are there at the next update?

> [!MORE] Answer
> 1. Yes. `blink`, `lamps` and `fade` have no `moving` field, so they still run.
> 2. Forty. `clearEntities` takes only the fireflies the world held at its last update, and both presses each add twenty new ones.

## 14. The world's own methods

Every function that takes the world first, except `hasEntity`, is also a method of the world. `update(garden, dt)` is `garden.update(dt)`, and in Lua it is `garden:update(dt)`, the way most tiny-ecs code is written. The [World reference](./entity-systems.md#world) lists them all. Use whichever reads better; the rest of this lesson uses methods.

Build a jar for the fireflies you catch. The jar is a second world, and building it is a review of everything so far:

```ts step title="fireflies.ts"
const FREEZE = hash("freeze");
const DAWN = hash("dawn");
const SHAKE = hash("shake"); // [!code ++]
const RELEASE = hash("release"); // [!code ++]
const EMPTY = hash("empty"); // [!code ++]
const STILL = rejectAny("moving");
// ...
      first ??= f;
    }
    return { garden, cursor, first, blinker, net, layers, gust: wind(), caught: 0, frozen: false }; // [!code --]
    const jar = world<Firefly>(); // [!code ++]
    jar.add(fade()); // [!code ++]
    return { // [!code ++]
      garden, // [!code ++]
      jar, // [!code ++]
      shine: glowSum(msg.url("/jar#sprite")), // [!code ++]
      cursor, // [!code ++]
      first, // [!code ++]
      blinker, // [!code ++]
      net, // [!code ++]
      layers, // [!code ++]
      gust: wind(), // [!code ++]
      frozen: false, // [!code ++]
    }; // [!code ++]
  },
  update(self, dt) {
    update(self.garden, dt, self.frozen ? STILL : undefined);
    self.jar.update(dt); // [!code ++]
  },
// ...
        remove(self.garden, picked);
        refresh(self.garden);
        self.caught += 1; // [!code --]
        label.set_text("/hud#caught", `${self.caught} caught`); // [!code --]
        if (self.shine.world === undefined) { // [!code ++]
          self.jar.addSystem(self.shine); // [!code ++]
          self.jar.setSystemIndex(self.shine, 1); // [!code ++]
          print(`the jar runs ${self.jar.getSystemCount()} systems`); // [!code ++]
        } // [!code ++]
        self.jar.addEntity(picked); // [!code ++]
        self.jar.refresh(); // [!code ++]
        label.set_text("/hud#jar", `${self.jar.getEntityCount()} in the jar`); // [!code ++]
      }
// ...
        spawn(self.garden);
      }
    } else if (action_id === SHAKE && action.pressed) { // [!code ++]
      for (const f of self.jar.entities) { // [!code ++]
        f.light = 1; // [!code ++]
        self.jar.changed(f); // [!code ++]
      } // [!code ++]
    } else if (action_id === RELEASE && action.pressed) { // [!code ++]
      const f = self.jar.entities[0]; // [!code ++]
      if (f !== undefined) { // [!code ++]
        self.jar.removeEntity(f); // [!code ++]
        self.jar.refresh(); // [!code ++]
        if (self.jar.getEntityCount() === 0) { // [!code ++]
          self.jar.removeSystem(self.shine); // [!code ++]
        } // [!code ++]
        spawn(self.garden); // [!code ++]
      } // [!code ++]
    } else if (action_id === EMPTY && action.pressed) { // [!code ++]
      self.jar.clearEntities(); // [!code ++]
      self.jar.remove(self.shine); // [!code ++]
    }
// ...
    clearSystems(self.garden);
    refresh(self.garden);
    self.jar.clearSystems(); // [!code ++]
    self.jar.refresh(); // [!code ++]
  },
```

- **`jar.add(fade())`** gives the jar its own `fade`: one system belongs to one world.
- **`self.jar.addSystem(self.shine)`** adds the jar's glow with the first catch, and `self.jar.setSystemIndex(self.shine, 1)` puts it before `fade`, which would put out a light it is about to read. `setSystemIndex` applies the waiting add, so `getSystemCount()` already counts the shine.
- **`self.jar.addEntity(picked)`** keeps the caught firefly, and `self.jar.refresh()` applies it so `getEntityCount()` is right in the label. The garden's `bodies` has deleted its game object; in the jar it is only a light.
- **`shake`** relights every firefly in the jar with `self.jar.changed(f)`.
- **`release`** takes one out with `self.jar.removeEntity(f)`, and a new firefly hatches in the garden. The last one out takes the shine with it, through `self.jar.removeSystem(self.shine)`.
- **`empty`** lets them all go with `self.jar.clearEntities()`, and `self.jar.remove(self.shine)` takes the shine.
- **`self.jar.update(dt)`** runs the jar every frame, and `final` clears its systems as it clears the garden's.

Add a `jar` game object with a sprite, a `jar` label to the `hud`, and `shake`, `release` and `empty` actions.

### Try it

1. What does the jar print the first time you catch a firefly?
2. Why does `release` call `refresh` before it counts?

> [!MORE] Answer
> 1. `the jar runs 2 systems`: `shine` and `fade`.
> 2. `getEntityCount` counts as of the last update, when the released firefly was still in the jar.

## 15. Watch it run

A world is easier to trust when you can see it work. [`inspect`](./entity-systems.md#debug-a-world) from `@defold-typescript/types/ecs/debug` logs every firefly that joins or leaves a system, and every `onModify`, and its [`draw`](./entity-systems.md#debug-a-world) shows each system's count above a game object:

```ts step title="fireflies.ts"
  world,
} from "@defold-typescript/types/ecs";
import { inspect } from "@defold-typescript/types/ecs/debug"; // [!code ++]
import {
// ...
      gust: wind(),
      frozen: false,
      inspector: inspect(garden, "garden"), // [!code ++]
    };
// ...
    update(self.garden, dt, self.frozen ? STILL : undefined);
    self.jar.update(dt);
    self.inspector.draw("."); // [!code ++]
  },
```

- **`inspect(garden, "garden")`** prints one line now, then one line for each change the world applies, such as `ecs garden frame 12: system 9 adds entity 4, holds 7`.
- **`self.inspector.draw(".")`** draws the label and each system's entity count above the garden's game object, `-` for `scare`, which keeps no list.
- **Systems** are named by their index and **entities** by the order the inspector first saw them.
- **In a release build** both do nothing, so the calls can stay.

### Try it

1. The console prints an `onModify` line for two systems at every frame. Which ones, and why?
2. A flying firefly's light runs out. Which systems print an `adds` or a `removes` line for it?
3. Why does the frame number in the log only go up while `draw` is called?

> [!MORE] Answer
> 1. `layers` and `byLight`. A sorted system's `onModify` is its sort, and both set `modified` in `postWrap`, so both sort at every update.
> 2. `lamps`, `glowSum`, `byLight` and `fade` print `removes`, and `blink` and `catchable` print `adds`.
> 3. The inspector counts frames by its own `draw` calls, so it tracks `update` when you draw every frame.

## 16. A machine in each firefly

So far a firefly rests or flies forever, as it was born. A [state machine](./state-machines.md) can decide that: fly for a while, rest for a while, and get caught from either. The bridge in `@defold-typescript/types/ecs/hsm` lets the machine's states set components, so each state moves the firefly in and out of systems. See [ecs and hsm together](./ecs-and-hsm.md) for the whole bridge.

Make `firefly-machine.ts`:

```ts step title="firefly-machine.ts"
import type { World } from "@defold-typescript/types/ecs";
import { leave, member } from "@defold-typescript/types/ecs/hsm";
import { defineMachine } from "@defold-typescript/types/hsm";
import type { Firefly } from "./garden";

export type FireflyEvent = { type: "CATCH" };

export function fireflyMachine(garden: World<Firefly>) {
  return defineMachine<Firefly, FireflyEvent>()({
    initial: "/flying",
    states: {
      flying: {
        ...member(garden, "flying"),
        after: { 8: "/resting" },
        on: { CATCH: "/caught" },
      },
      resting: {
        after: { 4: "/flying" },
        on: { CATCH: "/caught" },
      },
      caught: {
        enter: leave(garden),
      },
    },
  });
}

export type FireflyMachine = ReturnType<typeof fireflyMachine>;
```

- [**`member(garden, "flying")`**](./ecs-and-hsm.md#join-systems-from-a-state-with-member) returns an `enter` hook that sets `flying` and an `exit` hook that takes it away, both calling `changed` for you. Spread into `flying`, they make the firefly join `drift`, `swarm` and the rest while it flies.
- [**`leave(garden)`**](./ecs-and-hsm.md#add-and-remove-the-entity-with-join-and-leave) is a hook that takes the firefly out of the world. A caught firefly leaves the garden.
- **`after`** moves on after a few seconds, as the [state machine tutorial](./state-machines-tutorial.md#8-time-and-every-frame-checks) shows.

The firefly carries its machine as a component:

```ts step title="garden.ts"
  tryFilter,
} from "@defold-typescript/types/ecs";
import type { MachineInstance } from "@defold-typescript/types/hsm"; // [!code ++]
import type { FireflyEvent } from "./firefly-machine"; // [!code ++]

// ...
  light?: number;
  flying?: true;
  fsm?: MachineInstance<Firefly, FireflyEvent>; // [!code ++]
}
```

The script starts a machine for each new firefly, ticks every machine from the world, and sends `CATCH` in place of removing the firefly:

```ts step title="fireflies.ts"
} from "@defold-typescript/types/ecs";
import { inspect } from "@defold-typescript/types/ecs/debug";
import { tickMachines } from "@defold-typescript/types/ecs/hsm"; // [!code ++]
import { type FireflyMachine, fireflyMachine } from "./firefly-machine"; // [!code ++]
import {
// ...
let born = 0;

function spawn(garden: World<Firefly>): Firefly | undefined { // [!code --]
function spawn(garden: World<Firefly>, machine: FireflyMachine): Firefly | undefined { // [!code ++]
  const position = vmath.vector3(math.random(0, WIDTH), math.random(0, HEIGHT), 0);
// ...
  }
  born += 1;
  return addEntity(garden, { // [!code --]
  const f: Firefly = addEntity(garden, { // [!code ++]
    name: `firefly ${born}`,
// ...
    velocity: vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0),
    light: math.random() < 0.5 ? 1 : undefined,
    flying: math.random() < 0.5 ? true : undefined, // [!code --]
  });
  f.fsm = machine.start(f); // [!code ++]
  return f; // [!code ++]
}
// ...
    const garden = world<Firefly>(
      stopwatch(),
      tickMachines<Firefly>("fsm"), // [!code ++]
      drift(),
// ...
      add(garden, watcher);
    }
    const machine = fireflyMachine(garden); // [!code ++]
    let first: Firefly | undefined;
    for (let i = 0; i < 20; i++) {
      const f = spawn(garden); // [!code --]
      const f = spawn(garden, machine); // [!code ++]
      first ??= f;
// ...
      jar,
      shine: glowSum(msg.url("/jar#sprite")),
      machine, // [!code ++]
      cursor,
// ...
      }
      if (picked !== undefined) {
        remove(self.garden, picked); // [!code --]
        picked.fsm?.send({ type: "CATCH" }); // [!code ++]
        refresh(self.garden);
// ...
      clearEntities(self.garden);
      for (let i = 0; i < 20; i++) {
        spawn(self.garden); // [!code --]
        spawn(self.garden, self.machine); // [!code ++]
      }
// ...
          self.jar.removeSystem(self.shine);
        }
        spawn(self.garden); // [!code --]
        spawn(self.garden, self.machine); // [!code ++]
      }
```

- [**`tickMachines<Firefly>("fsm")`**](./ecs-and-hsm.md#tick-machines-from-the-world-with-tickmachines) is a system that calls `update(dt)` on each firefly's machine, so its timers run with the world. A change its hooks make shows at the next update. It has no `moving` field, so the machines keep time while the garden is frozen.
- **`spawn`** starts the machine, which enters `flying` at once and sets the flag before the firefly joins. `spawn` no longer sets `flying` itself: the machine decides.
- **`picked.fsm?.send({ type: "CATCH" })`** moves the machine to `caught`, whose hook takes the firefly out of the garden; `refresh` applies it.

An object spread compiles to a helper from `lualib_bundle`, so the build now writes that file too. The flying state also needs code of its own: a new heading each time it takes off. Name the two hooks instead, and call `enter` from a hook of your own. A released firefly can then fly back:

```ts step title="firefly-machine.ts"
import type { World } from "@defold-typescript/types/ecs";
import { leave, member } from "@defold-typescript/types/ecs/hsm"; // [!code --]
import { join, leave, member } from "@defold-typescript/types/ecs/hsm"; // [!code ++]
import { defineMachine } from "@defold-typescript/types/hsm";
import type { Firefly } from "./garden";

export type FireflyEvent = { type: "CATCH" }; // [!code --]
export type FireflyEvent = { type: "CATCH" } | { type: "RELEASE" }; // [!code ++]

export function fireflyMachine(garden: World<Firefly>) {
  const flight = member(garden, "flying"); // [!code ++]
  return defineMachine<Firefly, FireflyEvent>()({
// ...
    states: {
      flying: {
        ...member(garden, "flying"), // [!code --]
        enter: (ctx) => { // [!code ++]
          flight.enter(ctx); // [!code ++]
          ctx.velocity = vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0); // [!code ++]
        }, // [!code ++]
        exit: flight.exit, // [!code ++]
        after: { 8: "/resting" },
// ...
      caught: {
        enter: leave(garden),
        exit: join(garden), // [!code ++]
        on: { RELEASE: "/flying" }, // [!code ++]
      },
```

- **[`flight.enter(ctx)`](./ecs-and-hsm.md#join-systems-from-a-state-with-member)** sets `flying` as the spread did, and the new heading follows it. `exit: flight.exit` takes the flag away on landing.
- [**`join(garden)`**](./ecs-and-hsm.md#add-and-remove-the-entity-with-join-and-leave) is the opposite of `leave`: leaving `caught` puts the firefly back in the garden.

The script gives a released firefly a new game object and sends `RELEASE`:

```ts step title="fireflies.ts"
          self.jar.removeSystem(self.shine);
        }
        spawn(self.garden, self.machine); // [!code --]
        const id = factory.create("#factory", vmath.vector3(880, 80, 0)); // [!code ++]
        if (id !== undefined) { // [!code ++]
          f.id = id; // [!code ++]
          f.position.x = 880; // [!code ++]
          f.position.y = 80; // [!code ++]
          f.fsm?.send({ type: "RELEASE" }); // [!code ++]
        } // [!code ++]
      }
```

The garden now uses every function and every field of `ecs`.

> [!MORE] The finished garden
>
> ```ts step title="garden.ts"
> import {
>   changed,
>   filter,
>   getSystemCount,
>   processingSystem,
>   rejectAll,
>   rejectAny,
>   removeEntity,
>   removeSystem,
>   requireAll,
>   requireAny,
>   sortedProcessingSystem,
>   sortedSystem,
>   system,
>   tryFilter,
> } from "@defold-typescript/types/ecs";
> import type { MachineInstance } from "@defold-typescript/types/hsm";
> import type { FireflyEvent } from "./firefly-machine";
>
> export interface Firefly {
>   readonly name: string;
>   id: Hash;
>   readonly position: Vector3;
>   velocity?: Vector3;
>   light?: number;
>   flying?: true;
>   fsm?: MachineInstance<Firefly, FireflyEvent>;
> }
>
> export const WIDTH = 960;
> export const HEIGHT = 640;
>
> /** Moves each flying firefly. */
> export function drift() {
>   return processingSystem<Firefly>()(requireAll("velocity", "flying"), {
>     moving: true,
>     process(e, dt) {
>       e.position.x += e.velocity.x * dt;
>       e.position.y += e.velocity.y * dt;
>       go.set_position(e.position, e.id);
>       const gone =
>         e.position.x < 0 || e.position.x > WIDTH || e.position.y < 0 || e.position.y > HEIGHT;
>       if (gone && this.world !== undefined) {
>         removeEntity(this.world, e);
>       }
>     },
>   });
> }
>
> /** Steers each flying firefly toward the middle of the swarm. */
> export function swarm() {
>   return system<Firefly>()(requireAll("velocity", "flying"), {
>     moving: true,
>     update(dt) {
>       const flock = this.entities;
>       if (flock === undefined || flock.length === 0) {
>         return;
>       }
>       let x = 0;
>       let y = 0;
>       for (const e of flock) {
>         x += e.position.x;
>         y += e.position.y;
>       }
>       x /= flock.length;
>       y /= flock.length;
>       for (const e of flock) {
>         if (e.velocity !== undefined) {
>           e.velocity.x += (x - e.position.x) * 0.2 * dt;
>           e.velocity.y += (y - e.position.y) * 0.2 * dt;
>         }
>       }
>     },
>   });
> }
> /** Writes how many fireflies are awake: lit, or flying. */
> export function counter() {
>   return system<Firefly>()(requireAny("light", "flying"), {
>     onModify() {
>       label.set_text("/hud#awake", `${this.entities?.length ?? 0} awake`);
>     },
>   });
> }
> /** Holds the fireflies you can catch: each one that is dark or not flying. */
> export function catchable() {
>   return system<Firefly>()(rejectAll("light", "flying"), {
>     onAdd(e) {
>       msg.post(msg.url(undefined, e.id, "hint"), "enable");
>     },
>     onRemove(e) {
>       msg.post(msg.url(undefined, e.id, "hint"), "disable");
>     },
>   });
> }
> /** Swells each lit firefly that sits still, as much as it glows. */
> export function beacons() {
>   return processingSystem<Firefly>()(filter("light&!flying"), {
>     onRemove(e) {
>       go.set_scale(1, e.id);
>     },
>     process(e) {
>       if (e.light !== undefined) {
>         go.set_scale(1 + e.light / 2, e.id);
>       }
>     },
>   });
> }
> /** Counts the fireflies `pattern` takes, or returns `undefined` for a pattern that does not parse. */
> export function watch(pattern: string) {
>   const parsed = tryFilter(pattern);
>   if (!parsed.ok) {
>     print(`garden.watch: ${parsed.error}`);
>     return undefined;
>   }
>   return system<Firefly>()(parsed.filter, {
>     update() {
>       label.set_text("/hud#watch", `${pattern}: ${this.entities?.length ?? 0}`);
>     },
>   });
> }
> /** Deletes the game object of each firefly that leaves the world. */
> export function bodies() {
>   return system<Firefly>()(requireAll("id"), {
>     onRemove(e) {
>       go.delete(e.id);
>     },
>   });
> }
> function lampOf(e: Firefly): Url {
>   return msg.url(undefined, e.id, "light");
> }
> /** Shows the light sprite of each lit firefly, as bright as it glows. */
> export function lamps() {
>   return processingSystem<Firefly>()(requireAll("light"), {
>     onAdd(e) {
>       msg.post(lampOf(e), "enable");
>     },
>     onRemove(e) {
>       msg.post(lampOf(e), "disable");
>     },
>     process(e) {
>       go.set(lampOf(e), "tint.w", e.light);
>     },
>   });
> }
> /** Dims each light, and takes it away when it runs out. */
> export function fade() {
>   return processingSystem<Firefly>()(requireAll("light"), {
>     process(e, dt) {
>       e.light -= dt / 4;
>       if (e.light <= 0 && this.world !== undefined) {
>         const dark: Firefly = e;
>         dark.light = undefined;
>         changed(this.world, dark);
>       }
>     },
>   });
> }
> /** Tints `sprite` by how much light the fireflies give together. */
> export function glowSum(sprite: Url) {
>   return processingSystem<Firefly>()(requireAll("light"), {
>     total: 0,
>     preProcess() {
>       this.total = 0;
>     },
>     process(e) {
>       this.total += e.light;
>     },
>     postProcess() {
>       go.set(sprite, "tint.w", math.min(1, this.total / 5));
>     },
>   });
> }
> /** Writes how long each world update takes, from before the first update to after the last. */
> export function stopwatch() {
>   return system<Firefly>()({
>     started: 0,
>     preWrap() {
>       this.started = os.clock();
>     },
>     postWrap() {
>       const spent = os.clock() - this.started;
>       label.set_text("/hud#time", `${math.floor(spent * 1000000)} microseconds`);
>     },
>   });
> }
> /** Lights one dark firefly at a time, at a pace that changes after each one. */
> export function blink() {
>   return system<Firefly>()(rejectAny("light"), {
>     interval: 1,
>     update() {
>       const dark = this.entities;
>       if (dark !== undefined && dark.length > 0 && this.world !== undefined) {
>         const e = dark[math.random(0, dark.length - 1)];
>         e.light = 1;
>         changed(this.world, e);
>       }
>       this.interval = 0.5 + math.random();
>     },
>   });
> }
> /** Writes the name of the brightest firefly. */
> export function byLight() {
>   return sortedSystem<Firefly>()(requireAll("light"), {
>     compare(a, b) {
>       return a.light > b.light;
>     },
>     update() {
>       const brightest = this.entities?.[0];
>       label.set_text("/hud#brightest", brightest === undefined ? "" : brightest.name);
>     },
>     postWrap() {
>       this.modified = true;
>     },
>   });
> }
> /** Draws the fireflies lower on the screen in front of the ones above them. */
> export function depth() {
>   return sortedProcessingSystem<Firefly>()(requireAll("position"), {
>     nocache: false,
>     rank: 0,
>     compare(a, b) {
>       return a.position.y > b.position.y;
>     },
>     preProcess() {
>       this.rank = 0;
>     },
>     process(e) {
>       e.position.z = this.rank / 1000;
>       this.rank += 1;
>       go.set_position(e.position, e.id);
>     },
>     postWrap() {
>       this.modified = true;
>     },
>   });
> }
> /** Blows the flying fireflies sideways, with a sound, for four seconds after it joins a world. */
> export function wind() {
>   return processingSystem<Firefly>()(requireAll("velocity", "flying"), {
>     moving: true,
>     left: 0,
>     onAddToWorld(world) {
>       this.left = 4;
>       msg.post("/wind#sound", "play_sound");
>       print(`the wind is system ${this.index} of ${getSystemCount(world)}`);
>     },
>     onRemoveFromWorld() {
>       msg.post("/wind#sound", "stop_sound");
>     },
>     preProcess(dt) {
>       this.left -= dt;
>       if (this.left <= 0 && this.world !== undefined) {
>         removeSystem(this.world, this);
>       }
>     },
>     process(e, dt) {
>       e.velocity.x += 30 * dt;
>     },
>   });
> }
> /** Pushes each flying firefly near `cursor` away from it. */
> export function scare(cursor: Vector3) {
>   return processingSystem<Firefly>()(
>     (_system: unknown, e: Firefly) =>
>       e.flying === true &&
>       math.abs(e.position.x - cursor.x) < 60 &&
>       math.abs(e.position.y - cursor.y) < 60,
>     {
>       moving: true,
>       nocache: true,
>       process(e, dt) {
>         if (e.velocity !== undefined) {
>           e.velocity.x += (e.position.x - cursor.x) * 4 * dt;
>           e.velocity.y += (e.position.y - cursor.y) * 4 * dt;
>         }
>       },
>     },
>   );
> }
> ```
>
> ```ts step title="fireflies.ts"
> import { defineScript } from "@defold-typescript/types";
> import {
>   add,
>   addEntity,
>   addSystem,
>   changed,
>   clearEntities,
>   clearSystems,
>   getEntityCount,
>   getSystemCount,
>   hasEntity,
>   refresh,
>   rejectAny,
>   remove,
>   setSystemIndex,
>   update,
>   type World,
>   world,
> } from "@defold-typescript/types/ecs";
> import { inspect } from "@defold-typescript/types/ecs/debug";
> import { tickMachines } from "@defold-typescript/types/ecs/hsm";
> import { type FireflyMachine, fireflyMachine } from "./firefly-machine";
> import {
>   beacons,
>   blink,
>   bodies,
>   byLight,
>   catchable,
>   counter,
>   depth,
>   drift,
>   fade,
>   type Firefly,
>   glowSum,
>   HEIGHT,
>   lamps,
>   scare,
>   stopwatch,
>   swarm,
>   WIDTH,
>   watch,
>   wind,
> } from "./garden";
>
> const TOUCH = hash("touch");
> const CLAP = hash("clap");
> const BLINK = hash("blink");
> const GUST = hash("gust");
> const CENSUS = hash("census");
> const FREEZE = hash("freeze");
> const DAWN = hash("dawn");
> const SHAKE = hash("shake");
> const RELEASE = hash("release");
> const EMPTY = hash("empty");
> const STILL = rejectAny("moving");
> let born = 0;
>
> function spawn(garden: World<Firefly>, machine: FireflyMachine): Firefly | undefined {
>   const position = vmath.vector3(math.random(0, WIDTH), math.random(0, HEIGHT), 0);
>   const id = factory.create("#factory", position);
>   if (id === undefined) {
>     return undefined;
>   }
>   born += 1;
>   const f: Firefly = addEntity(garden, {
>     name: `firefly ${born}`,
>     id,
>     position,
>     velocity: vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0),
>     light: math.random() < 0.5 ? 1 : undefined,
>   });
>   f.fsm = machine.start(f);
>   return f;
> }
>
> export default defineScript({
>   init() {
>     msg.post(".", "acquire_input_focus");
>     const cursor = vmath.vector3();
>     const blinker = blink();
>     const net = catchable();
>     const layers = depth();
>     print(`layers keeps its list: ${layers.nocache === false}`);
>     const garden = world<Firefly>(
>       stopwatch(),
>       tickMachines<Firefly>("fsm"),
>       drift(),
>       swarm(),
>       scare(cursor),
>       layers,
>       lamps(),
>       glowSum(msg.url("/grass#sprite")),
>       byLight(),
>       beacons(),
>       counter(),
>       blinker,
>       net,
>       fade(),
>       bodies(),
>     );
>     const watcher = watch(sys.get_config_string("garden.watch", "light&flying"));
>     if (watcher !== undefined) {
>       add(garden, watcher);
>     }
>     const machine = fireflyMachine(garden);
>     let first: Firefly | undefined;
>     for (let i = 0; i < 20; i++) {
>       const f = spawn(garden, machine);
>       first ??= f;
>     }
>     const jar = world<Firefly>();
>     jar.add(fade());
>     return {
>       garden,
>       jar,
>       shine: glowSum(msg.url("/jar#sprite")),
>       machine,
>       cursor,
>       first,
>       blinker,
>       net,
>       layers,
>       gust: wind(),
>       frozen: false,
>       inspector: inspect(garden, "garden"),
>     };
>   },
>   update(self, dt) {
>     update(self.garden, dt, self.frozen ? STILL : undefined);
>     self.jar.update(dt);
>     self.inspector.draw(".");
>   },
>   on_input(self, action_id, action) {
>     const x = action.x ?? 0;
>     const y = action.y ?? 0;
>     if (action_id === undefined) {
>       self.cursor.x = x;
>       self.cursor.y = y;
>     } else if (action_id === TOUCH && action.pressed) {
>       let picked: Firefly | undefined;
>       for (const f of self.garden.entities) {
>         const near = math.abs(f.position.x - x) < 20 && math.abs(f.position.y - y) < 20;
>         if (near && self.net.filter?.(self.net, f) === true) {
>           if (picked === undefined || self.layers.sortDelegate?.(picked, f) === true) {
>             picked = f;
>           }
>         }
>       }
>       if (picked !== undefined) {
>         picked.fsm?.send({ type: "CATCH" });
>         refresh(self.garden);
>         if (self.shine.world === undefined) {
>           self.jar.addSystem(self.shine);
>           self.jar.setSystemIndex(self.shine, 1);
>           print(`the jar runs ${self.jar.getSystemCount()} systems`);
>         }
>         self.jar.addEntity(picked);
>         self.jar.refresh();
>         label.set_text("/hud#jar", `${self.jar.getEntityCount()} in the jar`);
>       }
>     } else if (action_id === CLAP && action.pressed) {
>       for (const f of self.garden.entities) {
>         f.light = undefined;
>         changed(self.garden, f);
>       }
>       self.blinker.bufferedTime = 0;
>     } else if (action_id === BLINK && action.pressed) {
>       self.blinker.active = !self.blinker.active;
>     } else if (action_id === GUST && action.pressed) {
>       if (self.gust.world === undefined) {
>         addSystem(self.garden, self.gust);
>         setSystemIndex(self.garden, self.gust, 1);
>       } else {
>         remove(self.garden, self.gust);
>       }
>     } else if (action_id === CENSUS && action.pressed) {
>       print(`${getEntityCount(self.garden)} fireflies, ${getSystemCount(self.garden)} systems`);
>       for (const s of self.garden.systems) {
>         if (s.nocache === true) {
>           print(`system ${s.index}: no list (entities ${s.entities}, indices ${s.indices})`);
>         } else {
>           print(`system ${s.index}: ${s.entities?.length ?? 0} fireflies`);
>         }
>       }
>       if (self.first !== undefined) {
>         print(`${self.first.name} is ${hasEntity(self.garden, self.first) ? "here" : "gone"}`);
>       }
>     } else if (action_id === FREEZE && action.pressed) {
>       self.frozen = !self.frozen;
>     } else if (action_id === DAWN && action.pressed) {
>       clearEntities(self.garden);
>       for (let i = 0; i < 20; i++) {
>         spawn(self.garden, self.machine);
>       }
>     } else if (action_id === SHAKE && action.pressed) {
>       for (const f of self.jar.entities) {
>         f.light = 1;
>         self.jar.changed(f);
>       }
>     } else if (action_id === RELEASE && action.pressed) {
>       const f = self.jar.entities[0];
>       if (f !== undefined) {
>         self.jar.removeEntity(f);
>         self.jar.refresh();
>         if (self.jar.getEntityCount() === 0) {
>           self.jar.removeSystem(self.shine);
>         }
>         const id = factory.create("#factory", vmath.vector3(880, 80, 0));
>         if (id !== undefined) {
>           f.id = id;
>           f.position.x = 880;
>           f.position.y = 80;
>           f.fsm?.send({ type: "RELEASE" });
>         }
>       }
>     } else if (action_id === EMPTY && action.pressed) {
>       self.jar.clearEntities();
>       self.jar.remove(self.shine);
>     }
>   },
>   final(self) {
>     clearSystems(self.garden);
>     refresh(self.garden);
>     self.jar.clearSystems();
>     self.jar.refresh();
>   },
> });
> ```
>
> ```ts step title="firefly-machine.ts"
> import type { World } from "@defold-typescript/types/ecs";
> import { join, leave, member } from "@defold-typescript/types/ecs/hsm";
> import { defineMachine } from "@defold-typescript/types/hsm";
> import type { Firefly } from "./garden";
>
> export type FireflyEvent = { type: "CATCH" } | { type: "RELEASE" };
>
> export function fireflyMachine(garden: World<Firefly>) {
>   const flight = member(garden, "flying");
>   return defineMachine<Firefly, FireflyEvent>()({
>     initial: "/flying",
>     states: {
>       flying: {
>         enter: (ctx) => {
>           flight.enter(ctx);
>           ctx.velocity = vmath.vector3(math.random(-40, 40), math.random(-40, 40), 0);
>         },
>         exit: flight.exit,
>         after: { 8: "/resting" },
>         on: { CATCH: "/caught" },
>       },
>       resting: {
>         after: { 4: "/flying" },
>         on: { CATCH: "/caught" },
>       },
>       caught: {
>         enter: leave(garden),
>         exit: join(garden),
>         on: { RELEASE: "/flying" },
>       },
>     },
>   });
> }
>
> export type FireflyMachine = ReturnType<typeof fireflyMachine>;
> ```

### Try it

1. A firefly is caught while it rests. Which hooks run?
2. Why does `release` set the firefly's `id` before it sends `RELEASE`?

> [!MORE] Answer
> 1. `resting` has none, so only `caught`'s `enter`, which takes the firefly out of the garden. `flying` was already left, and its `exit` took the flag away then.
> 2. `bodies` deleted the old game object when the firefly was caught. Leaving `caught` adds the firefly to the garden, and every system that moves or lights it needs a game object to work on.
