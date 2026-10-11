import { type EventObject, type MachineConfig, waitGroup } from "@defold-typescript/hsm";

/**
 * The live diagrams on the state machines tutorial. Each spec is a real `hsm`
 * config plus what its panel shows; Defold calls (`msg.post`, `go.animate`,
 * `sound.play`) are imitated through `ctx` fields that the readout and visual
 * read back.
 */

export type DemoCtx = Record<string, unknown>;

export type DemoButton<Ctx = DemoCtx, E extends EventObject = EventObject> =
  | { readonly label: string; readonly event: E }
  | { readonly label: string; readonly change: (ctx: Ctx) => void }
  | { readonly label: string; readonly restartWith: Partial<Ctx> }
  | { readonly label: string; readonly stop: true };

/** Every way the figure draws the buddy; `stopped` is a machine with no active state. */
export const BUDDY_POSES = ["asleep", "waking", "awake", "follow", "resting", "stopped"] as const;
export type BuddyPose = (typeof BUDDY_POSES)[number];

/** The buddy's antenna light: off, part-way through a fade, or fully on. */
export const BUDDY_LIGHTS = ["off", "dim", "lit"] as const;
export type BuddyLight = (typeof BUDDY_LIGHTS)[number];

/** How the figure answers one event a button sends: a jolt, a hop, or a question mark when no active state takes it. */
export const BUDDY_REACTIONS = ["bump", "hop", "ignored"] as const;
export type BuddyReaction = (typeof BUDDY_REACTIONS)[number];

/** The drawn buddy. A machine with no light yet leaves `light` out. */
export interface DemoVisual {
  readonly pose: BuddyPose;
  readonly light?: BuddyLight;
}

/** What a readout or visual may read from a running demo. */
export interface DemoView<Ctx> {
  readonly ctx: Ctx;
  readonly path: string | undefined;
  readonly stopped: boolean;
  readonly matches: (path: string) => boolean;
}

function buddyPose(m: DemoView<unknown>): BuddyPose {
  if (m.matches("/awake/follow")) return "follow";
  if (m.matches("/awake")) return "awake";
  if (m.matches("/waking")) return "waking";
  if (m.matches("/resting")) return "resting";
  if (m.matches("/asleep")) return "asleep";
  return "stopped";
}

export interface DemoSpec<Ctx, E extends EventObject> {
  readonly title: string;
  readonly subtitle: string;
  readonly config: MachineConfig<Ctx, E, string>;
  readonly ctx: () => Ctx;
  readonly buttonsLabel?: string;
  readonly buttons: readonly DemoButton<Ctx, E>[];
  readonly readout: (m: DemoView<Ctx>) => readonly (readonly [string, string])[];
  readonly visual?: (m: DemoView<Ctx>) => DemoVisual;
  /** Advances the imitated Defold work (an animation) before the machine's own update. */
  readonly tick?: (ctx: Ctx, dt: number) => void;
  /** Driven by the page heartbeat, with pause and speed controls. */
  readonly timed?: boolean;
  /** Starts with the clock paused; read only with `timed`. */
  readonly paused?: boolean;
  readonly speed?: number;
  /**
   * Plain-words labels for rule chips, keyed by chip id (`<path>|on|<event>|<index>`,
   * `<path>|always|<index>`, `<path>|update`, `<path>|<after or every>|<delay>` for the form
   * written by delay, `<path>|<after or every>|#<index>` for the list form).
   * A rule whose label describes its `when` names what its `run` does under `<chip id>|run`.
   * A delay that is a function is shown as the words under `<chip id>|delay` until it is read.
   */
  readonly notes?: Readonly<Record<string, string>>;
  /** The paths of the states whose `update` hook never returns a path; they get no rule line for it. */
  readonly quietUpdates?: readonly string[];
}

export type Demo = DemoSpec<DemoCtx, EventObject>;

