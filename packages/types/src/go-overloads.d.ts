/** @noSelfInFile */
import type { Hash, Opaque, Quaternion, Url, Vector3, Vector4 } from "./core-types";

declare global {
  namespace go {
    interface GoPropertyOptions {
      index?: number;
      key?: Hash;
      keys?: Record<string | number, unknown>;
    }

    /**
     * gets a named property of the specified game object or component
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to retrieve
     * @param options - optional options table
     * - index number index into array property (1 based)
     * - key hash name of internal property
     * - keys table array of internal component resources identified by key (e.g. a particle fx emitter, see examples below)
     * @returns the value of the specified property
     * @example
     * ```ts
     * const position = go.get("#sprite", "position");
     * ```
     */
    function get<K extends keyof go.properties>(
      url: string | Hash | Url,
      property: K,
      options?: GoPropertyOptions,
    ): go.properties[K];
    function get(
      url: string | Hash | Url,
      property: string | Hash,
      options?: GoPropertyOptions,
    ): number | boolean | Hash | Url | Vector3 | Vector4 | Quaternion | Opaque<"resource">;
    /**
     * sets a named property of the specified game object or component, or a material constant
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to set
     * @param value - the value to set
     * @param options - optional options table
     * - index integer index into array property (1 based)
     * - key hash name of internal property
     * - keys table array of internal component resources identified by key (e.g. a particle fx emitter, see examples below)
     * @example
     * ```ts
     * go.set("#sprite", "tint", vmath.vector4(1, 0, 0, 1));
     * ```
     */
    function set<K extends keyof go.properties>(
      url: string | Hash | Url,
      property: K,
      value: go.properties[K],
      options?: GoPropertyOptions,
    ): void;
    function set(
      url: string | Hash | Url,
      property: string | Hash,
      value: number | boolean | Hash | Url | Vector3 | Vector4 | Quaternion | Opaque<"resource">,
      options?: GoPropertyOptions,
    ): void;
  }
}
