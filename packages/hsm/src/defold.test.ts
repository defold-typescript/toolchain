/// <reference path="../../library-types/generated/monarch.monarch.d.ts" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type * as monarch from "monarch.monarch";
import {
  type MessageEvent,
  type MonarchEvent,
  type MonarchTransitionIds,
  messageEvents,
  monarchEvents,
} from "./defold";
import { defineMachine } from "./index";

declare global {
  interface CustomMessages {
    spawn_wave: { count: number };
  }
}

type Ev = MessageEvent<"spawn_wave"> | MessageEvent<"trigger_response"> | { type: "TICK" };

interface Ctx {
  waves: number[];
}

interface Self {
  readonly machine: { readonly send: (event: Ev) => void };
}

const globals = globalThis as unknown as { hash?: unknown };
let savedHash: unknown;
const sender = { path: "/spawner#script" } as unknown as Url;

beforeEach(() => {
  savedHash = globals.hash;
  globals.hash = (s: string) => `hash:${s}`;
});

afterEach(() => {
  globals.hash = savedHash;
});

function waveMachine() {
  return defineMachine<Ctx, Ev>()({
    initial: "/idle",
    states: {
      idle: {
        on: {
          spawn_wave: {
            target: "/spawning",
            actions: (ctx, event) => {
              const count: number = event.count;
              ctx.waves.push(count);
            },
          },
        },
      },
      spawning: { on: { TICK: "/idle" } },
    },
  });
}

describe("messageEvents", () => {
  test("toEvent maps a declared message id to its typed event and drives a machine", () => {
    const mapper = messageEvents(["spawn_wave", "trigger_response"]);
    const event = mapper.toEvent(hash("spawn_wave"), { count: 3 }, sender);
    expect(event).toEqual({ type: "spawn_wave", count: 3, sender });

    const ctx: Ctx = { waves: [] };
    const m = waveMachine().start(ctx);
    if (event !== undefined) {
      m.send(event);
    }
    expect(m.path).toBe("/spawning");
    expect(ctx.waves).toEqual([3]);
  });

  test("toEvent keeps the message's type and sender fields from overriding the event's", () => {
    const mapper = messageEvents(["spawn_wave", "trigger_response"]);
    const event: unknown = mapper.toEvent(
      hash("trigger_response"),
      { type: "spawn_wave", sender: "forged", enter: true },
      sender,
    );
    expect(event).toEqual({ type: "trigger_response", enter: true, sender });
  });

  test("an action reads the sender from the event", () => {
    const senders: Url[] = [];
    const machine = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: {
            spawn_wave: {
              target: "/spawning",
              actions: (_ctx, event) => {
                const from: Url = event.sender;
                senders.push(from);
              },
            },
          },
        },
        spawning: {},
      },
    });
    const event = messageEvents(["spawn_wave"]).toEvent(hash("spawn_wave"), { count: 1 }, sender);
    const m = machine.start({ waves: [] });
    if (event !== undefined) {
      m.send(event);
    }
    expect(senders).toEqual([sender]);
  });

  test("toEvent drops an undeclared id and never mutates the message", () => {
    const mapper = messageEvents(["spawn_wave", "trigger_response"]);
    const message = { count: 3 };
    expect(mapper.toEvent(hash("other_message"), message, sender)).toBeUndefined();
    const event = mapper.toEvent(hash("spawn_wave"), message, sender);
    expect(event).not.toBe(message);
    expect(message).toEqual({ count: 3 });
  });

  test("toEvent fits an on_message dispatcher", () => {
    const mapper = messageEvents(["spawn_wave"]);
    const ctx: Ctx = { waves: [] };
    const m = waveMachine().start(ctx);
    function on_message(
      self: Self,
      message_id: Hash,
      message: Record<string | number, unknown>,
      sender: Url,
    ): void {
      const event = mapper.toEvent(message_id, message, sender);
      if (event !== undefined) {
        self.machine.send(event);
      }
    }
    const dispatcher: MessageDispatcher<Self> = on_message;
    dispatcher({ machine: m }, hash("spawn_wave"), { count: 5 }, sender);
    expect(ctx.waves).toEqual([5]);
  });

  test("messageEvents rejects an undeclared message id at the type level", () => {
    // @ts-expect-error spwan_wave is not a declared message id
    const mapper = messageEvents(["spwan_wave"]);
    expect(mapper.toEvent(hash("spawn_wave"), {}, sender)).toBeUndefined();
  });
});

