# State machines guide excerpts

The code the State machines guide in `packages/docs/guide/state-machines.md` and the tutorial in `packages/docs/guide/state-machines-tutorial.md` quote, and the whole machines `packages/cli/src/hsm-guide-recipe.test.ts` runs. `packages/cli/src/hsm-guide-fences.test.ts` compiles every fence here and holds each `ts excerpt` and `ts builder` fence on the guide pages to this text, whitespace aside. A fence titled `builder/<name>.ts` defines the machines of `<name>.ts` with `hsm/builder` statements for the guide's Builder tabs, and `packages/cli/src/hsm-guide-builder-parity.test.ts` holds it to that config.

## Cheat sheet and tutorial

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
    paused: {
      on: { RESUME: "/alive" },
      unhandled: () => sound.play("#blocked"),
    },
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

```ts title="builder/guard-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";
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

const m = buildMachine<GuardCtx, GuardEvent>("guard")({
  initial: "/spawn",
  states: {
    spawn: {},
    alive: {
      initial: "/alive/patrol",
      restoreDepth: 1,
      states: { patrol: {}, alert: {} },
    },
    paused: {},
    dying: {},
    gone: {},
  },
});

m.state("/spawn")
  .always()
  .when((ctx) => ctx.health <= 0)
  .to("/gone");
m.state("/spawn").always().to("/alive");

m.state("/alive")
  .on("PAUSE")
  .to("/paused");

m.state("/alive/patrol")
  .on("HIT")
  .when((ctx, event) =>
    ctx.health <= event.damage,
  )
  .to("/dying");

m.state("/alive/alert")
  .on("HIT")
  .run((ctx, event) => {
    ctx.health -= event.damage;
  });
m.state("/alive/alert")
  .after(5)
  .to("/alive/patrol");
m.state("/alive/alert").update((ctx) =>
  ctx.health < 2 ? "/alive/patrol" : undefined,
);

m.state("/paused")
  .on("RESUME")
  .to("/alive");
m.state("/paused").unhandled(() =>
  sound.play("#blocked"),
);

m.state("/dying").task((_ctx, finish) => {
  sound.play("#death", {}, () => {
    finish({ type: "DEAD" });
  });
});
m.state("/dying").exit((ctx) =>
  go.cancel_animations(ctx.sprite, "tint.w"),
);
m.state("/dying")
  .on("DEAD")
  .to("/gone");

m.state("/gone").enter((_ctx, machine) =>
  machine.stop(),
);

export const guardMachine = m.build();

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

export function canPause(guard: Guard): boolean {
  return guard.can({ type: "PAUSE" });
}

function hurt(
  guard: MachineInstance<GuardCtx, GuardEvent>,
): void {
  guard.send({ type: "HIT", damage: 1 });
}

export const post: GuardPath = "/alive/patrol";
// @ts-expect-error -- "/asleep" is not one of the machine's paths
export const asleep: GuardPath = "/asleep";

export function ambush(guard: Guard, seen: GuardMessage): boolean {
  guard.send(seen);
  hurt(guard);
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

```ts title="guard-saved.ts"
import { defineScript } from "@defold-typescript/types";
import { guardMachine } from "./guard-machine";

type Guard = ReturnType<
  typeof guardMachine.start
>;

interface GuardSave {
  at?: NonNullable<Guard["path"]>[];
}

const SAVE_FILE = sys.get_save_file("my_game", "guard");