// Specs are authored against their own Ctx and event types; the runtime and the
// view handle every demo alike.
function demo<Ctx, E extends EventObject>(spec: DemoSpec<Ctx, E>): Demo {
  return spec as unknown as Demo;
}

type FirstCtx = { wakes: number };
type FirstEvent = { type: "POKE" };

const buddyFirst = demo<FirstCtx, FirstEvent>({
  title: "A robot buddy",
  subtitle: "Two states, one event.",
  config: {
    initial: "/asleep",
    states: {
      asleep: { on: { POKE: "/awake" } },
      awake: {
        enter: (ctx) => {
          ctx.wakes += 1;
        },
        on: { POKE: "/asleep" },
      },
    },
  },
  ctx: () => ({ wakes: 0 }),
  buttons: [{ label: "POKE", event: { type: "POKE" } }],
  readout: (m) => [["ctx.wakes", String(m.ctx.wakes)]],
  visual: (m) => ({ pose: buddyPose(m) }),
});

type NestedEvent = FirstEvent | { type: "SEE_PLAYER" } | { type: "LOSE_PLAYER" };

const buddyNested = demo<FirstCtx, NestedEvent>({
  title: "The buddy wanders and follows",
  subtitle: "wander and follow live inside awake.",
  config: {
    initial: "/asleep",
    states: {
      asleep: { on: { POKE: "/awake" } },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.wakes += 1;
        },
        on: { POKE: "/asleep" },
        states: {
          wander: { on: { SEE_PLAYER: "/awake/follow" } },
          follow: { on: { LOSE_PLAYER: "/awake/wander" } },
        },
      },
    },
  },
  ctx: () => ({ wakes: 0 }),
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "SEE_PLAYER", event: { type: "SEE_PLAYER" } },
    { label: "LOSE_PLAYER", event: { type: "LOSE_PLAYER" } },
  ],
  readout: (m) => [
    ['matches("/awake")', String(m.matches("/awake"))],
    ['matches("/awake/follow")', String(m.matches("/awake/follow"))],
    ["ctx.wakes", String(m.ctx.wakes)],
  ],
  visual: (m) => ({ pose: buddyPose(m) }),
});

type EnergyCtx = { wakes: number; energy: number };
type EnergyEvent = NestedEvent | { type: "BUMP"; cost: number } | { type: "RECHARGE" };

const ENERGY_NOTES = {
  "/awake|on|BUMP|0": "if the bump uses up the energy",
  "/awake|on|BUMP|0|run": "energy = 0",
  "/awake|on|BUMP|1": "lose energy",
  "/resting|on|RECHARGE|0": "energy = 3",
};

const buddyEnergy = demo<EnergyCtx, EnergyEvent>({
  title: "The buddy gets tired",
  subtitle: "BUMP is handled by awake, whichever child is active.",
  config: {
    initial: "/asleep",
    states: {
      asleep: { on: { POKE: "/awake" } },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.wakes += 1;
        },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: { on: { SEE_PLAYER: "/awake/follow" } },
          follow: { on: { LOSE_PLAYER: "/awake/wander" } },
        },
      },
      resting: {
        on: {
          RECHARGE: {
            to: "/awake",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ wakes: 0, energy: 3 }),
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "SEE_PLAYER", event: { type: "SEE_PLAYER" } },
    { label: "LOSE_PLAYER", event: { type: "LOSE_PLAYER" } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["ctx.energy", String(m.ctx.energy)],
    ['matches("/awake")', String(m.matches("/awake"))],
  ],
  visual: (m) => ({ pose: buddyPose(m) }),
  notes: ENERGY_NOTES,
});

// From here on the buddy has a light. `msg.post(ctx.light, "enable")` and
// `"disable"` are imitated by `ctx.lit`.
type TimeCtx = EnergyCtx & { lit: boolean };

