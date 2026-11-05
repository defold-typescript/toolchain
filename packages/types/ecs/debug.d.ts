// Generated from packages/ecs/src/debug.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
import type { World } from "./index";
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
export declare function inspect<E>(target: World<E>, label: string): WorldInspector;
