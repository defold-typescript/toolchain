// Copied from packages/ecs/src/hsm.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
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

// State hooks that tie a machine's states to ecs system membership, so one table
// is both an entity and the machine's `ctx`. The hooks and the machine are typed
// by shape alone, so this module imports nothing from hsm.

import {
  addEntity,
  changed,
  type Filter,
  hasEntity,
  processingSystem,
  removeEntity,
  requireAll,
  type System,
  type World,
} from "./index";

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

// Holds whether exactOptionalPropertyTypes is on or off.
type OptionalKey<E> = {
  [K in keyof E]-?: Record<never, never> extends Pick<E, K> ? K : never;
}[keyof E] &
  string;

type FlagKey<E> = { [K in OptionalKey<E>]: true extends E[K] ? K : never }[OptionalKey<E>];

type MachineKey<E> = {
  [K in keyof E]-?: NonNullable<E[K]> extends Ticking ? K : never;
}[keyof E] &
  string;

function place<E>(world: World<E>, ctx: E, key: string, value: unknown): void {
  (ctx as unknown as Record<string, unknown>)[key] = value;
  // A pending add reads the components when it applies, and `changed` on an
  // entity the world no longer holds would add it back.
  if (hasEntity(world, ctx)) {
    changed(world, ctx);
  }
}

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
export function member<E, K extends FlagKey<E>>(world: World<E>, key: K): MembershipHooks<E>;
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
export function member<E, K extends OptionalKey<E>>(
  world: World<E>,
  key: K,
  value: NonNullable<E[K]>,
): MembershipHooks<E>;
export function member<E>(world: World<E>, key: string, value?: unknown): MembershipHooks<E> {
  const present = value === undefined ? true : value;
  return {
    enter: (ctx) => {
      place(world, ctx, key, present);
    },
    exit: (ctx) => {
      place(world, ctx, key, undefined);
    },
  };
}

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
export function join<E>(world: World<E>): Hook<E> {
  return (ctx) => {
    addEntity(world, ctx);
  };
}

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
export function leave<E>(world: World<E>): Hook<E> {
  return (ctx) => {
    removeEntity(world, ctx);
  };
}

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
export function tickMachines<E>(key: MachineKey<E>): System<E> {
  const filter: Filter = requireAll(key);
  return processingSystem<E>()(filter, {
    process(entity, dt) {
      (entity[key] as unknown as Ticking).update(dt);
    },
  });
}