const buddyTime = demo<TimeCtx, EnergyEvent>({
  title: "The buddy keeps time",
  subtitle: "Two timers and an every-frame check.",
  timed: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: { on: { POKE: "/awake" } },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.wakes += 1;
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: { on: { SEE_PLAYER: "/awake/follow" } },
          follow: {
            after: { 4: "/awake/wander" },
            on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/awake" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/awake",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, wakes: 0, energy: 3 }),
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "SEE_PLAYER", event: { type: "SEE_PLAYER" } },
    { label: "LOSE_PLAYER", event: { type: "LOSE_PLAYER" } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [["ctx.energy", m.ctx.energy.toFixed(1)]],
  visual: (m) => ({ pose: buddyPose(m), light: m.ctx.lit ? "lit" : "off" }),
  notes: { ...ENERGY_NOTES, "/resting|update": "fill up, then go to awake" },
});

/**
 * An imitated Defold call that takes time and then reports: a `go.animate` of the light's
 * `tint.w` from 0 to 1, a `sound.play`.
 */
interface Job {
  t: number;
  readonly duration: number;
  readonly done: () => void;
}

// `glow` stands for the light's `tint.w`, and `fade` for the animation on it.
type FadeCtx = TimeCtx & { glow: number; fade: Job | undefined };

function advanceFade(ctx: FadeCtx, dt: number): void {
  const fade = ctx.fade;
  if (fade === undefined) return;
  fade.t += dt;
  ctx.glow = Math.min(1, fade.t / fade.duration);
  if (fade.t >= fade.duration) {
    ctx.fade = undefined;
    fade.done();
  }
}

function lightGlow(ctx: FadeCtx): BuddyLight {
  if (!ctx.lit) return "off";
  return ctx.glow < 1 ? "dim" : "lit";
}

type WakingCtx = FadeCtx & { cleanup: boolean };
type WakingEvent = EnergyEvent | { type: "WOKEN" };

const buddyWaking = demo<WakingCtx, WakingEvent>({
  title: "The buddy wakes up slowly",
  subtitle: "Running at half speed so you can catch the fade.",
  timed: true,
  speed: 0.5,
  config: {
    initial: "/asleep",
    states: {
      asleep: { on: { POKE: "/waking" } },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          if (!ctx.cleanup) return;
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/awake", POKE: "/asleep" },
      },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.wakes += 1;
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: { on: { SEE_PLAYER: "/awake/follow" } },
          follow: {
            after: { 4: "/awake/wander" },
            on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/awake" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/awake",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, cleanup: true, wakes: 0, energy: 3 }),
  tick: advanceFade,
  buttonsLabel: "Send an event, or change the code",
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "SEE_PLAYER", event: { type: "SEE_PLAYER" } },
    { label: "LOSE_PLAYER", event: { type: "LOSE_PLAYER" } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
    {
      label: "Toggle cancel in exit",
      change: (ctx) => {
        ctx.cleanup = !ctx.cleanup;
      },
    },
  ],
  readout: (m) => [
    ["cancel in exit", m.ctx.cleanup ? "on" : "off (bug!)"],
    ["animation", m.ctx.fade === undefined ? "none" : "running"],
    ["light", m.ctx.lit ? "enabled" : "disabled"],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  notes: { ...ENERGY_NOTES, "/resting|update": "fill up, then go to awake" },
});

type QueueEvent =
  | { type: "POKE" }
  | { type: "BUMP"; cost: number }
  | { type: "RECHARGE" }
  | { type: "WOKEN" }
  | { type: "trigger_response"; enter: boolean };

const buddyQueue = demo<FadeCtx, QueueEvent>({
  title: "The buddy wakes itself",
  subtitle: "Time starts paused in this one, so the fade waits for you.",
  timed: true,
  paused: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/awake", POKE: "/asleep" },
      },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.wakes += 1;
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: { 4: "/awake/wander" },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/awake" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/awake",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, wakes: 0, energy: 3 }),
  tick: advanceFade,
  buttonsLabel: "Start it, stop it, or send an event",
  buttons: [
    { label: "start() with wakes = 0", restartWith: { wakes: 0 } },
    { label: "start() with wakes = 1", restartWith: { wakes: 1 } },
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
    { label: "stop()", stop: true },
  ],
  readout: (m) => [
    ["ctx.wakes", String(m.ctx.wakes)],
    ["stopped", String(m.stopped)],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  notes: {
    ...ENERGY_NOTES,
    "/resting|update": "fill up, then go to awake",
    "/awake/wander|on|trigger_response|0": "if the player walked in",
    "/awake/follow|on|trigger_response|0": "if the player walked in",
    "/awake/follow|on|trigger_response|1": "otherwise",
  },
});

