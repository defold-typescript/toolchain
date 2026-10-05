import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type MessageEvent, messageEvents } from "./defold";
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
            to: "/spawning",
            run: (ctx, event) => {
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
              to: "/spawning",
              run: (_ctx, event) => {
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
