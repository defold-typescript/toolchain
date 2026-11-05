/*
MIT License

Copyright (c) 2026 king8fisher (Anton Veretennikov)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// A console log of what a world's systems gain, lose and modify. The world reports to one
// observer field instead of having its callbacks wrapped, because a keyed reload replaces the
// callbacks and a wrapper would go silent.

import type { SystemFields, World } from "./index";

/**
 * Returned by `inspect`. Keep it on `self` and call its `draw` from `update`.
 * @noSelf
 */
export interface WorldInspector {
  /**
   * Draws the label and each system's entity count as debug text, 40 units above `target`'s
   * world position, `-` for a `nocache` system. Each call also advances the frame number the
   * console lines show. In a release build it does nothing.
   *
   * @param target The game object to draw above, such as `"."` for the script's own.
   */
  readonly draw: (target: Hash | Url | string) => void;
}

// The world record reads this field under the same name and shape; `this: void` keeps the Lua
// calls free of a `self` argument on both sides.
interface Observer {
  joined: (this: void, system: number, entity: number, count: number) => void;
  left: (this: void, system: number, entity: number, count: number) => void;
  modifying: (this: void, system: number) => void;
}

interface ObservedWorld {
  __ecs_observer?: Observer;
}

const SILENT: WorldInspector = {
  draw: () => {},
};

const TEXT_OFFSET_Y = 40;

// A JavaScript object inherits members such as `__proto__` and `constructor`, and a caller's
// string can name one. This literal has no prototype, so every string is an own key. In Lua the
// nil field leaves a plain table.
function record<V>(): Record<string, V> {
  return { __proto__: null } as unknown as Record<string, V>;
}

const labelUses = record<number>();
const issuedLabels = record<boolean>();

function uniqueLabel(label: string): string {
  let ordinal = labelUses[label] ?? 1;
  let issued = label;
  while (issuedLabels[issued] === true) {
    ordinal++;
    issued = `${label}#${ordinal}`;
  }
  labelUses[label] = ordinal;
  issuedLabels[issued] = true;
  return issued;
}

function held<E>(system: SystemFields<E> | undefined): number | undefined {
  if (system === undefined || system.nocache === true || system.entities === undefined) {
    return undefined;
  }
  return system.entities.length;
}

function counts<E>(target: World<E>): string {
  const systems = target.systems;
  let text = "";
  for (let i = 0; i < systems.length; i++) {
    const count = held(systems[i]);
    const shown = count === undefined ? "-" : `${count}`;
    text = i === 0 ? shown : `${text}, ${shown}`;
  }
  return text;
}

/**
 * Prints one line when it is called, then one line each time a system of `target` gains or loses
 * an entity or runs `onModify`, each starting with `ecs`, the label and the frame number. Systems
 * are named by their index and entities by the order this inspector first sees them. A keyed
 * reload keeps the logging, and a later `inspect` of the same world replaces it. A label another
 * `inspect` call already used gets an ordinal, such as `level#2`. In a release build it registers
 * nothing and returns an inspector whose `draw` does nothing, so the calls can stay in shipped
 * code.
 *
 * @param target The world to log.
 * @param label The name the console lines and the debug text show.
 * @returns The inspector, whose `draw` shows each system's entity count above a game object.
 * @example
 * ```ts
 * import { defineScript } from "@defold-typescript/types";
 * import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
 * import { inspect } from "@defold-typescript/types/ecs/debug";
 *
 * interface Ent {
 *   position?: Vector3;
 * }
 *
 * export default defineScript({
 *   init() {
 *     const w = world<Ent>(
 *       processingSystem<Ent>()(requireAll("position"), {
 *         process(e, dt) {
 *           e.position.x += dt;
 *         },
 *       }),
 *     );
 *     return { w, inspector: inspect(w, "level") };
 *   },
 *   update(self, dt) {
 *     self.w.update(dt);
 *     self.inspector.draw(".");
 *   },
 * });
 * ```
 */
export function inspect<E>(target: World<E>, label: string): WorldInspector {
  if (!sys.get_engine_info().is_debug) {
    return SILENT;
  }
  const shownLabel = uniqueLabel(label);
  let frame = 0;
  let seen = 0;
  const ordinals: Record<number, number | undefined> = {};
  const ordinal = (entity: number): number => {
    let n = ordinals[entity];
    if (n === undefined) {
      seen++;
      n = seen;
      ordinals[entity] = n;
    }
    return n;
  };
  const observer: Observer = {
    joined: (system, entity, count) => {
      print(
        `ecs ${shownLabel} frame ${frame}: system ${system} adds entity ${ordinal(entity)}, holds ${count}`,
      );
    },
    left: (system, entity, count) => {
      print(
        `ecs ${shownLabel} frame ${frame}: system ${system} removes entity ${ordinal(entity)}, holds ${count}`,
      );
    },
    modifying: (system) => {
      const count = held(target.systems[system - 1]);
      const holds = count === undefined ? "" : `, holds ${count}`;
      print(`ecs ${shownLabel} frame ${frame}: system ${system} onModify${holds}`);
    },
  };
  (target as unknown as ObservedWorld).__ecs_observer = observer;
  print(`ecs ${shownLabel} frame ${frame}: inspecting [${counts(target)}]`);
  return {
    draw: (above) => {
      frame++;
      const p = go.get_world_position(above);
      msg.post("@render:", "draw_debug_text", {
        text: `${shownLabel} [${counts(target)}]`,
        position: vmath.vector3(p.x, p.y + TEXT_OFFSET_Y, p.z),
        color: vmath.vector4(1, 1, 1, 1),
      });
    },
  };
}
