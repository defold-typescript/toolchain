import type { EventObject, MachineConfig } from "@defold-typescript/hsm";

/**
 * The live diagrams on the state machines tutorial. Each spec is a real `hsm`
 * config plus what its panel shows; Defold calls (`msg.post`, `go.animate`) are
 * imitated through `ctx` fields that the readout and visual read back.
 */

export type DemoCtx = Record<string, unknown>;

export type DemoButton<Ctx = DemoCtx, E extends EventObject = EventObject> =
  | { readonly label: string; readonly event: E }
  | { readonly label: string; readonly change: (ctx: Ctx) => void }
  | { readonly label: string; readonly restartWith: Partial<Ctx> };

export type DemoVisual =
  | { readonly kind: "bulb"; readonly glow: "off" | "dim" | "lit" }
  | { readonly kind: "sprite"; readonly shown: boolean }
  | { readonly kind: "door"; readonly opacity: number };

/** What a readout or visual may read from a running demo. */
export interface DemoView<Ctx> {
  readonly ctx: Ctx;
  readonly path: string;
  readonly stopped: boolean;
  readonly matches: (path: string) => boolean;
}

export interface DemoSpec<Ctx, E extends EventObject> {
  readonly title: string;
  readonly subtitle: string;
  readonly config: MachineConfig<Ctx, E>;
  readonly ctx: () => Ctx;
  readonly buttonsLabel?: string;
  readonly buttons: readonly DemoButton<Ctx, E>[];
  readonly readout: (m: DemoView<Ctx>) => readonly (readonly [string, string])[];
  readonly visual?: (m: DemoView<Ctx>) => DemoVisual;
  /** Advances the imitated Defold work (an animation) before the machine's own update. */
  readonly tick?: (ctx: Ctx, dt: number) => void;
  /** Driven by the page heartbeat, with pause and speed controls. */
  readonly timed?: boolean;
  readonly speed?: number;
  /** Plain-words labels for rule chips, keyed by chip id (`<path>|on|<event>|<index>`, `<path>|update`). */
  readonly notes?: Readonly<Record<string, string>>;
}

export type Demo = DemoSpec<DemoCtx, EventObject>;

// Specs are authored against their own Ctx and event types; the runtime and the
// view handle every demo alike.
function demo<Ctx, E extends EventObject>(spec: DemoSpec<Ctx, E>): Demo {
  return spec as unknown as Demo;
}

type LampCtx = { switches: number };
type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

const lamp = demo<LampCtx, LampEvent>({
  title: "A lamp",
  subtitle: "Two states, one event.",
  config: {
    initial: "off",
    states: {
      off: { on: { TOGGLE: "on" } },
      on: {
        enter: (ctx) => {
          ctx.switches += 1;
        },
        on: { TOGGLE: "off" },
      },
    },
  },
  ctx: () => ({ switches: 0 }),
  buttons: [{ label: "TOGGLE", event: { type: "TOGGLE" } }],
  readout: (m) => [["ctx.switches", String(m.ctx.switches)]],
  visual: (m) => ({ kind: "bulb", glow: m.matches("on") ? "lit" : "off" }),
});

const nestedLamp = demo<LampCtx, LampEvent>({
  title: "A lamp with brightness",
  subtitle: "bright and dim live inside on.",
  config: {
    initial: "off",
    states: {
      off: { on: { TOGGLE: "on" } },
      on: {
        initial: "bright",
        enter: (ctx) => {
          ctx.switches += 1;
        },
        on: { TOGGLE: "off" },
        states: {
          bright: { on: { DIM: "dim" } },
          dim: { on: { DIM: "bright" } },
        },
      },
    },
  },
  ctx: () => ({ switches: 0 }),
  buttons: [
    { label: "TOGGLE", event: { type: "TOGGLE" } },
    { label: "DIM", event: { type: "DIM" } },
  ],
  readout: (m) => [
    ['matches("on")', String(m.matches("on"))],
    ['matches("on.dim")', String(m.matches("on.dim"))],
    ["ctx.switches", String(m.ctx.switches)],
  ],
  visual: (m) => ({
    kind: "bulb",
    glow: m.matches("on.bright") ? "lit" : m.matches("on.dim") ? "dim" : "off",
  }),
});