export default defineScript({
  init() {
    const save = sys.load(SAVE_FILE) as GuardSave;
    const ctx = { sprite: msg.url("#sprite"), health: 3 };
    return { guard: guardMachine.start(ctx, save.at) };
  },
  final(self) {
    sys.save(SAVE_FILE, { at: self.guard.leaves });
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

```ts title="guard-delay-from-property.ts"
import { defineScript } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";

type Ctx = { health: number; readonly patrolFor: number };
type HitEvent = { type: "HIT" };

// One keyed machine for every guard: each instance reads its own delay.
const guardMachine = defineMachine<Ctx, HitEvent>("guard")({
  initial: "/patrol",
  states: {
    patrol: {
      after: [
        { delay: (ctx) => ctx.patrolFor, to: "/rest" },
      ],
    },
    rest: { on: { HIT: "/patrol" } },
  },
});

type Self = {
  guard: ReturnType<typeof guardMachine.start>;
};

export default defineScript({
  properties: {
    patrol_for: 3,
  },
  init(self): Self {
    return {
      guard: guardMachine.start({
        health: 3,
        patrolFor: self.patrol_for,
      }),
    };
  },
  update(self, dt) {
    self.guard.update(dt);
  },
  final(self) {
    self.guard.stop();
  },
});
```

```ts title="builder/guard-delay-from-property.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type Ctx = { health: number; readonly patrolFor: number };
type HitEvent = { type: "HIT" };

// One keyed machine for every guard: each instance reads its own delay.
const m = buildMachine<Ctx, HitEvent>("guard")({
  initial: "/patrol",
  states: { patrol: {}, rest: {} },
});

m.state("/patrol")
  .after((ctx) => ctx.patrolFor)
  .to("/rest");
m.state("/rest").on("HIT").to("/patrol");

export const guardMachine = m.build();
```

```ts title="guard-timer-rules.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface GuardCtx {
  readonly sprite: Url;
  readonly scanEvery: number;
  calm: boolean;
}

type GuardEvent = { type: "SPOT" };

export const timedGuard = defineMachine<GuardCtx, GuardEvent>()({
  initial: "/patrol",
  states: {
    patrol: { on: { SPOT: "/alert" } },
    alert: {
      after: {
        2: {
          run: (ctx) =>
            msg.post(ctx.sprite, "shout"),
        },
        5: {
          to: "/patrol",
          when: (ctx) => ctx.calm,
        },
      },
      every: [
        {
          delay: (ctx) => ctx.scanEvery,
          run: (ctx) =>
            msg.post(ctx.sprite, "scan"),
        },
      ],
    },
  },
});
```

```ts title="builder/guard-timer-rules.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface GuardCtx {
  readonly sprite: Url;
  readonly scanEvery: number;
  calm: boolean;
}

type GuardEvent = { type: "SPOT" };

const m = buildMachine<GuardCtx, GuardEvent>()({
  initial: "/patrol",
  states: { patrol: {}, alert: {} },
});

m.state("/patrol").on("SPOT").to("/alert");
m.state("/alert")
  .after(2)
  .run((ctx) =>
    msg.post(ctx.sprite, "shout"),
  );
m.state("/alert")
  .after(5)
  .when((ctx) => ctx.calm)
  .to("/patrol");
m.state("/alert")
  .every((ctx) => ctx.scanEvery)
  .run((ctx) =>
    msg.post(ctx.sprite, "scan"),
  );

export const timedGuard = m.build();
```

```ts title="guard-tags.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface GuardCtx {
  readonly squad: Url;
}

type GuardEvent =
  | { type: "SPOT" }
  | { type: "REACH" }
  | { type: "LOSE" }
  | { type: "RADIO" };

export const taggedGuard = defineMachine<GuardCtx, GuardEvent, "alert">()({
  initial: "/patrol",
  on: {
    RADIO: {
      when: (_ctx, _event, machine) =>
        machine.hasTag("alert"),
      run: (ctx) => msg.post(ctx.squad, "backup"),
    },
  },
  states: {
    patrol: { on: { SPOT: "/chase" } },
    chase: {
      tags: ["alert"],
      on: { REACH: "/attack", LOSE: "/patrol" },
    },
    attack: {
      tags: ["alert"],
      on: { LOSE: "/patrol" },
    },
  },
});
```

```ts title="builder/guard-tags.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface GuardCtx {
  readonly squad: Url;
}

type GuardEvent =
  | { type: "SPOT" }
  | { type: "REACH" }
  | { type: "LOSE" }
  | { type: "RADIO" };

const m = buildMachine<GuardCtx, GuardEvent, "alert">()({
  initial: "/patrol",
  states: { patrol: {}, chase: {}, attack: {} },
});

m.root
  .on("RADIO")
  .when((_ctx, _event, machine) =>
    machine.hasTag("alert"),
  )
  .run((ctx) => msg.post(ctx.squad, "backup"));

m.state("/patrol").on("SPOT").to("/chase");
m.state("/chase").tags("alert");
m.state("/chase").on("REACH").to("/attack");
m.state("/chase").on("LOSE").to("/patrol");
m.state("/attack").tags("alert");
m.state("/attack").on("LOSE").to("/patrol");

export const taggedGuard = m.build();
```

```ts title="guard-waiting.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";

interface GuardCtx {
  readonly sprite: Url;
}

type GuardEvent =
  | { type: "AWAKE" }
  | { type: "DRAWN" }
  | { type: "CALLED" };

const SWORD_OUT = "/alert/sword/out";
const BACKUP_CALLED = "/alert/radio/called";

export const wakingGuard = defineMachine<GuardCtx, GuardEvent>()({
  initial: "/waking",
  states: {
    waking: {
      task: (ctx, finish) => {
        const group = waitGroup();
        sprite.play_flipbook(
          ctx.sprite,
          "rise",
          group.add(),
        );
        sound.play("#yawn", {}, group.add());
        group.wait(() => finish({ type: "AWAKE" }));
      },
      on: { AWAKE: "/alert" },
    },
    alert: {
      type: "parallel",
      always: {
        to: "/fight",
        when: (_ctx, machine) =>
          machine.matches(SWORD_OUT) &&
          machine.matches(BACKUP_CALLED),
      },
      states: {
        sword: {
          initial: "/alert/sword/drawing",
          states: {
            drawing: { on: { DRAWN: SWORD_OUT } },
            out: {},
          },
        },
        radio: {
          initial: "/alert/radio/calling",
          states: {
            calling: { on: { CALLED: BACKUP_CALLED } },
            called: {},
          },
        },
      },
    },
    fight: {},
  },
});
```

```ts title="builder/guard-waiting.ts"
import { waitGroup } from "@defold-typescript/types/hsm";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface GuardCtx {
  readonly sprite: Url;
}

type GuardEvent =
  | { type: "AWAKE" }
  | { type: "DRAWN" }
  | { type: "CALLED" };

const SWORD_OUT = "/alert/sword/out";
const BACKUP_CALLED = "/alert/radio/called";

const m = buildMachine<GuardCtx, GuardEvent>()({
  initial: "/waking",
  states: {
    waking: {},
    alert: {
      type: "parallel",
      states: {
        sword: {
          initial: "/alert/sword/drawing",
          states: { drawing: {}, out: {} },
        },
        radio: {
          initial: "/alert/radio/calling",
          states: { calling: {}, called: {} },
        },
      },
    },
    fight: {},
  },
});

m.state("/waking").task((ctx, finish) => {
  const group = waitGroup();
  sprite.play_flipbook(
    ctx.sprite,
    "rise",
    group.add(),
  );
  sound.play("#yawn", {}, group.add());
  group.wait(() => finish({ type: "AWAKE" }));
});
m.state("/waking").on("AWAKE").to("/alert");

m.state("/alert")
  .always()
  .when((_ctx, machine) =>
    machine.matches(SWORD_OUT) &&
    machine.matches(BACKUP_CALLED),
  )
  .to("/fight");

m.state("/alert/sword/drawing").on("DRAWN").to(SWORD_OUT);
m.state("/alert/radio/calling").on("CALLED").to(BACKUP_CALLED);

export const wakingGuard = m.build();
```

```ts title="guard-duel.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface DuelCtx {
  readonly done: () => void;
}

type DuelEvent = { type: "PARRY" };

export const duelMachine = defineMachine<DuelCtx, DuelEvent>()({
  initial: "/circling",
  states: {
    circling: {
      on: { PARRY: "/circling" },
      after: { 2: "/over" },
    },
    over: { enter: (ctx) => ctx.done() },
  },
});

interface GuardCtx {
  duel?: ReturnType<typeof duelMachine.start>;
}

type GuardEvent =
  | { type: "CHALLENGE" }
  | { type: "BLOCK" }
  | { type: "DUEL_OVER" };

export const duellingGuard = defineMachine<GuardCtx, GuardEvent>()({
  initial: "/patrol",
  states: {
    patrol: { on: { CHALLENGE: "/duel" } },
    duel: {
      task: (ctx, finish) => {
        const duel = duelMachine.start({
          done: () => finish({ type: "DUEL_OVER" }),
        });
        ctx.duel = duel;
        return () => {
          duel.stop();
          ctx.duel = undefined;
        };
      },
      update: (ctx, dt) => {
        ctx.duel?.update(dt);
        return undefined;
      },
      on: {
        BLOCK: { run: (ctx) => ctx.duel?.send({ type: "PARRY" }) },
        DUEL_OVER: "/patrol",
      },
    },
  },
});
```

```ts title="builder/guard-duel.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface DuelCtx {
  readonly done: () => void;
}

type DuelEvent = { type: "PARRY" };

const d = buildMachine<DuelCtx, DuelEvent>()({
  initial: "/circling",
  states: { circling: {}, over: {} },
});

d.state("/circling").on("PARRY").to("/circling");
d.state("/circling").after(2).to("/over");
d.state("/over").enter((ctx) => ctx.done());

export const duelMachine = d.build();

interface GuardCtx {
  duel?: ReturnType<typeof duelMachine.start>;
}

type GuardEvent =
  | { type: "CHALLENGE" }
  | { type: "BLOCK" }
  | { type: "DUEL_OVER" };

const m = buildMachine<GuardCtx, GuardEvent>()({
  initial: "/patrol",
  states: { patrol: {}, duel: {} },
});

m.state("/patrol").on("CHALLENGE").to("/duel");
m.state("/duel").task((ctx, finish) => {
  const duel = duelMachine.start({
    done: () => finish({ type: "DUEL_OVER" }),
  });
  ctx.duel = duel;
  return () => {
    duel.stop();
    ctx.duel = undefined;
  };
});
m.state("/duel").update((ctx, dt) => {
  ctx.duel?.update(dt);
  return undefined;
});
m.state("/duel")
  .on("BLOCK")
  .run((ctx) => ctx.duel?.send({ type: "PARRY" }));
m.state("/duel").on("DUEL_OVER").to("/patrol");

export const duellingGuard = m.build();
```

```ts title="guard-private.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface GuardOptions {
  readonly sprite: Url;
  readonly health: number;
}

interface GuardPrivate {
  hits: number;
  seen: Hash[];
}

type HitEvent = { type: "HIT"; damage: number };

const beaten = (
  ctx: GuardOptions & GuardPrivate,
) => ctx.hits >= ctx.health;

export const privateGuard = defineMachine<GuardOptions, HitEvent>("private-guard")({
  privateCtx: (): GuardPrivate => ({
    hits: 0,
    seen: [],
  }),
  initial: "/alive",
  states: {
    alive: {
      on: {
        HIT: [
          { to: "/gone", when: beaten },
          {
            run: (ctx, event) => {
              ctx.hits += event.damage;
            },
          },
        ],
      },
    },
    gone: {},
  },
});

const guard = privateGuard.start({ sprite: msg.url("#sprite"), health: 3 });
// @ts-expect-error -- `hits` is private: the instance's `ctx` shows `GuardOptions` only
export const hits: number = guard.ctx.hits;
```

```ts title="builder/guard-private.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface GuardOptions {
  readonly sprite: Url;
  readonly health: number;
}

interface GuardPrivate {
  hits: number;
  seen: Hash[];
}

type HitEvent = { type: "HIT"; damage: number };

const beaten = (
  ctx: GuardOptions & GuardPrivate,
) => ctx.hits >= ctx.health;

const m = buildMachine<GuardOptions, HitEvent>("private-guard")({
  privateCtx: (): GuardPrivate => ({
    hits: 0,
    seen: [],
  }),
  initial: "/alive",
  states: { alive: {}, gone: {} },
});

m.state("/alive").on("HIT").when(beaten).to("/gone");
m.state("/alive").on("HIT").run((ctx, event) => {
  ctx.hits += event.damage;
});

export const privateGuard = m.build();

const guard = privateGuard.start({ sprite: msg.url("#sprite"), health: 3 });
// @ts-expect-error -- `hits` is private: the instance's `ctx` shows `GuardOptions` only
export const hits: number = guard.ctx.hits;
```

## Recipes the recipe gate runs

```ts title="knight-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface KnightCtx {
  run: boolean;
  crouch: boolean;
  jump: boolean;
}

export type KnightEvent = { type: "INTENT" } | { type: "JUMP" } | { type: "DONE" };

const DONE = { type: "DONE" } as const;

const loop = (animation: string) => () => sprite.play_flipbook("#sprite", animation);

const once =
  (animation: string) => (_ctx: KnightCtx, finish: (event: KnightEvent) => void) => {
    sprite.play_flipbook("#sprite", animation, () => finish(DONE));
  };

const wantJump = {
  run: (ctx: KnightCtx) => {
    ctx.jump = true;
  },
};

const noJump = (ctx: KnightCtx) => {
  ctx.jump = false;
};

export const knightMachine = defineMachine<KnightCtx, KnightEvent>()({
  initial: "/standing",
  states: {
    standing: {
      initial: "/standing/pick",
      on: { JUMP: wantJump },
      states: {
        free: {
          initial: "/standing/free/idle",
          on: { JUMP: "/standing/jump" },
          states: {
            idle: {
              enter: loop("idle"),
              on: {
                INTENT: [
                  { to: "/to_crouch", when: (ctx) => ctx.crouch },
                  { to: "/standing/free/run", when: (ctx) => ctx.run },
                ],
              },
            },
            run: {
              enter: loop("run"),
              on: {
                INTENT: [
                  { to: "/to_crouch", when: (ctx) => ctx.crouch },
                  { to: "/standing/free/idle", when: (ctx) => !ctx.run },
                ],
              },
            },
          },
        },
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
      },
    },
    to_crouch: {
      enter: noJump,
      task: once("to_crouch"),
      on: { DONE: "/crouching" },
    },
    crouching: {
      initial: "/crouching/pick",
      states: {
        pick: {
          always: [
            { to: "/to_standing", when: (ctx) => !ctx.crouch },
            { to: "/crouching/run", when: (ctx) => ctx.run },
            { to: "/crouching/idle" },
          ],
        },
        idle: {
          enter: loop("crouch_idle"),
          on: {
            INTENT: [
              { to: "/to_standing", when: (ctx) => !ctx.crouch },
              { to: "/crouching/run", when: (ctx) => ctx.run },
            ],
          },
        },
        run: {
          enter: loop("crouch_walk"),
          on: {
            INTENT: [
              { to: "/to_standing", when: (ctx) => !ctx.crouch },
              { to: "/crouching/idle", when: (ctx) => !ctx.run },
            ],
          },
        },
      },
    },
    to_standing: {
      task: once("from_crouch"),
      on: { DONE: "/standing", JUMP: wantJump },
    },
  },
});
```

```ts title="builder/knight-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface KnightCtx {
  run: boolean;
  crouch: boolean;
  jump: boolean;
}

export type KnightEvent = { type: "INTENT" } | { type: "JUMP" } | { type: "DONE" };

const DONE = { type: "DONE" } as const;

const loop = (animation: string) => () => sprite.play_flipbook("#sprite", animation);

const once =
  (animation: string) => (_ctx: KnightCtx, finish: (event: KnightEvent) => void) => {
    sprite.play_flipbook("#sprite", animation, () => finish(DONE));
  };

const wantJump = (ctx: KnightCtx) => {
  ctx.jump = true;
};

const noJump = (ctx: KnightCtx) => {
  ctx.jump = false;
};

const m = buildMachine<KnightCtx, KnightEvent>()({
  initial: "/standing",
  states: {
    standing: {
      initial: "/standing/pick",
      states: {
        free: {
          initial: "/standing/free/idle",
          states: { idle: {}, run: {} },
        },
        jump: {},
        pick: {},
      },
    },
    to_crouch: {},
    crouching: {
      initial: "/crouching/pick",
      states: { pick: {}, idle: {}, run: {} },
    },
    to_standing: {},
  },
});

m.state("/standing").on("JUMP").run(wantJump);
m.state("/standing/free").on("JUMP").to("/standing/jump");

const idle = m.state("/standing/free/idle");
idle.enter(loop("idle"));
idle.on("INTENT").when((ctx) => ctx.crouch).to("/to_crouch");
idle.on("INTENT").when((ctx) => ctx.run).to("/standing/free/run");

const run = m.state("/standing/free/run");
run.enter(loop("run"));
run.on("INTENT").when((ctx) => ctx.crouch).to("/to_crouch");
run.on("INTENT").when((ctx) => !ctx.run).to("/standing/free/idle");

const jump = m.state("/standing/jump");
jump.enter(noJump);
jump.task(once("jump"));
jump.on("DONE").to("/standing/pick");

const pick = m.state("/standing/pick");
pick.always().when((ctx) => ctx.crouch).to("/to_crouch");
pick.always().when((ctx) => ctx.jump).to("/standing/jump");
pick.always().when((ctx) => ctx.run).to("/standing/free/run");
pick.always().to("/standing/free/idle");

const toCrouch = m.state("/to_crouch");
toCrouch.enter(noJump);
toCrouch.task(once("to_crouch"));
toCrouch.on("DONE").to("/crouching");

const crouchPick = m.state("/crouching/pick");
crouchPick.always().when((ctx) => !ctx.crouch).to("/to_standing");
crouchPick.always().when((ctx) => ctx.run).to("/crouching/run");
crouchPick.always().to("/crouching/idle");

const crouchIdle = m.state("/crouching/idle");
crouchIdle.enter(loop("crouch_idle"));
crouchIdle.on("INTENT").when((ctx) => !ctx.crouch).to("/to_standing");
crouchIdle.on("INTENT").when((ctx) => ctx.run).to("/crouching/run");

const crouchRun = m.state("/crouching/run");
crouchRun.enter(loop("crouch_walk"));
crouchRun.on("INTENT").when((ctx) => !ctx.crouch).to("/to_standing");
crouchRun.on("INTENT").when((ctx) => !ctx.run).to("/crouching/idle");

const toStanding = m.state("/to_standing");
toStanding.task(once("from_crouch"));
toStanding.on("DONE").to("/standing");
toStanding.on("JUMP").run(wantJump);

export const knightMachine = m.build();
```

```ts title="chest-routed.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface RoutedChestCtx {
  opened: boolean;
}

export type RoutedChestEvent = { type: "OPEN" };

export const routedChestMachine = defineMachine<RoutedChestCtx, RoutedChestEvent>()({
  initial: "/restore",
  states: {
    restore: {
      always: [{ to: "/open", when: (ctx) => ctx.opened }, { to: "/closed" }],
    },
    closed: { on: { OPEN: "/open" } },
    open: {
      enter: (ctx) => {
        ctx.opened = true;
      },
    },
  },
});
```

```ts title="builder/chest-routed.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface RoutedChestCtx {
  opened: boolean;
}

export type RoutedChestEvent = { type: "OPEN" };

const m = buildMachine<RoutedChestCtx, RoutedChestEvent>()({
  initial: "/restore",
  states: { restore: {}, closed: {}, open: {} },
});

m.state("/restore").always().when((ctx) => ctx.opened).to("/open");
m.state("/restore").always().to("/closed");
m.state("/closed").on("OPEN").to("/open");
m.state("/open").enter((ctx) => {
  ctx.opened = true;
});

export const routedChestMachine = m.build();
```

```ts title="chest-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface ChestCtx {
  readonly sprite: Url;
}

export type ChestEvent = { type: "UNLOCK" } | { type: "OPEN" };

export const chestMachine = defineMachine<ChestCtx, ChestEvent>()({
  initial: "/locked",
  states: {
    locked: { on: { UNLOCK: "/closed" } },
    closed: { on: { OPEN: "/open" } },
    open: {
      enter: (ctx) => {
        sprite.play_flipbook(ctx.sprite, "open");
      },
    },
  },
});
```

```ts title="builder/chest-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface ChestCtx {
  readonly sprite: Url;
}

export type ChestEvent = { type: "UNLOCK" } | { type: "OPEN" };

const m = buildMachine<ChestCtx, ChestEvent>()({
  initial: "/locked",
  states: { locked: {}, closed: {}, open: {} },
});

m.state("/locked").on("UNLOCK").to("/closed");
m.state("/closed").on("OPEN").to("/open");
m.state("/open").enter((ctx) => {
  sprite.play_flipbook(ctx.sprite, "open");
});

export const chestMachine = m.build();
```

```ts title="chest.ts"
import { defineScript } from "@defold-typescript/types";
import { chestMachine } from "./chest-machine";

type Chest = ReturnType<typeof chestMachine.start>;

interface ChestSave {
  at?: NonNullable<Chest["path"]>[];
}

const SAVE_FILE = sys.get_save_file("my_game", "chest");

export default defineScript({
  init() {
    const save = sys.load(SAVE_FILE) as ChestSave;
    return { chest: chestMachine.start({ sprite: msg.url("#sprite") }, save.at) };
  },
  final(self) {
    sys.save(SAVE_FILE, { at: self.chest.leaves });
    self.chest.stop();
  },
});
```

```ts title="door-requests.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import type { MessageEvent } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    open_door: {};
    close_door: {};
    lock_door: {};
    unlock_door: {};
    door_refused: { request: string };
  }
}

interface DoorCtx {
  readonly sprite: Url;
}

type DoorEvent = MessageEvent<"open_door" | "close_door" | "lock_door" | "unlock_door">;

export const doorMachine = defineMachine<DoorCtx, DoorEvent>()({
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
});
```

```ts title="builder/door-requests.ts"
import type { MessageEvent } from "@defold-typescript/types/hsm/defold";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

declare global {
  interface CustomMessages {
    open_door: {};
    close_door: {};
    lock_door: {};
    unlock_door: {};
    door_refused: { request: string };
  }
}

interface DoorCtx {
  readonly sprite: Url;
}

type DoorEvent = MessageEvent<"open_door" | "close_door" | "lock_door" | "unlock_door">;

const m = buildMachine<DoorCtx, DoorEvent>()({
  initial: "/closed",
  states: { closed: {}, open: {}, locked: {} },
});

// in every state: refuse, by name, whatever request the door did not take
m.root.unhandled((_ctx, event) =>
  msg.post(event.sender, "door_refused", { request: event.type }),
);
m.state("/closed").on("open_door").to("/open");
m.state("/closed").on("lock_door").to("/locked");
m.state("/open").on("close_door").to("/closed");
// in this state only: any request but the unlock rattles the handle
m.state("/locked").unhandled((ctx) => sprite.play_flipbook(ctx.sprite, "rattle"));
m.state("/locked").on("unlock_door").to("/closed");

export const doorMachine = m.build();
```

```ts title="wait-chain.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export type IntroEvent = { type: "SKIP" };

export const introMachine = defineMachine<object, IntroEvent>()({
  initial: "/intro",
  states: {
    intro: {
      initial: "/intro/logo",
      on: { SKIP: "/menu" },
      states: {
        logo: { after: { 2: "/intro/title" } },
        title: { after: { 2: "/intro/credits" } },
        credits: { after: { 2: "/menu" } },
      },
    },
    menu: {},
  },
});
```

```ts title="builder/wait-chain.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export type IntroEvent = { type: "SKIP" };

const m = buildMachine<object, IntroEvent>()({
  initial: "/intro",
  states: {
    intro: {
      initial: "/intro/logo",
      states: { logo: {}, title: {}, credits: {} },
    },
    menu: {},
  },
});

m.state("/intro").on("SKIP").to("/menu");
m.state("/intro/logo").after(2).to("/intro/title");
m.state("/intro/title").after(2).to("/intro/credits");
m.state("/intro/credits").after(2).to("/menu");

export const introMachine = m.build();
```

```ts title="wait-chain-parent.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface GatedIntroCtx {
  readonly firstRun: boolean;
}

export type GatedIntroEvent = { type: "INTRO_DONE" };

export const gatedIntroMachine = defineMachine<GatedIntroCtx, GatedIntroEvent>()({
  initial: "/intro",
  states: {
    intro: {
      initial: "/intro/logo",
      on: {
        INTRO_DONE: [{ to: "/tutorial", when: (ctx) => ctx.firstRun }, { to: "/menu" }],
      },
      states: {
        logo: { after: { 2: "/intro/title" } },
        title: { after: { 2: "/intro/credits" } },
        credits: { after: { 2: "/intro/done" } },
        done: { enter: (_ctx, machine) => machine.send({ type: "INTRO_DONE" }) },
      },
    },
    tutorial: {},
    menu: {},
  },
});
```

```ts title="builder/wait-chain-parent.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface GatedIntroCtx {
  readonly firstRun: boolean;
}

export type GatedIntroEvent = { type: "INTRO_DONE" };

const m = buildMachine<GatedIntroCtx, GatedIntroEvent>()({
  initial: "/intro",
  states: {
    intro: {
      initial: "/intro/logo",
      states: { logo: {}, title: {}, credits: {}, done: {} },
    },
    tutorial: {},
    menu: {},
  },
});

m.state("/intro")
  .on("INTRO_DONE")
  .when((ctx) => ctx.firstRun)
  .to("/tutorial");
m.state("/intro").on("INTRO_DONE").to("/menu");
m.state("/intro/logo").after(2).to("/intro/title");
m.state("/intro/title").after(2).to("/intro/credits");
m.state("/intro/credits").after(2).to("/intro/done");
m.state("/intro/done").enter((_ctx, machine) =>
  machine.send({ type: "INTRO_DONE" }),
);

export const gatedIntroMachine = m.build();
```

```ts title="wait-fixed.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";

export interface LevelCtx {
  readonly url: string;
  readonly curtain: Url;
}

export type LevelEvent = { type: "READY" } | { type: "FAILED" };

export const levelMachine = defineMachine<LevelCtx, LevelEvent>()({
  initial: "/loading",
  states: {
    loading: {
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
      on: { READY: "/playing", FAILED: "/failed" },
    },
    playing: {},
    failed: {},
  },
});
```

```ts title="builder/wait-fixed.ts"
import { waitGroup } from "@defold-typescript/types/hsm";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface LevelCtx {
  readonly url: string;
  readonly curtain: Url;
}

export type LevelEvent = { type: "READY" } | { type: "FAILED" };

const m = buildMachine<LevelCtx, LevelEvent>()({
  initial: "/loading",
  states: { loading: {}, playing: {}, failed: {} },
});

m.state("/loading").task((ctx, finish) => {
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
});
m.state("/loading").on("READY").to("/playing");
m.state("/loading").on("FAILED").to("/failed");

export const levelMachine = m.build();
```

```ts title="wait-counted.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";

export interface WaveCtx {
  readonly enemies: readonly Url[];
}

export type WaveEvent = { type: "ARRIVED" };

export const waveMachine = defineMachine<WaveCtx, WaveEvent>()({
  initial: "/entering",
  states: {
    entering: {
      task: (ctx, finish) => {
        const group = waitGroup();
        for (const enemy of ctx.enemies) {
          go.animate(enemy, "position.y", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_OUTQUAD, 1, 0, group.add());
        }
        group.wait(() => finish({ type: "ARRIVED" }));
      },
      on: { ARRIVED: "/fighting" },
    },
    fighting: {},
  },
});
```

```ts title="wait-regions.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export type RaidEvent = { type: "OPENED" } | { type: "FADED" };

const DOORS_OPEN = "/setup/doors/open";
const MUSIC_READY = "/setup/music/ready";

export const raidMachine = defineMachine<object, RaidEvent>()({
  initial: "/setup",
  states: {
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
    fight: {},
  },
});
```

```ts title="builder/wait-regions.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export type RaidEvent = { type: "OPENED" } | { type: "FADED" };

const DOORS_OPEN = "/setup/doors/open";
const MUSIC_READY = "/setup/music/ready";

const m = buildMachine<object, RaidEvent>()({
  initial: "/setup",
  states: {
    setup: {
      type: "parallel",
      states: {
        doors: {
          initial: "/setup/doors/opening",
          states: { opening: {}, open: {} },
        },
        music: {
          initial: "/setup/music/fading",
          states: { fading: {}, ready: {} },
        },
      },
    },
    fight: {},
  },
});

m.state("/setup")
  .always()
  .when((_ctx, machine) => machine.matches(DOORS_OPEN) && machine.matches(MUSIC_READY))
  .to("/fight");
m.state("/setup/doors/opening").on("OPENED").to(DOORS_OPEN);
m.state("/setup/music/fading").on("FADED").to(MUSIC_READY);

export const raidMachine = m.build();
```

```ts title="wait-sequence.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";
import { sequence } from "@defold-typescript/types/hsm/async";

export interface BootCtx {
  readonly url: string;
  readonly logo: Url;
}

export type BootEvent = { type: "READY" } | { type: "SKIP" };

export const bootMachine = defineMachine<BootCtx, BootEvent>()({
  initial: "/booting",
  states: {
    booting: {
      task: sequence(async (ctx, signal) => {
        const group = waitGroup();
        http.request(ctx.url, "GET", group.add());
        go.animate(ctx.logo, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 0.5, 0, group.add());
        await new Promise<void>((resolve) => group.wait(() => resolve()));
        if (signal.aborted) return;
        msg.post(ctx.logo, "disable");
        return { type: "READY" };
      }),
      on: { READY: "/playing", SKIP: "/menu" },
    },
    playing: {},
    menu: {},
  },
});
```

```ts title="builder/wait-sequence.ts"
import { waitGroup } from "@defold-typescript/types/hsm";
import { sequence } from "@defold-typescript/types/hsm/async";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface BootCtx {
  readonly url: string;
  readonly logo: Url;
}

export type BootEvent = { type: "READY" } | { type: "SKIP" };

const m = buildMachine<BootCtx, BootEvent>()({
  initial: "/booting",
  states: { booting: {}, playing: {}, menu: {} },
});

m.state("/booting").task(
  sequence(async (ctx, signal) => {
    const group = waitGroup();
    http.request(ctx.url, "GET", group.add());
    go.animate(ctx.logo, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 0.5, 0, group.add());
    await new Promise<void>((resolve) => group.wait(() => resolve()));
    if (signal.aborted) return;
    msg.post(ctx.logo, "disable");
    return { type: "READY" };
  }),
);
m.state("/booting").on("READY").to("/playing");
m.state("/booting").on("SKIP").to("/menu");

export const bootMachine = m.build();
```

```ts title="boss-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    minion_wake: {};
    minion_ready: {};
    minion_down: {};
  }
}

export interface BossCtx {
  readonly minions: Hash[];
  alive: number;
}

export type BossEvent = MessageEvent<"minion_ready" | "minion_down">;

export const bossMachine = defineMachine<BossCtx, BossEvent>()({
  initial: "/shielded",
  states: {
    shielded: {
      enter: (ctx) => {
        for (const minion of ctx.minions) {
          msg.post(minion, "minion_wake");
        }
      },
      on: {
        minion_ready: {
          run: (ctx) => {
            ctx.alive += 1;
          },
        },
        minion_down: [
          { to: "/exposed", when: (ctx) => ctx.alive === 1 },
          {
            run: (ctx) => {
              ctx.alive -= 1;
            },
          },
        ],
      },
    },
    exposed: {},
  },
});

export const bossEvents = messageEvents(["minion_ready", "minion_down"]);
```

```ts title="builder/boss-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    minion_wake: {};
    minion_ready: {};
    minion_down: {};
  }
}

export interface BossCtx {
  readonly minions: Hash[];
  alive: number;
}

export type BossEvent = MessageEvent<"minion_ready" | "minion_down">;

const m = buildMachine<BossCtx, BossEvent>()({
  initial: "/shielded",
  states: { shielded: {}, exposed: {} },
});

m.state("/shielded").enter((ctx) => {
  for (const minion of ctx.minions) {
    msg.post(minion, "minion_wake");
  }
});
m.state("/shielded").on("minion_ready").run((ctx) => {
  ctx.alive += 1;
});
m.state("/shielded")
  .on("minion_down")
  .when((ctx) => ctx.alive === 1)
  .to("/exposed");
m.state("/shielded").on("minion_down").run((ctx) => {
  ctx.alive -= 1;
});

export const bossMachine = m.build();

export const bossEvents = messageEvents(["minion_ready", "minion_down"]);
```

```ts title="minion-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

export interface MinionCtx {
  hp: number;
  owner?: Url;
}

export type MinionEvent = MessageEvent<"minion_wake"> | { type: "HIT" };

export const minionMachine = defineMachine<MinionCtx, MinionEvent>()({
  initial: "/asleep",
  states: {
    asleep: {
      on: {
        minion_wake: {
          to: "/awake",
          run: (ctx, event) => {
            ctx.owner = event.sender;
            msg.post(event.sender, "minion_ready");
          },
        },
      },
    },
    awake: {
      on: {
        HIT: [
          { to: "/down", when: (ctx) => ctx.hp <= 1 },
          {
            run: (ctx) => {
              ctx.hp -= 1;
            },
          },
        ],
      },
    },
    down: {
      enter: (ctx) => {
        if (ctx.owner !== undefined) {
          msg.post(ctx.owner, "minion_down");
        }
      },
    },
  },
});

export const minionEvents = messageEvents(["minion_wake"]);
```

```ts title="builder/minion-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

export interface MinionCtx {
  hp: number;
  owner?: Url;
}

export type MinionEvent = MessageEvent<"minion_wake"> | { type: "HIT" };

const m = buildMachine<MinionCtx, MinionEvent>()({
  initial: "/asleep",
  states: { asleep: {}, awake: {}, down: {} },
});

m.state("/asleep")
  .on("minion_wake")
  .to("/awake")
  .run((ctx, event) => {
    ctx.owner = event.sender;
    msg.post(event.sender, "minion_ready");
  });
m.state("/awake")
  .on("HIT")
  .when((ctx) => ctx.hp <= 1)
  .to("/down");
m.state("/awake").on("HIT").run((ctx) => {
  ctx.hp -= 1;
});
m.state("/down").enter((ctx) => {
  if (ctx.owner !== undefined) {
    msg.post(ctx.owner, "minion_down");
  }
});

export const minionMachine = m.build();

export const minionEvents = messageEvents(["minion_wake"]);
```

```ts title="round-machines.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export type RoundEvent = { type: "FINISH" };

export const roundMachine = defineMachine<object, RoundEvent>()({
  initial: "/countdown",
  states: {
    countdown: { after: { 3: "/playing" } },
    playing: { on: { FINISH: "/over" } },
    over: {},
  },
});

export interface HeroCtx {
  readonly round: ReturnType<typeof roundMachine.start>;
}

export type HeroEvent = { type: "JUMP" } | { type: "LAND" };

export const heroMachine = defineMachine<HeroCtx, HeroEvent>()({
  initial: "/grounded",
  states: {
    grounded: {
      on: {
        JUMP: { to: "/airborne", when: (ctx) => ctx.round.matches("/playing") },
      },
    },
    airborne: { on: { LAND: "/grounded" } },
  },
});
```

```ts title="builder/round-machines.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export type RoundEvent = { type: "FINISH" };

const r = buildMachine<object, RoundEvent>()({
  initial: "/countdown",
  states: { countdown: {}, playing: {}, over: {} },
});

r.state("/countdown").after(3).to("/playing");
r.state("/playing").on("FINISH").to("/over");

export const roundMachine = r.build();

export interface HeroCtx {
  readonly round: ReturnType<typeof roundMachine.start>;
}

export type HeroEvent = { type: "JUMP" } | { type: "LAND" };

const m = buildMachine<HeroCtx, HeroEvent>()({
  initial: "/grounded",
  states: { grounded: {}, airborne: {} },
});

m.state("/grounded")
  .on("JUMP")
  .when((ctx) => ctx.round.matches("/playing"))
  .to("/airborne");
m.state("/airborne").on("LAND").to("/grounded");

export const heroMachine = m.build();
```

```ts title="hero.ts"
import { defineScript } from "@defold-typescript/types";
import { heroMachine, roundMachine } from "./round-machines";

export default defineScript({
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
});
```

```ts title="combo-machines.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

export interface ComboCtx {
  hits: number;
  readonly done: (hits: number) => void;
}

export type ComboEvent = { type: "HIT" };

export const comboMachine = defineMachine<ComboCtx, ComboEvent>()({
  initial: "/open",
  states: {
    open: {
      on: {
        HIT: {
          to: "/open",
          run: (ctx) => {
            ctx.hits += 1;
          },
        },
      },
      after: { 1: "/closed" },
    },
    closed: { enter: (ctx) => ctx.done(ctx.hits) },
  },
});

export interface BrawlerCtx {
  combo?: ReturnType<typeof comboMachine.start>;
  best: number;
}

export type BrawlerEvent =
  | { type: "ENGAGE" }
  | { type: "PUNCH" }
  | { type: "FLEE" }
  | { type: "COMBO_ENDED"; hits: number };

export const brawlerMachine = defineMachine<BrawlerCtx, BrawlerEvent>()({
  initial: "/roaming",
  states: {
    roaming: { on: { ENGAGE: "/fighting" } },
    fighting: {
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
      on: {
        PUNCH: { run: (ctx) => ctx.combo?.send({ type: "HIT" }) },
        COMBO_ENDED: {
          to: "/roaming",
          run: (ctx, event) => {
            if (event.hits > ctx.best) {
              ctx.best = event.hits;
            }
          },
        },
        FLEE: "/roaming",
      },
    },
  },
});
```

```ts title="builder/combo-machines.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

export interface ComboCtx {
  hits: number;
  readonly done: (hits: number) => void;
}

export type ComboEvent = { type: "HIT" };

const c = buildMachine<ComboCtx, ComboEvent>()({
  initial: "/open",
  states: { open: {}, closed: {} },
});

c.state("/open")
  .on("HIT")
  .to("/open")
  .run((ctx) => {
    ctx.hits += 1;
  });
c.state("/open").after(1).to("/closed");
c.state("/closed").enter((ctx) => ctx.done(ctx.hits));

export const comboMachine = c.build();

export interface BrawlerCtx {
  combo?: ReturnType<typeof comboMachine.start>;
  best: number;
}

export type BrawlerEvent =
  | { type: "ENGAGE" }
  | { type: "PUNCH" }
  | { type: "FLEE" }
  | { type: "COMBO_ENDED"; hits: number };

const m = buildMachine<BrawlerCtx, BrawlerEvent>()({
  initial: "/roaming",
  states: { roaming: {}, fighting: {} },
});

m.state("/roaming").on("ENGAGE").to("/fighting");
m.state("/fighting").task((ctx, finish) => {
  const combo = comboMachine.start({
    hits: 0,
    done: (hits) => finish({ type: "COMBO_ENDED", hits }),
  });
  ctx.combo = combo;
  return () => {
    combo.stop();
    ctx.combo = undefined;
  };
});
m.state("/fighting").update((ctx, dt) => {
  ctx.combo?.update(dt);
  return undefined;
});
m.state("/fighting")
  .on("PUNCH")
  .run((ctx) => ctx.combo?.send({ type: "HIT" }));
m.state("/fighting")
  .on("COMBO_ENDED")
  .to("/roaming")
  .run((ctx, event) => {
    if (event.hits > ctx.best) {
      ctx.best = event.hits;
    }
  });
m.state("/fighting").on("FLEE").to("/roaming");

export const brawlerMachine = m.build();
```

## Guide samples

```ts title="enemy-rules.ts"
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
        chase: { on: { SEE_PLAYER: "/alive/chase", LOSE_PLAYER: "/alive/patrol", FALL: "/dead" } },
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

```ts title="builder/enemy-rules.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface EnemyCtx {
  health: number;
}

type EnemyEvent =
  | { type: "HIT"; damage: number }
  | { type: "SEE_PLAYER" }
  | { type: "LOSE_PLAYER" }
  | { type: "FALL" }
  | { type: "RESPAWN" };

const m = buildMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      initial: "/alive/patrol",
      states: { patrol: {}, chase: {} },
    },
    dead: {},
  },
});

