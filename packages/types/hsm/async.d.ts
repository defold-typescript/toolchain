// Generated from packages/hsm/src/async.ts by `bun run --cwd packages/hsm declarations`; do not edit.
import type { EventObject, TaskStart } from "./index";
/**
 * The second argument of a `sequence` function: a wait that leaving the state cancels, and a flag
 * that tells the state was left.
 * @noSelf
 */
export interface SequenceSignal {
    /**
     * Turns `true` once the state is left. Check it after awaiting anything other than `wait`: such
     * a promise can still resolve after the state is left, and the code after it then runs.
     */
    readonly aborted: boolean;
    /**
     * Resolves after `seconds`, counted by `timer.delay` rather than by `update(dt)`. A wait still
     * pending when the state is left never resolves, so the code after it does not run.
     */
    readonly wait: (seconds: number) => Promise<void>;
}
/**
 * Turns an `async` function into a state's `task`. The function gets the context and a
 * `SequenceSignal`, and the event it returns is sent to the machine; one returned after the state
 * is left is ignored. An error thrown inside it leaves the machine where it is and is raised
 * again from a timer callback, so it shows in the engine console.
 */
export declare function sequence<Ctx, E extends EventObject>(run: (ctx: Ctx, signal: SequenceSignal) => Promise<NoInfer<E> | void>): TaskStart<Ctx, E>;
