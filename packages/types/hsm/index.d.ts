// Generated from packages/hsm/src/index.ts by `bun run --cwd packages/hsm declarations`; do not edit.
export interface EventObject {
    readonly type: string;
}
export type TransitionCause = "event" | "after" | "update" | "stop" | "reload";
/** @noSelf */
export type TransitionListener<E extends EventObject, P extends string = string> = (from: P, to: P | undefined, cause: TransitionCause, event: E | undefined) => void;
/** @noSelf */
export interface MachineInstance<Ctx, E extends EventObject, P extends string = string> {
    readonly ctx: Ctx;
    readonly path: P | undefined;
    readonly matches: (path: P) => boolean;
    readonly send: (event: E) => void;
    readonly update: (dt: number) => void;
    readonly stop: () => void;
    readonly onTransition: (listener: TransitionListener<E, P>) => void;
}
export type TransitionAction<Ctx, E extends EventObject, V extends E = E> = (ctx: Ctx, event: V, m: MachineInstance<Ctx, E>) => void;
/** @noSelf */
export interface TransitionConfig<Ctx, E extends EventObject, V extends E = E> {
    readonly target?: string;
    readonly guard?: (ctx: Ctx, event: V) => boolean;
    readonly actions?: TransitionAction<Ctx, E, V> | readonly TransitionAction<Ctx, E, V>[];
    readonly reenter?: boolean;
}
export type TransitionSpec<Ctx, E extends EventObject, V extends E = E> = string | TransitionConfig<Ctx, E, V> | readonly [TransitionConfig<Ctx, E, V>, ...TransitionConfig<Ctx, E, V>[]];
export type OnConfig<Ctx, E extends EventObject> = {
    readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, {
        type: K;
    }>>;
};
export type StateHook<Ctx, E extends EventObject> = (ctx: Ctx, m: MachineInstance<Ctx, E>) => void;
export type UpdateHook<Ctx, E extends EventObject> = (ctx: Ctx, dt: number, m: MachineInstance<Ctx, E>) => string | undefined;
/** @noSelf */
export type InvokeStart<Ctx, E extends EventObject> = (ctx: Ctx, settle: (event: E) => void, m: MachineInstance<Ctx, E>) => (() => void) | void;
/** @noSelf */
export interface StateConfig<Ctx, E extends EventObject> {
    readonly initial?: string;
    readonly states?: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
    readonly on?: OnConfig<Ctx, E>;
    readonly after?: {
        readonly [seconds: number]: string;
    };
    readonly enter?: StateHook<Ctx, E>;
    readonly exit?: StateHook<Ctx, E>;
    readonly update?: UpdateHook<Ctx, E>;
    readonly invoke?: InvokeStart<Ctx, E>;
}
export interface MachineConfig<Ctx, E extends EventObject> extends StateConfig<Ctx, E> {
    readonly initial: string;
    readonly states: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
}
/** @noSelf */
export interface Machine<Ctx, E extends EventObject, P extends string = string> {
    readonly start: (ctx: Ctx) => MachineInstance<Ctx, E, P>;
}
type PathDepth = [never, 0, 1, 2, 3];
type PathsBelow<S, D extends number> = S extends {
    readonly states: infer Children;
} ? {
    [K in keyof Children & string]: K | `${K}/${D extends 1 ? Children[K] extends {
        readonly states: object;
    } ? string : never : PathsBelow<Children[K], PathDepth[D]>}`;
}[keyof Children & string] : never;
export type StatePath<C> = `/${PathsBelow<C, 4>}`;
interface TransitionCheck<T> {
    readonly target?: T;
    readonly guard?: unknown;
    readonly actions?: unknown;
    readonly reenter?: unknown;
}
type SpecCheck<T> = T | TransitionCheck<T> | readonly TransitionCheck<T>[];
type PathCheck<S, Self extends string, All extends string, Ev extends string> = {
    readonly initial?: S extends {
        readonly states: infer Children;
    } ? `${Self}/${keyof Children & string}` : never;
    readonly states?: S extends {
        readonly states: infer Children;
    } ? {
        readonly [K in keyof Children]: PathCheck<Children[K], `${Self}/${K & string}`, All, Ev>;
    } : unknown;
    readonly on?: S extends {
        readonly on: infer On;
    } ? {
        readonly [K in keyof On]: K extends Ev ? SpecCheck<All> : never;
    } : unknown;
    readonly after?: S extends {
        readonly after: infer After;
    } ? {
        readonly [K in keyof After]: All;
    } : unknown;
    readonly enter?: unknown;
    readonly exit?: unknown;
    readonly update?: unknown;
    readonly invoke?: unknown;
};
export interface MachineConfigError {
    readonly "hsm: an initial or target names an unknown state path, or an on key an unknown event": never;
}
export type DefinedMachine<Ctx, E extends EventObject, C> = C extends PathCheck<C, "", StatePath<C>, E["type"]> ? Machine<Ctx, E, StatePath<C>> : MachineConfigError;
export declare function defineMachine<Ctx, E extends EventObject>(key?: string): <const C extends MachineConfig<Ctx, E>>(config: C) => DefinedMachine<Ctx, E, C>;
export {};
