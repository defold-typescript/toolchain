/** @noSelfInFile */

import type { Hash, Quaternion, Url, Vector3 } from "./core-types";

declare global {
  namespace factory {
    /**
     * Creates a game object from the factory, with its `properties` table
     * checked against the spawned script's declared properties. The empty call
     * names that script's property shape and the inner call spawns: any subset
     * of the declared properties is accepted, and an undeclared name or a
     * wrongly typed value is a type error. The build erases the empty call, so
     * the engine receives `factory.create(url, ...)`.
     *
     * Nothing verifies that the factory's prototype runs the script you name.
     *
     * @example
     * ```ts
     * // enemy.ts declares `defineScript({ properties: { speed: 100 } })`
     * type EnemyProps = ScriptPropertiesOf<typeof import("./enemy").default>;
     * const id = factory.create<EnemyProps>()("#enemyfactory", undefined, undefined, { speed: 250 });
     * factory.create<EnemyProps>()("#enemyfactory", undefined, undefined, { sped: 250 }); // type error
     * ```
     */
    function create<P extends object>(): (
      url: string | Hash | Url,
      position?: Vector3,
      rotation?: Quaternion,
      properties?: Partial<P>,
      scale?: number | Vector3,
    ) => Hash | undefined;
  }
}
