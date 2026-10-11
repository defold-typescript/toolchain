# State machines guide excerpts

The code the State machines guide in `packages/docs/guide/state-machines.md` and the tutorial in `packages/docs/guide/state-machines-tutorial.md` quote, and the whole machines `packages/cli/src/hsm-guide-recipe.test.ts` runs. `packages/cli/src/hsm-guide-fences.test.ts` compiles every fence here and holds each `ts excerpt` fence on the guide pages to this text, whitespace aside.

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