m.state("/alive")
  .on("HIT")
  .when((ctx, event) => ctx.health <= event.damage)
  .to("/dead");
m.state("/alive").on("HIT").run((ctx, event) => {
  ctx.health -= event.damage;
});
m.state("/alive/patrol").on("SEE_PLAYER").to("/alive/chase");
m.state("/alive/chase").on("SEE_PLAYER").to("/alive/chase");
m.state("/alive/chase").on("LOSE_PLAYER").to("/alive/patrol");
m.state("/alive/chase").on("FALL").to("/dead");
m.state("/dead")
  .on("RESPAWN")
  .to("/alive")
  .run((ctx) => {
    ctx.health = 3;
  });

export const enemy = m.build();
```

```ts title="when-reads.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface EnemyCtx {
  health: number;
}

type EnemyEvent = { type: "HIT"; damage: number };

export const enemy = defineMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      on: {
        HIT: {
          to: "/dead",
          when: (ctx, event) => {
            // @ts-expect-error -- a `when` cannot assign to a field of `ctx`
            ctx.health -= event.damage;
            return ctx.health <= event.damage;
          },
          run: (ctx, event) => {
            ctx.health -= event.damage;
          },
        },
      },
    },
    dead: {},
  },
});
```

```ts title="builder/when-reads.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface EnemyCtx {
  health: number;
}

