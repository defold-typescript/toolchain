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
     * // Name the target component to read its catalogued property type. The
     * // empty call applies the type argument, then the inner call infers the key:
     * const animation = go.get<sprite.properties>()("#sprite", "animation"); // Hash
     * ```
     */
    function get<P>(): <K extends keyof P>(
      url: string | Hash | Url,
      property: K,
      options?: GoPropertyOptions,
    ) => P[K];
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
     * // Name the target component to gate the value to its property type. The
     * // empty call applies the type argument, then the inner call infers the key:
     * go.set<sprite.properties>()("#sprite", "playback_rate", 2);
     * ```
     */
    function set<P>(): <K extends keyof P>(
      url: string | Hash | Url,
      property: K,
      value: P[K],
      options?: GoPropertyOptions,
    ) => void;
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
     * Registers a Defold editor script property (deprecated escape hatch).
     *
     * @deprecated Don't call `go.property` yourself. Declare the property in
     * `defineScript({ properties })` — that is the only form that types it onto
     * `self`; the transpiler emits the `go.property(...)` registration for you.
     * A direct call still registers, but `self.<name>` stays untyped.
     *
     * @param name - editor property id to register.
     * @param value - default value for the registered property.
     * @returns a phantom descriptor used only for TypeScript self typing.
     * @example
     * ```ts
     * // Declare it as a field — the key is the name, the value is the default:
     * export default defineScript({
     *   properties: { speed: 450 },
     *   update(self) {
     *     self.speed; // number
     *   },
     * });
     * // The transpiler emits, at chunk scope:  go.property("speed", 450)
     * ```
     */
    function property(name: string, value: number): ScriptProperty<number>;
    /** @deprecated Declare booleans via the `defineScript({ properties })` field. */
    function property(name: string, value: boolean): ScriptProperty<boolean>;
    /** @deprecated Declare hashes via the `defineScript({ properties })` field. */
    function property(name: string, value: Hash): ScriptProperty<Hash>;
    /** @deprecated Declare URLs via the `defineScript({ properties })` field. */
    function property(name: string, value: Url): ScriptProperty<Url>;
    /** @deprecated Declare vector3s via the `defineScript({ properties })` field. */
    function property(name: string, value: Vector3): ScriptProperty<Vector3>;
    /** @deprecated Declare vector4s via the `defineScript({ properties })` field. */
    function property(name: string, value: Vector4): ScriptProperty<Vector4>;
    /** @deprecated Declare quaternions via the `defineScript({ properties })` field. */
    function property(name: string, value: Quaternion): ScriptProperty<Quaternion>;
    /** @deprecated Declare resources via the `defineScript({ properties })` field. */
    function property(name: string, value: Opaque<"resource">): ScriptProperty<Opaque<"resource">>;
  }
}
