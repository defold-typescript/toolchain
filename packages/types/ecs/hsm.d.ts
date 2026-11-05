// Generated from packages/ecs/src/hsm.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
import { type System, type World } from "./index";
type Hook<E> = (this: void, ctx: E) => void;
/** The `enter` and `exit` hooks `member` returns, to spread into a state's config. */
export interface MembershipHooks<E> {
    readonly enter: Hook<E>;
    readonly exit: Hook<E>;
}
interface Ticking {
    readonly update: (this: void, dt: number) => void;
}
type OptionalKey<E> = {
    [K in keyof E]-?: Record<never, never> extends Pick<E, K> ? K : never;
}[keyof E] & string;
type FlagKey<E> = {
    [K in OptionalKey<E>]: true extends E[K] ? K : never;
}[OptionalKey<E>];
type MachineKey<E> = {
    [K in keyof E]-?: NonNullable<E[K]> extends Ticking ? K : never;
}[keyof E] & string;
/**
 * Hooks that set the optional component `key` to `true` when the state is entered and clear it
 * when the state is left, so the entity joins and leaves the systems that require it at the
 * world's next `refresh` or `update`. They re-check the entity only while `world` holds it.
 */
export declare function member<E, K extends FlagKey<E>>(world: World<E>, key: K): MembershipHooks<E>;
/**
 * Hooks that set the optional component `key` to `value` when the state is entered and clear it
 * when the state is left, so the entity joins and leaves the systems that require it at the
 * world's next `refresh` or `update`. They re-check the entity only while `world` holds it.
 */
export declare function member<E, K extends OptionalKey<E>>(world: World<E>, key: K, value: NonNullable<E[K]>): MembershipHooks<E>;
/**
 * A hook that adds the machine's `ctx` to `world` as an entity, applied at the world's next
 * `refresh` or `update`. Set it as the root's `enter` to add the entity when the machine starts.
 */
export declare function join<E>(world: World<E>): Hook<E>;
/**
 * A hook that removes the machine's `ctx` from `world`, applied at the world's next `refresh` or
 * `update`. Set it as the `enter` of a state the entity leaves the world in.
 */
export declare function leave<E>(world: World<E>): Hook<E>;
/**
 * A processing system that calls `update(dt)` on the machine each entity holds in `key`, with
 * the world update's `dt`. Membership a hook changes during the update shows at the next one;
 * update the machines before `update` for same-frame membership.
 */
export declare function tickMachines<E>(key: MachineKey<E>): System<E>;
export {};