type BuddyCtx = { energy: number };
type BuddyEvent =
  | { type: "BUMP"; cost: number }
  | { type: "SEE_PLAYER" }
  | { type: "LOSE_PLAYER" }
  | { type: "FALL" }
  | { type: "RECHARGE" };

const buddy = demo<BuddyCtx, BuddyEvent>({
  title: "A robot buddy",
  subtitle: "BUMP is handled by alive, whichever child is active.",
  config: {
    initial: "alive",
    states: {
      alive: {
        initial: "wander",
        on: {
          BUMP: [
            { target: "resting", guard: (ctx, event) => ctx.energy <= event.cost },
            {
              actions: (ctx, event) => {
                ctx.energy -= event.cost;
              },
            },
          ],
        },
        states: {
          wander: { on: { SEE_PLAYER: "follow" } },
          follow: {
            on: {
              LOSE_PLAYER: "wander",
              SEE_PLAYER: { target: "follow", reenter: true },
              FALL: "#resting",
            },
          },
        },
      },
      resting: {
        on: {
          RECHARGE: {
            target: "alive",
            actions: (ctx) => {
              ctx.energy = 3;
            },
          },
        },
      },
    },
  },
  ctx: () => ({ energy: 3 }),
  buttons: [
    { label: "SEE_PLAYER", event: { type: "SEE_PLAYER" } },
    { label: "LOSE_PLAYER", event: { type: "LOSE_PLAYER" } },
    { label: "BUMP (cost 1)", event: { type: "BUMP", cost: 1 } },
    { label: "BUMP (cost 3)", event: { type: "BUMP", cost: 3 } },
    { label: "FALL", event: { type: "FALL" } },
    { label: "RECHARGE", event: { type: "RECHARGE" } },
  ],
  readout: (m) => [
    ["ctx.energy", String(m.ctx.energy)],
    ['matches("alive")', String(m.matches("alive"))],
  ],
  notes: {
    "alive|on|BUMP|0": "if the bump uses up the energy",
    "alive|on|BUMP|1": "lose energy",
    "resting|on|RECHARGE|0": "energy = 3",
  },
});

type FeetCtx = { on_ground: boolean };
type FeetEvent = { type: "JUMP" };

const land = (ctx: FeetCtx) => (ctx.on_ground ? "grounded" : undefined);

const feet = demo<FeetCtx, FeetEvent>({
  title: "Feet with coyote time",
  subtitle: "Running at quarter speed so you can see the timers.",
  timed: true,
  speed: 0.25,
  config: {
    initial: "grounded",
    states: {
      grounded: {
        update: (ctx) => (ctx.on_ground ? undefined : "coyote"),
        on: { JUMP: "jumping" },
      },
      coyote: {
        update: land,
        after: { 0.1: "falling" },
        on: { JUMP: "jumping" },
      },
      jumping: { after: { 0.4: "falling" } },
      falling: { update: land },
    },
  },
  ctx: () => ({ on_ground: true }),
  buttonsLabel: "Change the world, or send an event",
  buttons: [
    {
      label: "Walk off a ledge",
      change: (ctx) => {
        ctx.on_ground = false;
      },
    },
    {
      label: "Touch the ground",
      change: (ctx) => {
        ctx.on_ground = true;
      },
    },
    { label: "JUMP", event: { type: "JUMP" } },
  ],
  readout: (m) => [["ctx.on_ground", String(m.ctx.on_ground)]],
  notes: {
    "grounded|update": "no ground? go to coyote",
    "coyote|update": "ground back? go to grounded",
    "falling|update": "ground back? go to grounded",
  },
});

type SparkleCtx = { visible: boolean };
type SparkleEvent = { type: "STAR" };