// Every rule of a buddy with a checkup, apart from the `update` hook of `resting`.
const CHECKUP_RULE_NOTES = {
  ...ENERGY_NOTES,
  "/awake/wander|on|trigger_response|0": "if the player walked in",
  "/awake/follow|on|trigger_response|0": "if the player walked in",
  "/awake/follow|on|trigger_response|1": "otherwise",
  "/checkup|always|0": "if the battery is under 1",
  "/checkup|always|1": "otherwise",
  "/checkup|always|1|run": "wakes + 1",
};

const CHECKUP_NOTES = {
  ...CHECKUP_RULE_NOTES,
  "/resting|update": "fill up, then go to checkup",
};

const buddyCheckup = demo<FadeCtx, QueueEvent>({
  title: "The buddy checks its battery",
  subtitle: "checkup never waits: it picks a rule the moment it is entered.",
  timed: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/checkup", POKE: "/asleep" },
      },
      checkup: {
        always: [
          { to: "/resting", when: (ctx) => ctx.energy < 1 },
          {
            to: "/awake",
            run: (ctx) => {
              ctx.wakes += 1;
            },
          },
        ],
      },
      awake: {
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: { 4: "/awake/wander" },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/checkup" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/checkup",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, wakes: 0, energy: 3 }),
  tick: advanceFade,
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 2.5)", event: { type: "BUMP", cost: 2.5 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["ctx.energy", m.ctx.energy.toFixed(1)],
    ["ctx.wakes", String(m.ctx.wakes)],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  notes: CHECKUP_NOTES,
});

const buddyMemory = demo<FadeCtx, QueueEvent>({
  title: "The buddy remembers",
  subtitle: "awake goes back to the child it was in.",
  timed: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/checkup", POKE: "/asleep" },
      },
      checkup: {
        always: [
          { to: "/resting", when: (ctx) => ctx.energy < 1 },
          {
            to: "/awake",
            run: (ctx) => {
              ctx.wakes += 1;
            },
          },
        ],
      },
      awake: {
        restoreDepth: 1,
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: { 4: "/awake/wander" },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/checkup" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/checkup",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, wakes: 0, energy: 3 }),
  tick: advanceFade,
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 2.5)", event: { type: "BUMP", cost: 2.5 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ['matches("/awake/follow")', String(m.matches("/awake/follow"))],
    ["ctx.energy", m.ctx.energy.toFixed(1)],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  notes: CHECKUP_NOTES,
});

const buddyDrain = demo<FadeCtx, QueueEvent>({
  title: "The buddy runs down",
  subtitle: "awake sends itself a small BUMP every second.",
  timed: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/checkup", POKE: "/asleep" },
      },
      checkup: {
        always: [
          { to: "/resting", when: (ctx) => ctx.energy < 1 },
          {
            to: "/awake",
            run: (ctx) => {
              ctx.wakes += 1;
            },
          },
        ],
      },
      awake: {
        restoreDepth: 1,
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        every: {
          1: (_ctx, m) => m.send({ type: "BUMP", cost: 1 / 16 }),
        },
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: { 4: "/awake/wander" },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return ctx.energy >= 3 ? "/checkup" : undefined;
        },
        on: {
          RECHARGE: {
            to: "/checkup",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, wakes: 0, energy: 3 }),
  tick: advanceFade,
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 2.5)", event: { type: "BUMP", cost: 2.5 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["ctx.energy", m.ctx.energy.toFixed(2)],
    ['matches("/awake")', String(m.matches("/awake"))],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  notes: { ...CHECKUP_NOTES, "/awake|every|1": "send BUMP, cost 1/16" },
});

