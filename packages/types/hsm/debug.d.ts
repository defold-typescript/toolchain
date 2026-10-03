// Generated from packages/hsm/src/debug.ts by `bun run --cwd packages/hsm declarations`; do not edit.
import type { EventObject, MachineInstance } from "./index";
/** @noSelf */
export interface MachineInspector {
    readonly draw: (target: Hash | Url | string) => void;
}
export declare function inspect<Ctx, E extends EventObject, P extends string>(instance: MachineInstance<Ctx, E, P>, label: string): MachineInspector;