type EnemyEvent = { type: "HIT"; damage: number };

const m = buildMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: { alive: {}, dead: {} },
});

m.state("/alive")
  .on("HIT")
  .when((ctx, event) => {
    // @ts-expect-error -- a `when` cannot assign to a field of `ctx`
    ctx.health -= event.damage;
    return ctx.health <= event.damage;
  })
  .to("/dead")
  .run((ctx, event) => {
    ctx.health -= event.damage;
  });

export const enemy = m.build();
```

```ts title="feet-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface FeetCtx {
  on_ground: boolean;
}

type FeetEvent = { type: "JUMP" };

export const feet = defineMachine<FeetCtx, FeetEvent>()({
  initial: "/grounded",
  states: {
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
    jumping: { after: { 0.4: "/falling" } },
    falling: { update: (ctx) => (ctx.on_ground ? "/grounded" : undefined) },
  },
});
```

```ts title="builder/feet-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface FeetCtx {
  on_ground: boolean;
}

type FeetEvent = { type: "JUMP" };

const m = buildMachine<FeetCtx, FeetEvent>()({
  initial: "/grounded",
  states: { grounded: {}, coyote: {}, jumping: {}, falling: {} },
});

m.state("/grounded").update((ctx) => (ctx.on_ground ? undefined : "/coyote"));
m.state("/grounded").on("JUMP").to("/jumping");
// Just after walking off a ledge, a jump still counts.
m.state("/coyote").update((ctx) => (ctx.on_ground ? "/grounded" : undefined));
m.state("/coyote").after(0.1).to("/falling");
m.state("/coyote").on("JUMP").to("/jumping");
m.state("/jumping").after(0.4).to("/falling");
m.state("/falling").update((ctx) => (ctx.on_ground ? "/grounded" : undefined));

