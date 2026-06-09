/** @noSelfInFile */

import type { Hash, Opaque, Quaternion, Url, Vector3, Vector4 } from "./core-types";

interface ScriptProperty<TValue> {
  readonly __defoldScriptProperty: TValue;
}

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
    /**
     * Declares a Defold editor script property at module scope and carries its
     * value type into `ScriptProperties<typeof properties>`.
     *
     * @param name - editor property id to register.
     * @param value - default value for the registered property.
     * @returns a phantom descriptor used only for TypeScript self typing.
     * @example
     * ```ts
     * const properties = { speed: go.property("speed", 450) };
     * type Props = ScriptProperties<typeof properties>;
     * ```
     */
    function property(name: string, value: number): ScriptProperty<number>;
    /** Declares a boolean Defold editor script property. */
    function property(name: string, value: boolean): ScriptProperty<boolean>;
    /** Declares a hash Defold editor script property. */
    function property(name: string, value: Hash): ScriptProperty<Hash>;
    /** Declares a URL Defold editor script property. */
    function property(name: string, value: Url): ScriptProperty<Url>;
    /** Declares a vector3 Defold editor script property. */
    function property(name: string, value: Vector3): ScriptProperty<Vector3>;
    /** Declares a vector4 Defold editor script property. */
    function property(name: string, value: Vector4): ScriptProperty<Vector4>;
    /** Declares a quaternion Defold editor script property. */
    function property(name: string, value: Quaternion): ScriptProperty<Quaternion>;
    /** Declares a resource Defold editor script property. */
    function property(name: string, value: Opaque<"resource">): ScriptProperty<Opaque<"resource">>;
  }
}
