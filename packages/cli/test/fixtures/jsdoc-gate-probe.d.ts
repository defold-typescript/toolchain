// Input to the JSDoc gate's tests (`packages/cli/src/ecs-jsdoc.test.ts`): every
// export but `clean` and `missingExport` carries the JSDoc defects named beside it.

// no summary, no @example
export declare function uncommented(): void;

// no @param b
/**
 * Adds two numbers.
 *
 * @param a The first number.
 * @returns The sum.
 * @example
 * ```ts
 * import { requireAll } from "@defold-typescript/types/ecs";
 *
 * export const moving = requireAll("position", "velocity");
 * ```
 */
export declare function missingParam(a: number, b: number): number;

// no @returns
/**
 * Doubles a number.
 *
 * @param n The number.
 * @example
 * ```ts
 * import { requireAll } from "@defold-typescript/types/ecs";
 *
 * export const moving = requireAll("position", "velocity");
 * ```
 */
export declare function missingReturns(n: number): number;

// @param m names no parameter
/**
 * Logs a number.
 *
 * @param n The number.
 * @param m A parameter the function does not take.
 * @example
 * ```ts
 * import { requireAll } from "@defold-typescript/types/ecs";
 *
 * export const moving = requireAll("position", "velocity");
 * ```
 */
export declare function strayParam(n: number): void;

// the second signature: no summary, no @example
/**
 * Logs a number, or nothing.
 *
 * @param n The number.
 * @example
 * ```ts
 * import { requireAll } from "@defold-typescript/types/ecs";
 *
 * export const moving = requireAll("position", "velocity");
 * ```
 */
export declare function overloaded(n: number): void;
export declare function overloaded(): void;

// undocumented: no summary; scale: no @param factor
/** An interface with an undocumented field and a method missing a parameter. */
export interface Probe {
  undocumented: number;
  /**
   * Scales the value.
   *
   * @returns The scaled value.
   */
  scale(factor: number): number;
}

// no @example
/**
 * Logs a number without an example.
 *
 * @param n The number.
 */
export declare function noExample(n: number): void;

/**
 * Has an example that imports an export ecs does not have.
 *
 * @example
 * ```ts
 * import { requireNone } from "@defold-typescript/types/ecs";
 *
 * export const nothing = requireNone("position");
 * ```
 */
export declare function missingExport(): void;

/**
 * Takes any number of items.
 *
 * @param items The items.
 * @example
 * ```ts
 * import { requireAll } from "@defold-typescript/types/ecs";
 *
 * export const moving = requireAll("position", "velocity");
 * ```
 */
export declare function clean(this: void, ...items: number[]): void;

interface Hidden {
  field: number;
}

export {};
