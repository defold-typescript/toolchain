// Generated from packages/ecs/src/hsm.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
import { type System, type World } from "./index";
type Hook<E> = (this: void, ctx: E) => void;
/**
 * The `enter` and `exit` hooks `member` returns, to spread into a state's config.
 *
 * @see member
 */
export interface MembershipHooks<E> {
    /** Sets the component when the machine enters the state. */
    readonly enter: Hook<E>;
    /** Clears the component when the machine leaves the state. */
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
 * Hooks that set the optional `true` component `key` while the machine is in the state.
 *
 * @remarks
 * Entering the state sets `key` to `true` and leaving it clears `key`, so the entity joins and
 * leaves the systems that require it at the world's next `refresh` or `update`. The hooks
 * re-check the entity only while `world` holds it: a pending add reads the components when it
 * applies, and `changed` on an entity the world no longer holds would add it back.
 *
 * @param world The world the entity belongs to.
 * @param key An optional component typed `true`.
 * @returns The `enter` and `exit` hooks, to spread into the state's config.
 * @see https://defold-typescript.github.io/toolchain/ecs-and-hsm#join-systems-from-a-state-with-member
 * @example
 * ```ts
 * import { world } from "@defold-typescript/types/ecs";
 * import { member } from "@defold-typescript/types/ecs/hsm";
 * import { defineMachine } from "@defold-typescript/types/hsm";
 *
 * interface Mole {
 *   readonly name: string;
 *   up?: true;
 * }
 *
 * const moles = world<Mole>();
 *
 * export const moleMachine = defineMachine<Mole, { type: "HIT" }>()({
 *   initial: "/up",
 *   states: {
 *     up: { ...member(moles, "up"), on: { HIT: "/down" } },
 *     down: {},
 *   },
 * });
 * ```
 */
export declare function member<E, K extends FlagKey<E>>(world: World<E>, key: K): MembershipHooks<E>;
/**
 * Hooks that set the optional component `key` to `value` while the machine is in the state.
 *
 * @remarks
 * Entering the state sets `key` to `value` and leaving it clears `key`, so the entity joins and
 * leaves the systems that require it at the world's next `refresh` or `update`. The hooks
 * re-check the entity only while `world` holds it.
 *
 * @param world The world the entity belongs to.
 * @param key An optional component.
 * @param value What the component holds while the machine is in the state.
 * @returns The `enter` and `exit` hooks, to spread into the state's config.
 * @example
 * ```ts
 * import { world } from "@defold-typescript/types/ecs";
 * import { member } from "@defold-typescript/types/ecs/hsm";
 * import { defineMachine } from "@defold-typescript/types/hsm";
 *
 * interface Hunter {
 *   readonly name: string;
 *   target?: Url;
 * }
 *
 * const hunters = world<Hunter>();
 *
 * export function hunt(target: Url) {
 *   return defineMachine<Hunter, { type: "SPOT" } | { type: "LOSE" }>()({
 *     initial: "/idle",
 *     states: {
 *       idle: { on: { SPOT: "/chase" } },
 *       chase: { ...member(hunters, "target", target), on: { LOSE: "/idle" } },
 *     },
 *   });
 * }
 * ```
 */
export declare function member<E, K extends OptionalKey<E>>(world: World<E>, key: K, value: NonNullable<E[K]>): MembershipHooks<E>;
/**
 * A hook that adds the machine's `ctx` to `world` as an entity.
 *
 * @remarks
 * The add applies at the world's next `refresh` or `update`. Set it as the root's `enter` to add
 * the entity when the machine starts.
 *
 * @param world The world to add the entity to.
 * @returns The hook.
 * @see leave
 * @example
 * ```ts
 * import { world } from "@defold-typescript/types/ecs";
 * import { join, leave } from "@defold-typescript/types/ecs/hsm";
 * import { defineMachine } from "@defold-typescript/types/hsm";
 *
 * interface Mole {
 *   readonly name: string;
 * }
 *
 * const moles = world<Mole>();
 *
 * export const moleMachine = defineMachine<Mole, { type: "HIT" }>()({
 *   initial: "/up",
 *   enter: join(moles),
 *   states: {
 *     up: { on: { HIT: "/gone" } },
 *     gone: { enter: leave(moles) },
 *   },
 * });
 * ```
 */
export declare function join<E>(world: World<E>): Hook<E>;
/**
 * A hook that removes the machine's `ctx` from `world`.
 *
 * @remarks
 * The removal applies at the world's next `refresh` or `update`. Set it as the `enter` of a state
 * the entity leaves the world in.
 *
 * @param world The world to remove the entity from.
 * @returns The hook.
 * @see join
 * @example
 * ```ts
 * import { world } from "@defold-typescript/types/ecs";
 * import { join, leave } from "@defold-typescript/types/ecs/hsm";
 * import { defineMachine } from "@defold-typescript/types/hsm";
 *
 * interface Coin {
 *   readonly id: Hash;
 * }
 *
 * const coins = world<Coin>();
 *
 * export const coinMachine = defineMachine<Coin, { type: "PICKED" }>()({
 *   initial: "/lying",
 *   enter: join(coins),
 *   states: {
 *     lying: { on: { PICKED: "/picked" } },
 *     picked: { enter: leave(coins) },
 *   },
 * });
 * ```
 */
export declare function leave<E>(world: World<E>): Hook<E>;
/**
 * A processing system that calls `update(dt)` on the machine each entity holds in `key`.
 *
 * @remarks
 * It passes the world update's `dt`, and runs where it stands in the world's system order.
 * Membership a hook changes during the update shows at the next one; update the machines before
 * `update` for same-frame membership.
 *
 * @param key The component that holds the entity's machine.
 * @returns The system, to add to a world.
 * @see https://defold-typescript.github.io/toolchain/ecs-and-hsm#tick-machines-from-the-world-with-tickmachines
 * @example
 * ```ts
 * import { world } from "@defold-typescript/types/ecs";
 * import { tickMachines } from "@defold-typescript/types/ecs/hsm";
 * import type { MachineInstance } from "@defold-typescript/types/hsm";
 *
 * interface Critter {
 *   readonly id: Hash;
 *   fsm?: MachineInstance<Critter, { type: "SCARE" }>;
 * }
 *
 * export const herd = world<Critter>(tickMachines<Critter>("fsm"));
 * ```
 */
export declare function tickMachines<E>(key: MachineKey<E>): System<E>;
export {};