export const feet = m.build();
```

```ts title="timer-rules.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface HeroCtx {
  grounded: boolean;
  timeouts: number;
}

type HeroEvent = { type: "CHARGE" } | { type: "RELEASE" } | { type: "JUMP" };

const countTimeout = (ctx: HeroCtx) => {
  ctx.timeouts += 1;
};

export const hero = defineMachine<HeroCtx, HeroEvent>()({
  initial: "/idle",
  states: {
    idle: { on: { CHARGE: "/charging", JUMP: "/landing" } },
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
  },
});
```

```ts title="builder/timer-rules.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface HeroCtx {
  grounded: boolean;
  timeouts: number;
}

type HeroEvent = { type: "CHARGE" } | { type: "RELEASE" } | { type: "JUMP" };

const countTimeout = (ctx: HeroCtx) => {
  ctx.timeouts += 1;
};

const m = buildMachine<HeroCtx, HeroEvent>()({
  initial: "/idle",
  states: { idle: {}, charging: {}, landing: {} },
});

m.state("/idle").on("CHARGE").to("/charging");
m.state("/idle").on("JUMP").to("/landing");
// Code at a set time, without leaving the state.
m.state("/charging").after(1).run(() => sound.play("#beep"));
// Code that belongs to one move.
m.state("/charging").after(3).to("/idle").run(countTimeout);
m.state("/charging").on("RELEASE").to("/idle");
// A minimum time, and then a condition.
m.state("/landing")
  .after(0.3)
  .when((ctx) => ctx.grounded)
  .to("/idle");

