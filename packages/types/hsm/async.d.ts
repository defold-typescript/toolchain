// Generated from packages/hsm/src/async.ts by `bun run --cwd packages/hsm declarations`; do not edit.
import type { EventObject, TaskStart } from "./index";
/** @noSelf */
export interface SequenceSignal {
    readonly aborted: boolean;
    readonly wait: (seconds: number) => Promise<void>;
}
export declare function sequence<Ctx, E extends EventObject>(run: (ctx: Ctx, signal: SequenceSignal) => Promise<NoInfer<E> | void>): TaskStart<Ctx, E>;
