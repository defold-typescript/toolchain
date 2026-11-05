---
toc-title: ecs and hsm together
---
# ecs and hsm together

A state machine decides what one object is doing; an [entity system](./entity-systems.md) does the same work for many objects every frame. The bridge in `@defold-typescript/types/ecs/hsm` joins the two on one table: the table is an entity of a world and the `ctx` of a [state machine](./state-machines.md), so a state's hooks move the entity in and out of systems, and nothing is copied.

The bridge imports nothing from `hsm`, and `hsm` imports nothing from `ecs`. Its hooks are typed by the entity alone, so a project that uses only one of the two libraries ships no Lua from the other.

## One table, two roles

The entity type holds the components the systems read, the optional flags a state sets, and the machine itself:

```ts title="critters.ts"
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
import { join, leave, member, tickMachines } from "@defold-typescript/types/ecs/hsm";
import { defineMachine, type MachineInstance } from "@defold-typescript/types/hsm";

type CritterEvent = { type: "SCARE" } | { type: "CAUGHT" };

export interface Critter {
  readonly id: Hash;
  readonly position: Vector3;
  readonly speed: number;
  wandering?: true;
  fleeing?: true;
  fsm?: MachineInstance<Critter, CritterEvent>;
}

export const herd = world<Critter>(
  tickMachines<Critter>("fsm"),
  processingSystem<Critter>()(requireAll("wandering"), {
    process(e, dt) {
      e.position.x += e.speed * dt;
      go.set_position(e.position, e.id);
    },
  }),
  processingSystem<Critter>()(requireAll("fleeing"), {
    process(e, dt) {
      e.position.x -= 3 * e.speed * dt;
      go.set_position(e.position, e.id);
    },
  }),
);

export const critterMachine = defineMachine<Critter, CritterEvent>()({
  initial: "/wander",
  enter: join(herd),
  states: {
    wander: { ...member(herd, "wandering"), on: { SCARE: "/flee" } },
    flee: {
      ...member(herd, "fleeing"),
      after: { 2: "/wander" },
      on: { CAUGHT: "/caught" },
    },
    caught: { enter: leave(herd) },
  },
});

export function spawnCritter(id: Hash): Critter {
  const critter: Critter = { id, position: go.get_position(id), speed: 40 };
  critter.fsm = critterMachine.start(critter);
  return critter;
}
```