// `napSeconds` is how long the next nap lasts.
type NapCtx = FadeCtx & { napSeconds: number };

const NAP_NOTES = {
  ...CHECKUP_RULE_NOTES,
  "/awake|every|#0": "send BUMP, cost 1/16",
  "/awake|every|#0|delay": "1 s, or 2 s on a low battery",
  "/awake/follow|after|4": "napSeconds + 1, up to 5",
  "/resting|after|#0": "if the battery is full",
  "/resting|after|#0|run": "napSeconds = 2",
  "/resting|after|#0|delay": "napSeconds",
};

const buddyNap = demo<NapCtx, QueueEvent>({
  title: "The buddy naps as long as it needs",
  subtitle: "resting reads its delay when it is entered, then waits for a full battery.",
  timed: true,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: () => finish({ type: "WOKEN" }) };
        },
        exit: (ctx) => {
          ctx.fade = undefined;
          ctx.lit = false;
        },
        on: { WOKEN: "/checkup", POKE: "/asleep" },
      },
      checkup: {
        always: [
          { to: "/resting", when: (ctx) => ctx.energy < 1 },
          {
            to: "/awake",
            run: (ctx) => {
              ctx.wakes += 1;
            },
          },
        ],
      },
      awake: {
        restoreDepth: 1,
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        every: [
          {
            delay: (ctx) => (ctx.energy < 2 ? 2 : 1),
            run: (_ctx, m) => m.send({ type: "BUMP", cost: 1 / 16 }),
          },
        ],
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: {
              4: {
                to: "/awake/wander",
                run: (ctx) => {
                  ctx.napSeconds = Math.min(5, ctx.napSeconds + 1);
                },
              },
            },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return undefined;
        },
        after: [
          {
            delay: (ctx) => ctx.napSeconds,
            to: "/checkup",
            when: (ctx) => ctx.energy >= 3,
            run: (ctx) => {
              ctx.napSeconds = 2;
            },
          },
        ],
        on: {
          RECHARGE: {
            to: "/checkup",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ lit: false, glow: 1, fade: undefined, wakes: 0, energy: 3, napSeconds: 2 }),
  tick: advanceFade,
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 2.5)", event: { type: "BUMP", cost: 2.5 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["ctx.energy", m.ctx.energy.toFixed(2)],
    ["ctx.napSeconds", String(m.ctx.napSeconds)],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  quietUpdates: ["/resting"],
  notes: NAP_NOTES,
});

// `chirp` stands for the `sound.play` that runs beside the fade.
type ChirpCtx = NapCtx & { chirp: Job | undefined };

function advanceJobs(ctx: ChirpCtx, dt: number): void {
  advanceFade(ctx, dt);
  // Read after the fade: a fade that was the last job has left `waking`, and its cleanup cleared the chirp.
  const chirp = ctx.chirp;
  if (chirp === undefined) return;
  chirp.t += dt;
  if (chirp.t >= chirp.duration) {
    ctx.chirp = undefined;
    chirp.done();
  }
}

function pendingJobs(ctx: ChirpCtx): string {
  const pending: string[] = [];
  if (ctx.fade !== undefined) pending.push("fade");
  if (ctx.chirp !== undefined) pending.push("chirp");
  return pending.length === 0 ? "0" : `${pending.length}: ${pending.join(", ")}`;
}