describe("monarchEvents", () => {
  function transitionIds(): MonarchTransitionIds {
    return {
      SCREEN_TRANSITION_IN_STARTED: hash("monarch_screen_transition_in_started"),
      SCREEN_TRANSITION_IN_FINISHED: hash("monarch_screen_transition_in_finished"),
      SCREEN_TRANSITION_OUT_STARTED: hash("monarch_screen_transition_out_started"),
      SCREEN_TRANSITION_OUT_FINISHED: hash("monarch_screen_transition_out_finished"),
      SCREEN_TRANSITION_FAILED: hash("monarch_screen_transition_failed"),
    };
  }

  let menu: Hash;
  let game: Hash;

  beforeEach(() => {
    menu = hash("menu");
    game = hash("game");
  });

  test("toEvent maps each of the five transition messages to its event", () => {
    const ids = transitionIds();
    const mapper = monarchEvents(ids);
    expect(
      mapper.toEvent(
        ids.SCREEN_TRANSITION_IN_STARTED,
        { screen: game, previous_screen: menu },
        sender,
      ),
    ).toEqual({
      type: "monarch_screen_transition_in_started",
      screen: game,
      previous_screen: menu,
      sender,
    });
    expect(
      mapper.toEvent(
        ids.SCREEN_TRANSITION_IN_FINISHED,
        { screen: game, previous_screen: menu },
        sender,
      ),
    ).toEqual({
      type: "monarch_screen_transition_in_finished",
      screen: game,
      previous_screen: menu,
      sender,
    });
    expect(
      mapper.toEvent(
        ids.SCREEN_TRANSITION_OUT_STARTED,
        { screen: menu, next_screen: game },
        sender,
      ),
    ).toEqual({
      type: "monarch_screen_transition_out_started",
      screen: menu,
      next_screen: game,
      sender,
    });
    expect(
      mapper.toEvent(
        ids.SCREEN_TRANSITION_OUT_FINISHED,
        { screen: menu, next_screen: game },
        sender,
      ),
    ).toEqual({
      type: "monarch_screen_transition_out_finished",
      screen: menu,
      next_screen: game,
      sender,
    });
    expect(mapper.toEvent(ids.SCREEN_TRANSITION_FAILED, { screen: game }, sender)).toEqual({
      type: "monarch_screen_transition_failed",
      screen: game,
      sender,
    });
  });

  test("a first IN_STARTED with an empty stack has no previous_screen", () => {
    const ids = transitionIds();
    const event = monarchEvents(ids).toEvent(
      ids.SCREEN_TRANSITION_IN_STARTED,
      { screen: menu },
      sender,
    );
    expect(event?.type).toBe("monarch_screen_transition_in_started");
    if (event?.type === "monarch_screen_transition_in_started") {
      expect(event.previous_screen).toBeUndefined();
    }
  });

  test("the mapped events drive a flow machine whose actions read the screen as a Hash", () => {
    interface Flow {
      shown: Hash[];
      failed: Hash[];
    }
    const flow = defineMachine<Flow, MonarchEvent>()({
      initial: "/loading",
      states: {
        loading: {
          on: {
            monarch_screen_transition_in_finished: {
              target: "/ready",
              actions: (ctx, event) => {
                const screen: Hash = event.screen;
                ctx.shown.push(screen);
              },
            },
            monarch_screen_transition_failed: {
              target: "/broken",
              actions: (ctx, event) => {
                const screen: Hash = event.screen;
                ctx.failed.push(screen);
              },
            },
          },
        },
        ready: {},
        broken: {},
      },
    });
    const ids = transitionIds();
    const mapper = monarchEvents(ids);

    const ok: Flow = { shown: [], failed: [] };
    const m = flow.start(ok);
    const started = mapper.toEvent(ids.SCREEN_TRANSITION_IN_STARTED, { screen: game }, sender);
    if (started !== undefined) {
      m.send(started);
    }
    expect(m.path).toBe("/loading");
    const finished = mapper.toEvent(ids.SCREEN_TRANSITION_IN_FINISHED, { screen: game }, sender);
    if (finished !== undefined) {
      m.send(finished);
    }
    expect(m.path).toBe("/ready");
    expect(ok.shown).toEqual([game]);

    const bad: Flow = { shown: [], failed: [] };
    const n = flow.start(bad);
    const failed = mapper.toEvent(ids.SCREEN_TRANSITION_FAILED, { screen: menu }, sender);
    if (failed !== undefined) {
      n.send(failed);
    }
    expect(n.path).toBe("/broken");
    expect(bad.failed).toEqual([menu]);
  });

  test("toEvent drops an id outside the five and never mutates the message", () => {
    const ids = transitionIds();
    const mapper = monarchEvents(ids);
    const message = { screen: game, previous_screen: menu };
    expect(mapper.toEvent(hash("spawn_wave"), message, sender)).toBeUndefined();
    expect(mapper.toEvent(hash("proxy_loaded"), message, sender)).toBeUndefined();
    const event = mapper.toEvent(ids.SCREEN_TRANSITION_IN_FINISHED, message, sender);
    expect(event).not.toBe(message);
    expect(message).toEqual({ screen: game, previous_screen: menu });
  });

  test("toEvent keeps a payload's type and sender fields from overriding the event's", () => {
    const ids = transitionIds();
    const event: unknown = monarchEvents(ids).toEvent(
      ids.SCREEN_TRANSITION_FAILED,
      { screen: game, type: "monarch_screen_transition_in_finished", sender: "forged" },
      sender,
    );
    expect(event).toEqual({ type: "monarch_screen_transition_failed", screen: game, sender });
  });

  test("monarchEvents requires all five ids and accepts the Monarch module namespace", () => {
    const ids: MonarchTransitionIds = {} as typeof monarch;
    expect(monarchEvents(ids).toEvent(hash("menu"), {}, sender)).toBeUndefined();
    // @ts-expect-error the other four transition ids are missing
    const mapper = monarchEvents({ SCREEN_TRANSITION_IN_STARTED: hash("x") });
    expect(mapper).toBeDefined();
  });
});
