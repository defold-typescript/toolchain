import { describe, expect, test } from "bun:test";
import { addEntity, processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
import { defineMachine } from "@defold-typescript/types/hsm";

describe("the bundled libraries run under bun test from the types package", () => {
  test("a machine imported from @defold-typescript/types/hsm moves on an event", () => {
    const lamp = defineMachine<{ presses: number }, { type: "PRESS" }>()({
      initial: "/off",
      states: {
        off: { on: { PRESS: "/on" } },
        on: {
          enter: (ctx) => {
            ctx.presses += 1;
          },
        },
      },
    });
    const instance = lamp.start({ presses: 0 });
    expect(instance.path).toBe("/off");

    instance.send({ type: "PRESS" });

    expect(instance.path).toBe("/on");
    expect(instance.ctx.presses).toBe(1);
  });

  test("a world imported from @defold-typescript/types/ecs runs a system over its entities", () => {
    interface Body {
      name: string;
      speed?: number;
    }
    const seen: string[] = [];
    const movement = processingSystem<Body>()(requireAll("speed"), {
      process(entity) {
        seen.push(entity.name);
      },
    });
    const w = world<Body>(movement);
    addEntity(w, { name: "ball", speed: 2 });
    addEntity(w, { name: "wall" });

    w.update(0);

    expect(seen).toEqual(["ball"]);
  });
});
