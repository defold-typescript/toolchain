/** @noSelfInFile */

import type { Hash, Quaternion, Url, Vector3 } from "./core-types";

declare global {
  namespace collectionfactory {
    /**
     * Spawns the factory's collection, with each instance's `properties` table
     * checked against that instance's declared script properties. `P` maps each
     * instance id, as the collection addresses it (`"/enemy_leader"`), to that
     * instance's script properties: an unknown id, an undeclared name or a
     * wrongly typed value is a type error, and any subset of instances and
     * properties is accepted. The build erases the empty call and hashes each
     * instance id, so the engine receives `collectionfactory.create(url, ...)`
     * with a `hash`-keyed table.
     *
     * Call it directly and pass `properties` as an object literal: the build
     * hashes only the ids it can see at that call, and rejects a stored
     * `collectionfactory.create<P>()` or a `properties` value it cannot read.
     * Nothing verifies which script each instance runs.
     *
     * @example
     * ```ts
     * // enemy.ts declares `defineScript({ properties: { speed: 100 } })`
     * type EnemyProps = ScriptPropertiesOf<typeof import("./enemy").default>;
     * type SquadProps = { "/enemy_leader": EnemyProps; "/enemy_1": EnemyProps };
     * const ids = collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
     *   "/enemy_leader": { speed: 250 },
     * });
     * collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
     *   "/nobody": { speed: 1 }, // type error
     * });
     * ```
     */
    function create<P extends object>(): (
      url: string | Hash | Url,
      position?: Vector3,
      rotation?: Quaternion,
      properties?: { [K in keyof P]?: Partial<P[K]> },
      scale?: number | Vector3,
    ) => LuaMap<Hash, Hash> & { get: LuaTableGetMethod<string, Hash | undefined> };
  }
}
