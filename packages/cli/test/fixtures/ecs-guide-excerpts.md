# Entity systems guide excerpts

The code the Entity systems guide in `packages/docs/guide/entity-systems.md` and the bridge page in `packages/docs/guide/ecs-and-hsm.md` quote. `packages/cli/src/ecs-guide-fences.test.ts` compiles every fence here and holds each `ts excerpt` fence on the guide pages to this text, whitespace aside.

## Cheat sheet

```ts title="cheat-sheet.ts"
import {
  hasEntity,
  processingSystem,
  rejectAny,
  requireAll,
  requireAny,
  sortedProcessingSystem,
  system,
  world,
} from "@defold-typescript/types/ecs";

interface Vec {
  x: number;
  y: number;
}

interface Ent {
  readonly name: string;
  position?: Vec;
  velocity?: Vec;
  sprite?: Url;
  label?: Url;
  depth?: number;
  frozen?: true;
  gameplay?: true;
}

const move = processingSystem<Ent>()(requireAll("position", "velocity"), {
  process(e, dt) {
    e.position.x += e.velocity.x * dt;
    e.position.y += e.velocity.y * dt;
  },
});

const fall = processingSystem<Ent>()(
  requireAll("velocity", rejectAny("frozen")),
  {
    gameplay: true,
    process(e, dt) {
      e.velocity.y -= 9.8 * dt;
    },
  },
);

const visible = processingSystem<Ent>()(requireAny("sprite", "label"), {
  process(e) {
    if (e.sprite !== undefined) {
      msg.post(e.sprite, "enable");
    }
  },
});

const clock = system<Ent>()({
  elapsed: 0,
  update(dt) {
    this.elapsed += dt;
  },
});

const spawner = system<Ent>()({
  interval: 0.5,
  update() {
    this.world?.add({ name: "spark", position: { x: 0, y: 0 } });
  },
});

const layers = sortedProcessingSystem<Ent>()(requireAll("depth", "sprite"), {
  compare(a, b) {
    return a.depth < b.depth;
  },
  process(e) {
    msg.post(e.sprite, "enable");
  },
});

const counter = processingSystem<Ent>()(requireAll("position"), {
  onAdd(e) {
    print(`${e.name} joined at ${e.position.x}`);
  },
  onRemove(e) {
    print(`${e.name} left`);
  },
  process() {},
});

const landings = processingSystem<Ent>()(requireAll("position", "velocity"), {
  landed: [] as Ent[],
  process(e) {
    if (e.position.y <= 0 && e.velocity.y < 0) {
      this.landed.push(e);
    }
  },
  postProcess() {
    while (this.landed.length > 0) {
      const e = this.landed.pop() as Ent;
      e.frozen = true;
      this.world?.changed(e);
    }
  },
});

const w = world<Ent>(move, fall, visible, clock, spawner, layers, counter, landings);

export function cheatSheet(dt: number, paused: boolean): void {
  const ball: Ent = { name: "ball", position: { x: 0, y: 10 }, velocity: { x: 1, y: 0 } };
  w.add(ball);

  ball.frozen = true;
  w.changed(ball);

  ball.frozen = undefined;
  w.changed(ball);

  w.remove(ball);

  w.refresh();
  if (hasEntity(w, ball)) {
    print("ball is in the world");
  }

  move.active = false;

  layers.modified = true;

  if (paused) {
    w.update(dt, rejectAny("gameplay"));
  } else {
    w.update(dt);
  }

  print(`${w.getEntityCount()} entities, ${clock.elapsed} seconds`);
}
```
