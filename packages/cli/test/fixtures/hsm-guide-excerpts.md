# State machines guide excerpts

The code the cheat sheet in `packages/docs/guide/state-machines.md` quotes. `packages/cli/src/hsm-guide-fences.test.ts` compiles every fence here and holds each `ts excerpt` fence on the guide pages to this text, whitespace aside.

```ts title="guard-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

interface GuardCtx {
  readonly sprite: Url;
  health: number;
}

type GuardEvent =
  | MessageEvent<"trigger_response">
  | { type: "HIT"; damage: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "DEAD" };

export const guardMachine = defineMachine<GuardCtx, GuardEvent>("guard")({
  initial: "/spawn",
  states: {
    spawn: {
      always: [
        { to: "/gone", when: (ctx) => ctx.health <= 0 },
        { to: "/alive" },
      ],
    },
    alive: {
      initial: "/alive/patrol",
      restoreDepth: 1,
      on: { PAUSE: "/paused" },
      states: {
        patrol: {
          on: {
            HIT: {
              to: "/dying",
              when: (ctx, event) => ctx.health <= event.damage,
            },
          },
        },
        alert: {
          on: {
            HIT: {
              run: (ctx, event) => {
                ctx.health -= event.damage;
              },
            },
          },
          after: { 5: "/alive/patrol" },
          update: (ctx) =>
            ctx.health < 2 ? "/alive/patrol" : undefined,
        },
      },
    },
    paused: { on: { RESUME: "/alive" } },
    dying: {
      task: (_ctx, finish) => {
        sound.play("#death", {}, () => {
          finish({ type: "DEAD" });
        });
      },
      exit: (ctx) => go.cancel_animations(ctx.sprite, "tint.w"),
      on: { DEAD: "/gone" },
    },
    gone: { enter: (_ctx, machine) => machine.stop() },
  },
});

export const guardEvents = messageEvents([
  "trigger_response",
]);
```

```ts title="guard-types.ts"
import type { MachineInstance } from "@defold-typescript/types/hsm";
import type { guardEvents, guardMachine } from "./guard-machine";

type Guard = ReturnType<
  typeof guardMachine.start
>;
type GuardCtx = Guard["ctx"];
type GuardEvent = Parameters<Guard["send"]>[0];
type GuardPath = NonNullable<Guard["path"]>;
type GuardMessage = NonNullable<
  ReturnType<typeof guardEvents.toEvent>
>;

function isAlive(guard: Guard): boolean {
  return guard.matches("/alive");
}

function hurt<P extends string>(
  guard: MachineInstance<GuardCtx, GuardEvent, P>,
): void {
  guard.send({ type: "HIT", damage: 1 });
}

export const post: GuardPath = "/alive/patrol";
// @ts-expect-error -- "/asleep" is not one of the machine's paths
export const asleep: GuardPath = "/asleep";

export function ambush(guard: Guard, seen: GuardMessage): boolean {
  guard.send(seen);
  hurt(guard);
  // @ts-expect-error -- `MachineInstance<Ctx, E>` has `string` paths; a started instance does not fit it
  const loose: MachineInstance<GuardCtx, GuardEvent> = guard;
  return isAlive(guard);
}
```

```ts title="guard.ts"
import { defineScript } from "@defold-typescript/types";
import { guardEvents, guardMachine } from "./guard-machine";

export default defineScript({
  init() {
    const sprite = msg.url("#sprite");
    const ctx = { sprite, health: 3 };
    return { guard: guardMachine.start(ctx) };
  },
  update(self, dt) {
    self.guard.update(dt);
  },
  on_message(self, message_id, message, sender) {
    const event = guardEvents.toEvent(
      message_id,
      message,
      sender,
    );
    if (event !== undefined) {
      self.guard.send(event);
    }
  },
  final(self) {
    self.guard.stop();
  },
});
```

```ts title="guard-restart.ts"
import { defineScript } from "@defold-typescript/types";
import { guardMachine } from "./guard-machine";

function startGuard() {
  const sprite = msg.url("#sprite");
  return guardMachine.start({ sprite, health: 3 });
}

export default defineScript({
  init() {
    return { guard: startGuard() };
  },
  update(self, dt) {
    self.guard.update(dt);
  },
  on_reload(self) {
    self.guard.stop();
    self.guard = startGuard();
  },
  final(self) {
    self.guard.stop();
  },
});
```

```ts title="guard-named-self.ts"
import { defineScript } from "@defold-typescript/types";
import { guardMachine } from "./guard-machine";

type Self = {
  guard: ReturnType<typeof guardMachine.start>;
};

function tick(self: Self, dt: number): void {
  self.guard.update(dt);
}

export default defineScript<Self>({
  init() {
    const sprite = msg.url("#sprite");
    const ctx = { sprite, health: 3 };
    return { guard: guardMachine.start(ctx) };
  },
  update(self, dt) {
    tick(self, dt);
  },
  final(self) {
    self.guard.stop();
  },
});
```

```ts title="guard-properties.ts"
import { defineScript } from "@defold-typescript/types";
import { guardMachine } from "./guard-machine";

type Self = {
  guard: ReturnType<typeof guardMachine.start>;
};

export default defineScript({
  properties: {
    health: 3,
  },
  init(self): Self {
    const sprite = msg.url("#sprite");
    const ctx = { sprite, health: self.health };
    return { guard: guardMachine.start(ctx) };
  },
  update(self, dt) {
    self.guard.update(dt);
  },
  final(self) {
    self.guard.stop();
  },
});
```

```ts title="guard-late-start.ts"
import { defineScript } from "@defold-typescript/types";
import { guardMachine } from "./guard-machine";

type Self = {
  guard?: ReturnType<typeof guardMachine.start>;
};

const wake = hash("wake");

export default defineScript<Self>({
  on_message(self, message_id) {
    if (message_id === wake && self.guard === undefined) {
      const sprite = msg.url("#sprite");
      self.guard = guardMachine.start({ sprite, health: 3 });
    }
  },
  update(self, dt) {
    if (self.guard !== undefined) {
      self.guard.update(dt);
    }
  },
  final(self) {
    if (self.guard !== undefined) {
      self.guard.stop();
    }
  },
});
```

```ts title="guard-built-in-init.ts"
import { defineScript } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";

type Ctx = { health: number };
type HitEvent = { type: "HIT" };

// No hot reload key: every call builds a separate machine, one per object.
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

export default defineScript({
  properties: {
    patrol_for: 3,
  },
  init(self): { guard: Guard } {
    return { guard: buildGuardMachine(self.patrol_for).start({ health: 3 }) };
  },
  update(self, dt) {
    self.guard.update(dt);
  },
  final(self) {
    self.guard.stop();
  },
});
```