export const hero = m.build();
```

```ts title="every-fire.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface TurretCtx {
  readonly muzzle: Url;
  readonly fireEvery: number;
  heat: number;
}

type TurretEvent = { type: "SPOT" } | { type: "LOSE" };

export const turret = defineMachine<TurretCtx, TurretEvent>()({
  initial: "/idle",
  states: {
    idle: { on: { SPOT: "/firing" } },
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
  },
});
```

```ts title="builder/every-fire.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface TurretCtx {
  readonly muzzle: Url;
  readonly fireEvery: number;
  heat: number;
}

type TurretEvent = { type: "SPOT" } | { type: "LOSE" };

const m = buildMachine<TurretCtx, TurretEvent>()({
  initial: "/idle",
  states: { idle: {}, firing: {}, cooling: {} },
});

m.state("/idle").on("SPOT").to("/firing");
// A rate of fire read from the context.
m.state("/firing")
  .every((ctx) => ctx.fireEvery)
  .run((ctx) => msg.post(ctx.muzzle, "fire"));
m.state("/firing").on("LOSE").to("/cooling");
// A fixed delay, beside a timer that leaves the state.
m.state("/cooling")
  .every(0.5)
  .run((ctx) => {
    ctx.heat -= 1;
  });
m.state("/cooling").after(3).to("/idle");

export const turret = m.build();
```

```ts title="game-history.ts"
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

```ts title="builder/game-history.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type PlayEvent =
  | { type: "JUMP" }
  | { type: "FALL" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESTART" };

const m = buildMachine<object, PlayEvent>()({
  initial: "/playing",
  states: {
    playing: {
      restoreDepth: 1,
      initial: "/playing/ground",
      states: {
        ground: {},
        air: {
          initial: "/playing/air/rise",
          states: { rise: {}, fall: {} },
        },
      },
    },
    paused: {},
  },
});

m.state("/playing").on("PAUSE").to("/paused");
m.state("/playing/ground").on("JUMP").to("/playing/air");
m.state("/playing/air/rise").on("FALL").to("/playing/air/fall");
m.state("/paused").on("RESUME").to("/playing");
m.state("/paused").on("RESTART").to("/playing/ground");

export const game = m.build();
```

```ts title="hero-always.ts"
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

```ts title="builder/hero-always.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface Hero {
  health: number;
}

type HeroEvent = { type: "HIT" };

const m = buildMachine<Hero, HeroEvent>()({
  initial: "/fine",
  states: { fine: {}, hurt: {}, dead: {} },
});

m.state("/fine").on("HIT").to("/hurt");
m.state("/hurt").enter((ctx) => {
  ctx.health -= 1;
});
m.state("/hurt")
  .always()
  .when((ctx) => ctx.health <= 0)
  .to("/dead");
m.state("/hurt").always().to("/fine");

export const hero = m.build();
```

```ts title="player-regions.ts"
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
    dead: { on: { REVIVE: "/alive" } },
  },
});

const m = player.start({});
m.send({ type: "START_FIRE" });
m.leaves; // ["/alive/move/run", "/alive/weapon/cooldown"]
m.path; // "/alive/move/run", the first of them
```

```ts title="builder/player-regions.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type PlayerEvent = { type: "START_FIRE" } | { type: "DIE" } | { type: "REVIVE" };

const m = buildMachine<object, PlayerEvent>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      states: {
        move: {
          initial: "/alive/move/idle",
          states: { idle: {}, run: {} },
        },
        weapon: {
          initial: "/alive/weapon/ready",
          states: { ready: {}, cooldown: {} },
        },
      },
    },
    dead: {},
  },
});

m.state("/alive").on("DIE").to("/dead");
m.state("/alive/move/idle").on("START_FIRE").to("/alive/move/run");
m.state("/alive/weapon/ready").on("START_FIRE").to("/alive/weapon/cooldown");
m.state("/alive/weapon/cooldown").after(0.5).to("/alive/weapon/ready");
m.state("/dead").on("REVIVE").to("/alive");

export const player = m.build();
```

```ts title="knight-regions.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type KnightEvent = { type: "JUMP" } | { type: "LAND" } | { type: "CROUCH" } | { type: "STAND" };

export const knight = defineMachine<object, KnightEvent>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      states: {
        move: {
          initial: "/alive/move/idle",
          states: {
            idle: {
              on: {
                JUMP: {
                  to: "/alive/move/jump",
                  when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing"),
                },
              },
            },
            jump: { on: { LAND: "/alive/move/idle" } },
          },
        },
        posture: {
          initial: "/alive/posture/standing",
          states: {
            standing: { on: { CROUCH: "/alive/posture/crouching" } },
            crouching: { on: { STAND: "/alive/posture/standing" } },
          },
        },
      },
    },
  },
});

const m = knight.start({});
m.send({ type: "CROUCH" });
m.send({ type: "JUMP" }); // dropped: the check sees /alive/posture/crouching
m.leaves; // ["/alive/move/idle", "/alive/posture/crouching"]
```

```ts title="builder/knight-regions.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type KnightEvent = { type: "JUMP" } | { type: "LAND" } | { type: "CROUCH" } | { type: "STAND" };