- The world and the machine live in a plain module, so they are one world and one definition for every script that imports them. One script updates the world; see [Run a world from a script](./entity-systems.md#run-a-world-from-a-script).
- The hooks take the world when the machine is defined, so a machine definition works with one world.

## Join systems from a state with `member`

`member(world, key)` returns an `enter` and an `exit` hook, spread into a state's config. Entering the state sets the optional component `key` to `true`, and leaving it clears the component, so the entity joins and leaves the systems that require it at the world's next `refresh` or `update`.

- `key` must be an optional field typed `true`. `member(world, key, value)` sets any other optional component to `value` instead.
- The hooks call `changed` only while the world holds the entity. A pending add reads the components when it applies, and `changed` on an entity the world no longer holds would add it back.
- A state that spreads `member` takes its `enter` and `exit` from it. Write a hook of your own on a parent or child state.
- An object spread compiles to a helper from `lualib_bundle`, so the build writes that file too. Name the two hooks instead to keep a module free of it:

```ts title="no-spread.ts"
import { world } from "@defold-typescript/types/ecs";
import { member } from "@defold-typescript/types/ecs/hsm";
import { defineMachine } from "@defold-typescript/types/hsm";

interface Mole {
  readonly name: string;
  up?: true;
}

const moles = world<Mole>();
const up = member(moles, "up");

export const moleMachine = defineMachine<Mole, { type: "HIT" }>()({
  initial: "/up",
  states: {
    up: { enter: up.enter, exit: up.exit, on: { HIT: "/down" } },
    down: {},
  },
});
```

```ts title="target.ts"
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
import { member } from "@defold-typescript/types/ecs/hsm";
import { defineMachine } from "@defold-typescript/types/hsm";

interface Hunter {
  readonly name: string;
  target?: Url;
}

const hunters = world<Hunter>(
  processingSystem<Hunter>()(requireAll("target"), {
    process(e) {
      msg.post(e.target, "ping");
    },
  }),
);

export function hunt(target: Url) {
  return defineMachine<Hunter, { type: "SPOT" } | { type: "LOSE" }>()({
    initial: "/idle",
    states: {
      idle: { on: { SPOT: "/chase" } },
      chase: { ...member(hunters, "target", target), on: { LOSE: "/idle" } },
    },
  });
}
```

## Add and remove the entity with `join` and `leave`

`join(world)` is a hook that adds the machine's `ctx` to the world, and `leave(world)` one that removes it, both at the world's next `refresh` or `update`. Set `join` as the root's `enter` so the entity joins when the machine starts, and `leave` as the `enter` of the state the entity leaves the world in, as `caught` does above.

## Tick machines from the world with `tickMachines`

`tickMachines<E>(key)` is a processing system that calls `update(dt)` on the machine each entity holds in `key`, with the world update's `dt`. Add it to the world like any other system: it runs where it stands in the world's system order.

The herd runs from one script, which spawns the critters and updates the world once a frame:

```ts title="herd-script.ts"
import { defineScript } from "@defold-typescript/types";
import { herd, spawnCritter } from "./critters";

export default defineScript({
  init() {
    for (let i = 0; i < 20; i++) {
      const id = factory.create("#critter_factory", vmath.vector3(i * 30, 0, 0));
      if (id !== undefined) {
        spawnCritter(id);
      }
    }
  },
  update(_self, dt) {
    herd.update(dt);
  },
  on_message(_self, message_id) {
    if (message_id === hash("scare")) {
      for (const critter of herd.entities) {
        critter.fsm?.send({ type: "SCARE" });
      }
    }
  },
});
```

## When a membership change shows

A hook changes membership the way `changed` does: the systems see the change at the world's next `refresh` or `update`. When `tickMachines` moves a machine during `update`, the change shows one update later:

- The systems after `tickMachines` still hold the entity for the rest of that update, with the component the `exit` hook cleared now `undefined`. A system that reads a component `member(world, key, value)` sets can meet it cleared.
- The systems the entity joins first process it at the next update.

For membership in the same frame, leave `tickMachines` out of the world and tick the machines in the script before the world update. A change a hook makes then waits only for the `update` that follows:

```ts title="same-frame.ts"
import { defineScript } from "@defold-typescript/types";
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
import { join, member } from "@defold-typescript/types/ecs/hsm";
import { defineMachine, type MachineInstance } from "@defold-typescript/types/hsm";

type LampEvent = { type: "TOGGLE" };

interface Lamp {
  readonly sprite: Url;
  brightness: number;
  lit?: true;
  fsm?: MachineInstance<Lamp, LampEvent>;
}

const lamps = world<Lamp>(
  processingSystem<Lamp>()(requireAll("lit"), {
    process(e, dt) {
      e.brightness = Math.min(1, e.brightness + dt);
      go.set(e.sprite, "tint.w", e.brightness);
    },
  }),
);

const lampMachine = defineMachine<Lamp, LampEvent>()({
  initial: "/off",
  enter: join(lamps),
  states: {
    off: { after: { 1: "/on" } },
    on: { ...member(lamps, "lit"), after: { 1: "/off" } },
  },
});

export default defineScript({
  init() {
    for (let i = 0; i < 8; i++) {
      const id = factory.create("#lamp_factory", vmath.vector3(i * 40, 0, 0));
      if (id !== undefined) {
        const lamp: Lamp = { sprite: msg.url(undefined, id, "sprite"), brightness: 0 };
        lamp.fsm = lampMachine.start(lamp);
      }
    }
  },
  update(_self, dt) {
    for (const lamp of lamps.entities) {
      lamp.fsm?.update(dt);
    }
    lamps.update(dt);
  },
});
```

The script runs on one controller object that spawns every lamp, so the world updates once a frame. `lamps.entities` holds the entities as of the last update, so a lamp started this frame ticks from the next one.

## Reference

### Functions

| Function | Returns | Meaning |
| --- | --- | --- |
| `member` | `{ enter, exit }` | `member(world, key)` sets the optional `true` component `key` on enter and clears it on exit; `member(world, key, value)` sets `value`. Both call `changed` only while `world` holds the entity. |
| `join` | a hook | `join(world)` adds the machine's `ctx` to `world` at its next `refresh` or `update`. Set it as the root's `enter`. |
| `leave` | a hook | `leave(world)` removes the machine's `ctx` from `world` at its next `refresh` or `update`. Set it as the `enter` of the state the entity leaves the world in. |
| `tickMachines` | a system | `tickMachines<E>(key)` calls `update(dt)` on the machine each entity holds in `key`, with the world update's `dt`. A membership change it causes shows at the next update. |