const buddyChirp = demo<ChirpCtx, QueueEvent>({
  title: "The buddy wakes with a chirp",
  subtitle: "Time starts paused in this one. waking has started two jobs and waits for both.",
  timed: true,
  paused: true,
  speed: 0.5,
  config: {
    initial: "/asleep",
    states: {
      asleep: {
        enter: (ctx, m) => {
          if (ctx.wakes === 0) m.send({ type: "POKE" });
        },
        on: { POKE: "/waking" },
      },
      waking: {
        task: (ctx, finish) => {
          const group = waitGroup();
          ctx.glow = 0;
          ctx.lit = true;
          ctx.fade = { t: 0, duration: 1, done: group.add() };
          ctx.chirp = { t: 0, duration: 0.5, done: group.add() };
          group.wait(() => finish({ type: "WOKEN" }));
          return () => {
            ctx.fade = undefined;
            ctx.chirp = undefined;
            ctx.lit = false;
          };
        },
        on: { WOKEN: "/checkup", POKE: "/asleep" },
      },
      checkup: {
        always: [
          { to: "/resting", when: (ctx) => ctx.energy < 1 },
          {
            to: "/awake",
            run: (ctx) => {
              ctx.wakes += 1;
            },
          },
        ],
      },
      awake: {
        restoreDepth: 1,
        initial: "/awake/wander",
        enter: (ctx) => {
          ctx.lit = true;
        },
        exit: (ctx) => {
          ctx.lit = false;
        },
        after: { 30: "/asleep" },
        every: [
          {
            delay: (ctx) => (ctx.energy < 2 ? 2 : 1),
            run: (_ctx, m) => m.send({ type: "BUMP", cost: 1 / 16 }),
          },
        ],
        on: {
          POKE: "/asleep",
          BUMP: [
            {
              to: "/resting",
              when: (ctx, event) => ctx.energy <= event.cost,
              run: (ctx) => {
                ctx.energy = 0;
              },
            },
            {
              run: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: {
            on: {
              trigger_response: { to: "/awake/follow", when: (_ctx, event) => event.enter },
            },
          },
          follow: {
            after: {
              4: {
                to: "/awake/wander",
                run: (ctx) => {
                  ctx.napSeconds = Math.min(5, ctx.napSeconds + 1);
                },
              },
            },
            on: {
              trigger_response: [
                { to: "/awake/follow", when: (_ctx, event) => event.enter },
                { to: "/awake/wander" },
              ],
            },
          },
        },
      },
      resting: {
        update: (ctx, dt) => {
          ctx.energy = Math.min(3, ctx.energy + dt);
          return undefined;
        },
        after: [
          {
            delay: (ctx) => ctx.napSeconds,
            to: "/checkup",
            when: (ctx) => ctx.energy >= 3,
            run: (ctx) => {
              ctx.napSeconds = 2;
            },
          },
        ],
        on: {
          RECHARGE: {
            to: "/checkup",
            run: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({
    lit: false,
    glow: 1,
    fade: undefined,
    chirp: undefined,
    wakes: 0,
    energy: 3,
    napSeconds: 2,
  }),
  tick: advanceJobs,
  buttons: [
    { label: "POKE", event: { type: "POKE" } },
    { label: "trigger_response (enter true)", event: { type: "trigger_response", enter: true } },
    { label: "trigger_response (enter false)", event: { type: "trigger_response", enter: false } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 2.5)", event: { type: "BUMP", cost: 2.5 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["jobs pending", pendingJobs(m.ctx)],
    ["ctx.energy", m.ctx.energy.toFixed(2)],
  ],
  visual: (m) => ({ pose: buddyPose(m), light: lightGlow(m.ctx) }),
  quietUpdates: ["/resting"],
  notes: NAP_NOTES,
});

export const DEMOS = {
  "buddy-first": buddyFirst,
  "buddy-nested": buddyNested,
  "buddy-energy": buddyEnergy,
  "buddy-time": buddyTime,
  "buddy-waking": buddyWaking,
  "buddy-queue": buddyQueue,
  "buddy-checkup": buddyCheckup,
  "buddy-memory": buddyMemory,
  "buddy-drain": buddyDrain,
  "buddy-nap": buddyNap,
  "buddy-chirp": buddyChirp,
} satisfies Record<string, Demo>;

export type DemoId = keyof typeof DEMOS;