const m = buildMachine<object, KnightEvent>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      states: {
        move: {
          initial: "/alive/move/idle",
          states: { idle: {}, jump: {} },
        },
        posture: {
          initial: "/alive/posture/standing",
          states: { standing: {}, crouching: {} },
        },
      },
    },
  },
});

m.state("/alive/move/idle")
  .on("JUMP")
  .when((_ctx, _event, machine) => machine.matches("/alive/posture/standing"))
  .to("/alive/move/jump");
m.state("/alive/move/jump").on("LAND").to("/alive/move/idle");
m.state("/alive/posture/standing").on("CROUCH").to("/alive/posture/crouching");
m.state("/alive/posture/crouching").on("STAND").to("/alive/posture/standing");

export const knight = m.build();
```

```ts title="knight-tags.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface KnightCtx {
  health: number;
}

type KnightEvent =
  | { type: "ROLL" }
  | { type: "LAND" }
  | { type: "RAISE" }
  | { type: "LOWER" }
  | { type: "HIT"; damage: number };

type KnightTag = "invulnerable";

export const knight = defineMachine<KnightCtx, KnightEvent, KnightTag>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      on: {
        HIT: {
          when: (_ctx, _event, machine) => !machine.hasTag("invulnerable"),
          run: (ctx, event) => {
            ctx.health -= event.damage;
          },
        },
      },
      states: {
        body: {
          initial: "/alive/body/walk",
          states: {
            walk: { on: { ROLL: "/alive/body/roll" } },
            roll: {
              tags: ["invulnerable"],
              initial: "/alive/body/roll/start",
              states: { start: {} },
              on: { LAND: "/alive/body/walk" },
            },
          },
        },
        shield: {
          initial: "/alive/shield/down",
          states: {
            down: { on: { RAISE: "/alive/shield/up" } },
            up: { tags: ["invulnerable"], on: { LOWER: "/alive/shield/down" } },
          },
        },
      },
    },
  },
});

const m = knight.start({ health: 3 });
m.send({ type: "ROLL" });
m.send({ type: "RAISE" });
m.send({ type: "LAND" });
m.hasTag("invulnerable"); // true: the shield is still up
m.send({ type: "HIT", damage: 1 }); // dropped
```

```ts title="builder/knight-tags.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface KnightCtx {
  health: number;
}

type KnightEvent =
  | { type: "ROLL" }
  | { type: "LAND" }
  | { type: "RAISE" }
  | { type: "LOWER" }
  | { type: "HIT"; damage: number };

type KnightTag = "invulnerable";

const m = buildMachine<KnightCtx, KnightEvent, KnightTag>()({
  initial: "/alive",
  states: {
    alive: {
      type: "parallel",
      states: {
        body: {
          initial: "/alive/body/walk",
          states: {
            walk: {},
            roll: {
              initial: "/alive/body/roll/start",
              states: { start: {} },
            },
          },
        },
        shield: {
          initial: "/alive/shield/down",
          states: { down: {}, up: {} },
        },
      },
    },
  },
});

m.state("/alive")
  .on("HIT")
  .when((_ctx, _event, machine) => !machine.hasTag("invulnerable"))
  .run((ctx, event) => {
    ctx.health -= event.damage;
  });
m.state("/alive/body/walk").on("ROLL").to("/alive/body/roll");
m.state("/alive/body/roll").tags("invulnerable");
m.state("/alive/body/roll").on("LAND").to("/alive/body/walk");
m.state("/alive/shield/down").on("RAISE").to("/alive/shield/up");
m.state("/alive/shield/up").tags("invulnerable");
m.state("/alive/shield/up").on("LOWER").to("/alive/shield/down");

export const knight = m.build();
```

```ts title="level-queue.ts"
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

```ts title="intro-sequence.ts"
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

```ts title="builder/intro-sequence.ts"
import { sequence } from "@defold-typescript/types/hsm/async";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface IntroCtx {
  readonly title: Url;
}

type IntroEvent = { type: "DONE" } | { type: "SKIP" };

const m = buildMachine<IntroCtx, IntroEvent>()({
  initial: "/playing",
  states: { playing: {}, menu: {} },
});

m.state("/playing").task(
  sequence(async (ctx, signal) => {
    msg.post(ctx.title, "enable");
    await signal.wait(2);
    msg.post(ctx.title, "disable");
    await signal.wait(0.5);
    return { type: "DONE" };
  }),
);
m.state("/playing").on("DONE").to("/menu");
m.state("/playing").on("SKIP").to("/menu");

export const intro = m.build();
```

```ts title="fetch-watchdog.ts"
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

```ts title="builder/fetch-watchdog.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type FetchEvent = { type: "LOADED" } | { type: "FAILED" };

const m = buildMachine<{ readonly url: string }, FetchEvent>()({
  initial: "/loading",
  states: { loading: {}, ready: {}, failed: {} },
});

m.state("/loading").task((ctx, finish) => {
  http.request(ctx.url, "GET", (_self, _id, response) => {
    finish(response.status === 200 ? { type: "LOADED" } : { type: "FAILED" });
  });
});
m.state("/loading").after(5).to("/failed");
m.state("/loading").on("LOADED").to("/ready");
m.state("/loading").on("FAILED").to("/failed");

export const fetcher = m.build();
```

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

```ts title="builder/door-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

export interface DoorCtx {
  readonly sprite: Url;
  opens: number;
}

export type DoorEvent = MessageEvent<"trigger_response"> | { type: "OPENED" } | { type: "CLOSE" };

const m = buildMachine<DoorCtx, DoorEvent>()({
  initial: "/closed",
  states: { closed: {}, opening: {}, open: {} },
});

m.state("/closed")
  .on("trigger_response")
  .when((_ctx, event) => event.enter)
  .to("/opening");
m.state("/opening").task((ctx, finish) => {
  go.animate(ctx.sprite, "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.5, 0, () => {
    finish({ type: "OPENED" });
  });
});
m.state("/opening").exit((ctx) => {
  go.cancel_animations(ctx.sprite, "tint.w");
});
m.state("/opening").on("OPENED").to("/open");
m.state("/open").enter((ctx) => {
  ctx.opens += 1;
});
m.state("/open").after(3).to("/closed");
m.state("/open").on("CLOSE").to("/closed");

export const doorMachine = m.build();

export const doorEvents = messageEvents(["trigger_response"]);
```

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

```ts title="enemy-can.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type EnemyCtx = { health: number };
type EnemyEvent = { type: "HIT"; damage: number };

export const enemy = defineMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      on: { HIT: { to: "/dead", when: (ctx, event) => ctx.health <= event.damage } },
    },
    dead: {},
  },
});

const e = enemy.start({ health: 3 });
e.can({ type: "HIT", damage: 3 }); // true: this hit is fatal
e.can({ type: "HIT", damage: 1 }); // false: the only rule's `when` fails
// @ts-expect-error a HIT carries its damage
e.can({ type: "HIT" });
```

```ts title="door-listener.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type DoorEvent = { type: "OPEN" } | { type: "CLOSE" } | { type: "KNOCK" };

export const door = defineMachine<object, DoorEvent>()({
  initial: "/closed",
  states: {
    closed: { on: { OPEN: "/open", KNOCK: {} } },
    open: { on: { CLOSE: "/closed" } },
  },
});

const m = door.start({});
const off = m.onUnhandled((event) => {
  print(`door ignored ${event.type} in ${m.path}`);
});

m.send({ type: "CLOSE" }); // prints: door ignored CLOSE in /closed
m.send({ type: "KNOCK" }); // nothing: the empty rule takes KNOCK
m.send({ type: "OPEN" }); // nothing: the door opens
off(); // stop listening
```

```ts title="turret-inferred.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

export const turret = defineMachine<{ readonly fireRate: number }, TurretEvent>("turret")({
  privateCtx: () => ({ heat: 0, targets: [] as Hash[] }),
  initial: "/idle",
  states: {
    idle: { on: { SPOTTED: "/firing" } },
    firing: {
      enter: (ctx) => {
        ctx.heat += 1 / ctx.fireRate;
      },
      on: { LOST: "/idle" },
    },
  },
});

const gun = turret.start({ fireRate: 2 }); // gun.ctx shows fireRate only
```

```ts title="builder/turret-inferred.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

const m = buildMachine<{ readonly fireRate: number }, TurretEvent>("turret")({
  privateCtx: () => ({ heat: 0, targets: [] as Hash[] }),
  initial: "/idle",
  states: { idle: {}, firing: {} },
});

m.state("/idle").on("SPOTTED").to("/firing");
m.state("/firing").enter((ctx) => {
  ctx.heat += 1 / ctx.fireRate;
});
m.state("/firing").on("LOST").to("/idle");

export const turret = m.build();
```