const sparkle = demo<SparkleCtx, SparkleEvent>({
  title: "Star sparkle",
  subtitle: "The sprite square is shown and hidden by enter hooks.",
  timed: true,
  speed: 0.5,
  config: {
    initial: "normal",
    states: {
      normal: { on: { STAR: "sparkling" } },
      sparkling: {
        initial: "shown",
        after: { 2: "normal" },
        exit: (ctx) => {
          ctx.visible = true;
        },
        states: {
          shown: {
            enter: (ctx) => {
              ctx.visible = true;
            },
            after: { 0.1: "hidden" },
          },
          hidden: {
            enter: (ctx) => {
              ctx.visible = false;
            },
            after: { 0.1: "shown" },
          },
        },
      },
    },
  },
  ctx: () => ({ visible: true }),
  buttons: [{ label: "STAR", event: { type: "STAR" } }],
  readout: (m) => [["sprite", m.ctx.visible ? "enabled" : "disabled"]],
  visual: (m) => ({ kind: "sprite", shown: m.ctx.visible }),
});

interface Fade {
  t: number;
  readonly duration: number;
  readonly done: () => void;
}

type DoorCtx = { tint: number; fade: Fade | undefined; cleanup: boolean; opens: number };
type DoorEvent =
  | { type: "trigger_response"; enter: boolean }
  | { type: "OPENED" }
  | { type: "CLOSE" };

const door = demo<DoorCtx, DoorEvent>({
  title: "A door",
  subtitle: "The fade is slowed down. The door opens by fading out.",
  timed: true,
  speed: 0.5,
  config: {
    initial: "closed",
    states: {
      closed: {
        enter: (ctx) => {
          ctx.tint = 1;
        },
        on: { trigger_response: { target: "opening", guard: (_ctx, event) => event.enter } },
      },
      opening: {
        invoke: (ctx, settle) => {
          ctx.fade = { t: 0, duration: 0.5, done: () => settle({ type: "OPENED" }) };
        },
        exit: (ctx) => {
          if (ctx.cleanup) ctx.fade = undefined;
        },
        on: { OPENED: "open", CLOSE: "closed" },
      },
      open: {
        enter: (ctx) => {
          ctx.opens += 1;
        },
        after: { 3: "closed" },
        on: { CLOSE: "closed" },
      },
    },
  },
  ctx: () => ({ tint: 1, fade: undefined, cleanup: true, opens: 0 }),
  tick: (ctx, dt) => {
    const fade = ctx.fade;
    if (fade === undefined) return;
    fade.t += dt;
    ctx.tint = Math.max(0, 1 - fade.t / fade.duration);
    if (fade.t >= fade.duration) {
      ctx.fade = undefined;
      fade.done();
    }
  },
  buttons: [
    { label: "Player walks in", event: { type: "trigger_response", enter: true } },
    { label: "Player walks out", event: { type: "trigger_response", enter: false } },
    { label: "CLOSE", event: { type: "CLOSE" } },
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
    ["ctx.opens", String(m.ctx.opens)],
  ],
  visual: (m) => ({ kind: "door", opacity: m.ctx.tint }),
  notes: { "closed|on|trigger_response|0": "if the player walked in" },
});

type LevelCtx = { cached: boolean };
type LevelEvent = { type: "LOADED" } | { type: "QUIT" };

const level = demo<LevelCtx, LevelEvent>({
  title: "A level",
  subtitle: "Events sent from inside a hook wait their turn.",
  config: {
    initial: "loading",
    states: {
      loading: {
        enter: (ctx, m) => {
          if (ctx.cached) m.send({ type: "LOADED" });
        },
        on: { LOADED: "playing" },
      },
      playing: { on: { QUIT: "done" } },
      done: {
        enter: (_ctx, m) => {
          m.stop();
        },
      },
    },
  },
  ctx: () => ({ cached: true }),
  buttonsLabel: "Start it, or send an event",
  buttons: [
    { label: "start() with cached = true", restartWith: { cached: true } },
    { label: "start() with cached = false", restartWith: { cached: false } },
    { label: "LOADED", event: { type: "LOADED" } },
    { label: "QUIT", event: { type: "QUIT" } },
  ],
  readout: (m) => [
    ["ctx.cached", String(m.ctx.cached)],
    ["stopped", String(m.stopped)],
  ],
});

export const DEMOS = {
  lamp,
  "nested-lamp": nestedLamp,
  buddy,
  feet,
  sparkle,
  door,
  level,
} satisfies Record<string, Demo>;

export type DemoId = keyof typeof DEMOS;
