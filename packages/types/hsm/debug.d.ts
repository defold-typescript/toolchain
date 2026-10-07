// Generated from packages/hsm/src/debug.ts by `bun run --cwd packages/hsm declarations`; do not edit.
import type { EventObject, MachineInstance } from "./index";
/**
 * Returned by `inspect`. Keep it on `self` and call its `draw` from `update`.
 * @noSelf
 */
export interface MachineInspector {
    /**
     * Draws the label and the active leaves as debug text, 40 units above `target`'s world
     * position. Each call also advances the frame number the console lines show. In a release
     * build it does nothing.
     */
    readonly draw: (target: Hash | Url | string) => void;
}
/**
 * Prints one line when it is called, then one line for each move `instance` makes, each starting
 * with `hsm` and the label. Call it once after `start`. A label another `inspect` call already
 * used gets an ordinal, such as `enemy#2`. In a release build it registers nothing and returns an
 * inspector whose `draw` does nothing, so the calls can stay in shipped code.
 */
export declare function inspect<Ctx, E extends EventObject, P extends string>(instance: MachineInstance<Ctx, E, P>, label: string): MachineInspector;