```ts title="turret-named.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface TurretOptions {
  readonly fireRate: number;
}

interface TurretPrivate {
  heat: number;
  mode: "cool" | "hot";
}

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

const overheated = (ctx: TurretOptions & TurretPrivate) => ctx.heat > ctx.fireRate;

export const turret = defineMachine<TurretOptions, TurretEvent>("turret")({
  privateCtx: (): TurretPrivate => ({ heat: 0, mode: "cool" }),
  initial: "/idle",
  states: {
    idle: { on: { SPOTTED: "/firing" } },
    firing: {
      enter: (ctx) => {
        ctx.heat += 1 / ctx.fireRate;
      },
      always: { to: "/cooling", when: overheated },
      on: { LOST: "/idle" },
    },
    cooling: {
      enter: (ctx) => {
        ctx.mode = "hot";
      },
      exit: (ctx) => {
        ctx.heat = 0;
        ctx.mode = "cool";
      },
      after: { 2: "/idle" },
    },
  },
});
```

```ts title="builder/turret-named.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface TurretOptions {
  readonly fireRate: number;
}

interface TurretPrivate {
  heat: number;
  mode: "cool" | "hot";
}

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

const overheated = (ctx: TurretOptions & TurretPrivate) => ctx.heat > ctx.fireRate;

const m = buildMachine<TurretOptions, TurretEvent>("turret")({
  privateCtx: (): TurretPrivate => ({ heat: 0, mode: "cool" }),
  initial: "/idle",
  states: { idle: {}, firing: {}, cooling: {} },
});

m.state("/idle").on("SPOTTED").to("/firing");
m.state("/firing").enter((ctx) => {
  ctx.heat += 1 / ctx.fireRate;
});
m.state("/firing").always().when(overheated).to("/cooling");
m.state("/firing").on("LOST").to("/idle");
m.state("/cooling").enter((ctx) => {
  ctx.mode = "hot";
});
m.state("/cooling").exit((ctx) => {
  ctx.heat = 0;
  ctx.mode = "cool";
});
m.state("/cooling").after(2).to("/idle");

export const turret = m.build();
```

```ts title="turret-satisfies.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface TurretPrivate {
  heat: number;
  targets: Hash[];
}

export const turret = defineMachine<{ readonly fireRate: number }, { type: "SPOTTED" }>()({
  privateCtx: () => ({ heat: 0, targets: [] }) satisfies TurretPrivate,
  initial: "/idle",
  states: {
    idle: {
      enter: (ctx) => {
        // @ts-expect-error -- `targets` is `never[]`: `satisfies` checked it and kept the narrow type
        ctx.targets.push(hash("crate"));
      },
    },
  },
});
```

```ts title="builder/turret-satisfies.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface TurretPrivate {
  heat: number;
  targets: Hash[];
}

const m = buildMachine<{ readonly fireRate: number }, { type: "SPOTTED" }>()({
  privateCtx: () => ({ heat: 0, targets: [] }) satisfies TurretPrivate,
  initial: "/idle",
  states: { idle: {} },
});

m.state("/idle").enter((ctx) => {
  // @ts-expect-error -- `targets` is `never[]`: `satisfies` checked it and kept the narrow type
  ctx.targets.push(hash("crate"));
});

export const turret = m.build();
```

```ts title="turret-start-heat.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface TurretOptions {
  readonly fireRate: number;
  readonly startHeat: number;
}

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

export const turret = defineMachine<TurretOptions, TurretEvent>("turret")({
  privateCtx: (ctx: TurretOptions) => ({ heat: ctx.startHeat }),
  initial: "/idle",
  states: {
    idle: { on: { SPOTTED: "/firing" } },
    firing: {
      enter: (ctx) => {
        ctx.heat += 1 / ctx.fireRate;
      },
      on: { LOST: "/idle" },
    },
  },
});

const gun = turret.start({ fireRate: 2, startHeat: 5 }); // gun.ctx shows fireRate and startHeat only
```

```ts title="builder/turret-start-heat.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

interface TurretOptions {
  readonly fireRate: number;
  readonly startHeat: number;
}

type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };

const m = buildMachine<TurretOptions, TurretEvent>("turret")({
  privateCtx: (ctx: TurretOptions) => ({ heat: ctx.startHeat }),
  initial: "/idle",
  states: { idle: {}, firing: {} },
});

m.state("/idle").on("SPOTTED").to("/firing");
m.state("/firing").enter((ctx) => {
  ctx.heat += 1 / ctx.fireRate;
});
m.state("/firing").on("LOST").to("/idle");

export const turret = m.build();
```

```ts title="hoisted-event.ts"
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

```ts title="lamp-paths.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type LampEvent = { type: "TOGGLE" };

defineMachine<{ presses: number }, LampEvent>()({
  initial: "/off",
  states: {
    off: {
      on: {
        TOGGLE: {
          to: "/on",
          // @ts-expect-error -- "/of" is not one of the machine's paths
          when: (_ctx, _event, machine) => machine.matches("/of"),
        },
      },
    },
    on: {
      on: {
        TOGGLE: {
          to: "/off",
          when: (_ctx, _event, machine) => machine.matches("/on"),
        },
      },
    },
  },
});
```

```ts title="bad-target.ts"
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

```ts title="builder/bad-target.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type GoEvent = { type: "GO" };

const m = buildMachine<{ steps: number }, GoEvent>()({
  initial: "/idle",
  states: { idle: {} },
});

// @ts-expect-error -- "/nowhere" is not one of the machine's paths
m.state("/idle").on("GO").to("/nowhere");

m.build();
```

```ts title="below-leaf.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

type GoEvent = { type: "GO" };

defineMachine<{ steps: number }, GoEvent>()({
  initial: "/idle",
  states: {
    idle: {
      on: {
        // @ts-expect-error -- "/done" has no child states, so no path goes below it
        GO: "/done/deeper",
      },
    },
    done: {},
  },
});
```

```ts title="builder/below-leaf.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";

type GoEvent = { type: "GO" };

const m = buildMachine<{ steps: number }, GoEvent>()({
  initial: "/idle",
  states: { idle: {}, done: {} },
});

// @ts-expect-error -- "/done" has no child states, so no path goes below it
m.state("/idle").on("GO").to("/done/deeper");

m.build();
```

```ts title="state-path.ts"
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

```ts title="builder/lift-machine.ts"
import { buildMachine } from "@defold-typescript/types/hsm/builder";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    call_lift: { floor: number };
    lift_arrived: { floor: number };
  }
}

const m = buildMachine<{ floor: number }, MessageEvent<"call_lift">>()({
  initial: "/waiting",
  states: { waiting: {} },
});

m.state("/waiting")
  .on("call_lift")
  .run((ctx, event) => {
    ctx.floor = event.floor;
    msg.post(event.sender, "lift_arrived", { floor: ctx.floor });
  });

export const liftMachine = m.build();

export const liftEvents = messageEvents(["call_lift"]);
```

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

```ts title="player-before.ts"
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

```ts title="builder/player-machine.ts"
import type { Vector3 } from "@defold-typescript/types";
import { buildMachine } from "@defold-typescript/types/hsm/builder";

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

const m = buildMachine<PlayerCtx, PlayerEvent>()({
  initial: "/airborne",
  states: {
    grounded: {
      initial: "/grounded/idle",
      states: { idle: {}, walk: {} },
    },
    airborne: {
      initial: "/airborne/falling",
      states: { rising: {}, falling: {} },
    },
  },
});

m.state("/grounded").update((ctx) => (ctx.ground_contact ? undefined : "/airborne"));
// Only allow jump from ground (extend with a counter for double-jumps).
m.state("/grounded")
  .on("JUMP")
  .to("/airborne/rising")
  .run((ctx) => {
    ctx.velocity.y = jump_takeoff_speed;
    ctx.ground_contact = false;
  });

m.state("/grounded/idle").enter(() => sprite.play_flipbook("#sprite", anim_idle));
m.state("/grounded/idle").update((ctx) =>
  ctx.ground_contact && ctx.velocity.x !== 0 ? "/grounded/walk" : undefined,
);
m.state("/grounded/walk").enter(() => sprite.play_flipbook("#sprite", anim_walk));
m.state("/grounded/walk").update((ctx) =>
  ctx.ground_contact && ctx.velocity.x === 0 ? "/grounded/idle" : undefined,
);

m.state("/airborne").update((ctx) => {
  if (!ctx.ground_contact) {
    return undefined;
  }
  return ctx.velocity.x === 0 ? "/grounded/idle" : "/grounded/walk";
});
m.state("/airborne/rising").enter(() => sprite.play_flipbook("#sprite", anim_jump));
// Cut the jump short if we are still going up.
m.state("/airborne/rising")
  .on("JUMP_RELEASED")
  .run((ctx) => {
    ctx.velocity.y = ctx.velocity.y * 0.5;
  });
m.state("/airborne/rising").update((ctx) =>
  ctx.velocity.y <= 0 && !ctx.ground_contact ? "/airborne/falling" : undefined,
);
m.state("/airborne/falling").enter(() => sprite.play_flipbook("#sprite", anim_fall));

export const playerMachine = m.build();
```
