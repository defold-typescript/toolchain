/** @noSelfInFile */

import type { Hash, Matrix4, Quaternion, Url, Vector, Vector3, Vector4 } from "./core-types";

interface ScriptProperty<TValue> {
  readonly __defoldScriptProperty: TValue;
}

// True when `A` and `B` are identical, `readonly` modifiers included, which
// plain assignability ignores.
type Identical<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The keys of `P` a write may name: every key but a `readonly` one, which the
// engine refuses to set.
type WritableKey<P> = {
  [K in keyof P]-?: Identical<{ [Q in K]: P[K] }, { -readonly [Q in K]: P[K] }> extends true
    ? K
    : never;
}[keyof P];

// The `to` value go.animate takes for a property whose value is `V`.
// comp_anim.cpp `Animate` fills a vector3 or vector4 from a number and refuses
// any other type difference; a property of none of these types is not animatable.
type AnimateTarget<V> = V extends Quaternion
  ? Quaternion
  : V extends Vector3
    ? number | Vector3
    : V extends Vector4
      ? number | Vector4
      : V extends number
        ? number
        : never;

// The writable keys of `P` whose value go.animate can tween.
type AnimatableKey<P> = {
  [K in keyof P]-?: [AnimateTarget<P[K]>] extends [never] ? never : K;
}[keyof P] &
  WritableKey<P>;

// The value go.set takes for a transform key. gameobject.cpp `SetProperty` takes
// a number for `scale.xy` and applies it to x and y, while `GetProperty`
// returns the vector3 the catalog records.
type TransformWrite<K extends keyof go.Properties> = K extends "scale.xy"
  ? number | Vector3
  : go.Properties[K];

declare global {
  namespace go {
    // LuaToPropertyOptions raises when more than one of the three is non-nil, and
    // reads a nil one as absent.
    type GoPropertyOptions =
      | {
          /** **⚠️ 1-based index into an array property; passed to Defold unchanged.** */
          index?: number;
          key?: undefined;
          keys?: undefined;
        }
      | { index?: undefined; key?: Hash | string; keys?: undefined }
      | { index?: undefined; key?: undefined; keys?: (Hash | string)[] };

    /**
     * This is only supported for numerical properties. If the node property is already being
     * animated, that animation will be canceled and replaced by the new one.
     * If a `complete_function` (lua function) is specified, that function will be called when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced together. See the examples for more information.
     * If you call `go.animate()` from a game object's `final()` function,
     * any passed `complete_function` will be ignored and never called upon animation completion.
     * See the properties guide for which properties can be animated and the animation guide for how
     * them.
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to animate
     * @param playback - playback mode of the animation
     *
     * - `go.PLAYBACK_ONCE_FORWARD`
     * - `go.PLAYBACK_ONCE_BACKWARD`
     * - `go.PLAYBACK_ONCE_PINGPONG`
     * - `go.PLAYBACK_LOOP_FORWARD`
     * - `go.PLAYBACK_LOOP_BACKWARD`
     * - `go.PLAYBACK_LOOP_PINGPONG`
     * @param to - target property value. A number fills every component of a
     * vector3 or vector4 property; a quaternion property takes only a quaternion.
     * @param easing - easing to use during animation. Either specify a constant, see the animation guide for a complete list, or a vmath.vector with a curve
     * @param duration - duration of the animation in seconds
     * @param delay - delay before the animation starts in seconds
     * @param complete_function - optional function to call when the animation has completed
     *
     * `self`
     *
     * script_instance The current script instance.
     *
     * `url`
     *
     * url The game object or component instance for which the property is animated.
     *
     * `property`
     *
     * hash The id of the animated property.
     * @example
     * Animate the position of a game object to x = 10 during 1 second, then y = 20 during 1 second:
     * ```ts
     * go.animate(go.get_id(), "position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1, 0, () => {
     *   go.animate(go.get_id(), "position.y", go.PLAYBACK_ONCE_FORWARD, 20, go.EASING_LINEAR, 1);
     * });
     * ```
     * @example
     * Animate the y position of a game object using a crazy custom easing curve:
     * ```ts
     * const values = [
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     * ];
     * const vec = vmath.vector(values);
     * go.animate("go", "position.y", go.PLAYBACK_LOOP_PINGPONG, 100, vec, 2.0);
     * ```
     * @example
     * Name the target component to type its animatable properties and their target values.
     * The empty call applies the type argument, then the inner call infers the key:
     * ```ts
     * go.animate<sprite.Properties>()("#sprite", "playback_rate", go.PLAYBACK_ONCE_FORWARD, 2, go.EASING_LINEAR, 1);
     * ```
     */
    function animate<P>(): <K extends AnimatableKey<P>>(
      url: SceneAddress | Hash | Url,
      property: K,
      playback: go.Playback,
      to: AnimateTarget<P[K]>,
      easing: Vector | go.Easing,
      duration: number,
      ...rest:
        | []
        | [delay: number, complete_function?: (self: unknown, url: Url, property: Hash) => void]
    ) => void;
    /**
     * This is only supported for numerical properties. If the node property is already being
     * animated, that animation will be canceled and replaced by the new one.
     * If a `complete_function` (lua function) is specified, that function will be called when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced together. See the examples for more information.
     * If you call `go.animate()` from a game object's `final()` function,
     * any passed `complete_function` will be ignored and never called upon animation completion.
     * See the properties guide for which properties can be animated and the animation guide for how
     * them.
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to animate
     * @param playback - playback mode of the animation
     *
     * - `go.PLAYBACK_ONCE_FORWARD`
     * - `go.PLAYBACK_ONCE_BACKWARD`
     * - `go.PLAYBACK_ONCE_PINGPONG`
     * - `go.PLAYBACK_LOOP_FORWARD`
     * - `go.PLAYBACK_LOOP_BACKWARD`
     * - `go.PLAYBACK_LOOP_PINGPONG`
     * @param to - target property value. A number fills every component of a
     * vector3 or vector4 property; a quaternion property takes only a quaternion.
     * @param easing - easing to use during animation. Either specify a constant, see the animation guide for a complete list, or a vmath.vector with a curve
     * @param duration - duration of the animation in seconds
     * @param delay - delay before the animation starts in seconds
     * @param complete_function - optional function to call when the animation has completed
     *
     * `self`
     *
     * script_instance The current script instance.
     *
     * `url`
     *
     * url The game object or component instance for which the property is animated.
     *
     * `property`
     *
     * hash The id of the animated property.
     * @example
     * Animate the position of a game object to x = 10 during 1 second, then y = 20 during 1 second:
     * ```ts
     * go.animate(go.get_id(), "position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1, 0, () => {
     *   go.animate(go.get_id(), "position.y", go.PLAYBACK_ONCE_FORWARD, 20, go.EASING_LINEAR, 1);
     * });
     * ```
     * @example
     * Animate the y position of a game object using a crazy custom easing curve:
     * ```ts
     * const values = [
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     * ];
     * const vec = vmath.vector(values);
     * go.animate("go", "position.y", go.PLAYBACK_LOOP_PINGPONG, 100, vec, 2.0);
     * ```
     */
    function animate<K extends keyof go.Properties | (string & {}) | Hash>(
      url: SceneAddress | Hash | Url,
      property: K,
      playback: go.Playback,
      to: K extends keyof go.Properties
        ? AnimateTarget<go.Properties[K]>
        : number | Vector3 | Vector4 | Quaternion,
      easing: Vector | go.Easing,
      duration: number,
    ): void;
    /**
     * This is only supported for numerical properties. If the node property is already being
     * animated, that animation will be canceled and replaced by the new one.
     * If a `complete_function` (lua function) is specified, that function will be called when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced together. See the examples for more information.
     * If you call `go.animate()` from a game object's `final()` function,
     * any passed `complete_function` will be ignored and never called upon animation completion.
     * See the properties guide for which properties can be animated and the animation guide for how
     * them.
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to animate
     * @param playback - playback mode of the animation
     *
     * - `go.PLAYBACK_ONCE_FORWARD`
     * - `go.PLAYBACK_ONCE_BACKWARD`
     * - `go.PLAYBACK_ONCE_PINGPONG`
     * - `go.PLAYBACK_LOOP_FORWARD`
     * - `go.PLAYBACK_LOOP_BACKWARD`
     * - `go.PLAYBACK_LOOP_PINGPONG`
     * @param to - target property value. A number fills every component of a
     * vector3 or vector4 property; a quaternion property takes only a quaternion.
     * @param easing - easing to use during animation. Either specify a constant, see the animation guide for a complete list, or a vmath.vector with a curve
     * @param duration - duration of the animation in seconds
     * @param delay - delay before the animation starts in seconds
     * @param complete_function - optional function to call when the animation has completed
     *
     * `self`
     *
     * script_instance The current script instance.
     *
     * `url`
     *
     * url The game object or component instance for which the property is animated.
     *
     * `property`
     *
     * hash The id of the animated property.
     * @example
     * Animate the position of a game object to x = 10 during 1 second, then y = 20 during 1 second:
     * ```ts
     * go.animate(go.get_id(), "position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1, 0, () => {
     *   go.animate(go.get_id(), "position.y", go.PLAYBACK_ONCE_FORWARD, 20, go.EASING_LINEAR, 1);
     * });
     * ```
     * @example
     * Animate the y position of a game object using a crazy custom easing curve:
     * ```ts
     * const values = [
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     * ];
     * const vec = vmath.vector(values);
     * go.animate("go", "position.y", go.PLAYBACK_LOOP_PINGPONG, 100, vec, 2.0);
     * ```
     */
    function animate<K extends keyof go.Properties | (string & {}) | Hash>(
      url: SceneAddress | Hash | Url,
      property: K,
      playback: go.Playback,
      to: K extends keyof go.Properties
        ? AnimateTarget<go.Properties[K]>
        : number | Vector3 | Vector4 | Quaternion,
      easing: Vector | go.Easing,
      duration: number,
      delay: number,
      complete_function?: (self: unknown, url: Url, property: Hash) => void,
    ): void;
    /**
     * gets a named property of the specified game object or component
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to retrieve
     * @param options - optional options table
     * - index number **⚠️ 1-based index into an array property; passed to Defold unchanged.**
     * - key hash or string name of internal property
     * - keys array of hashes or strings identifying internal component resources (e.g. a particle fx emitter, see examples below)
     * @returns the value of the specified property
     * A `string` value is a text property, which needs Defold 1.13.2 or later.
     * An array material constant read without `index` returns every element as a
     * `Vector4[]`.
     * @example
     * ```ts
     * const position = go.get("#sprite", "position");
     * // Name the target component to read its catalogued property type. The
     * // empty call applies the type argument, then the inner call infers the key:
     * const animation = go.get<sprite.Properties>()("#sprite", "animation"); // Hash
     * ```
     */
    function get<P>(): <K extends keyof P>(
      url: SceneAddress | Hash | Url,
      property: K,
      ...options: [] | [GoPropertyOptions]
    ) => P[K];
    function get<K extends keyof go.Properties>(
      url: SceneAddress | Hash | Url,
      property: K,
    ): go.Properties[K];
    function get<K extends keyof go.Properties>(
      url: SceneAddress | Hash | Url,
      property: K,
      options: GoPropertyOptions,
    ): go.Properties[K];
    function get(
      url: SceneAddress | Hash | Url,
      property: string | Hash,
    ):
      | number
      | boolean
      | string
      | Hash
      | Url
      | Vector3
      | Vector4
      | Quaternion
      | Matrix4
      | Vector4[];
    function get(
      url: SceneAddress | Hash | Url,
      property: string | Hash,
      options: GoPropertyOptions,
    ):
      | number
      | boolean
      | string
      | Hash
      | Url
      | Vector3
      | Vector4
      | Quaternion
      | Matrix4
      | Vector4[];
    /**
     * sets a named property of the specified game object or component, or a material constant
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to set
     * @param value - the value to set, or an array of vector4 to set a material property array
     * A `string` value is a text property, which needs Defold 1.13.2 or later.
     * @param options - optional options table
     * - index integer **⚠️ 1-based index into an array property; passed to Defold unchanged.**
     * - key hash or string name of internal property
     * - keys array of hashes or strings identifying internal component resources (e.g. a particle fx emitter, see examples below)
     * @example
     * ```ts
     * go.set("#sprite", "tint", vmath.vector4(1, 0, 0, 1));
     * // Name the target component to gate the value to its property type. The
     * // empty call applies the type argument, then the inner call infers the key.
     * // A read-only property such as "animation" is not a key it accepts:
     * go.set<sprite.Properties>()("#sprite", "playback_rate", 2);
     * ```
     */
    function set<P>(): <K extends WritableKey<P>>(
      url: SceneAddress | Hash | Url,
      property: K,
      value: P[K],
      ...options: [] | [GoPropertyOptions]
    ) => void;
    // One signature per arity, with the value conditional on the key: a known
    // transform key gets its own value type and no wide overload to fall
    // through to, while a dynamic or hashed key gets the wide union.
    function set<K extends keyof go.Properties | (string & {}) | Hash>(
      url: SceneAddress | Hash | Url,
      property: K,
      value: K extends keyof go.Properties
        ? TransformWrite<K>
        :
            | number
            | boolean
            | string
            | Hash
            | Url
            | Vector3
            | Vector4
            | Quaternion
            | Matrix4
            | Vector4[],
    ): void;
    function set<K extends keyof go.Properties | (string & {}) | Hash>(
      url: SceneAddress | Hash | Url,
      property: K,
      value: K extends keyof go.Properties
        ? TransformWrite<K>
        :
            | number
            | boolean
            | string
            | Hash
            | Url
            | Vector3
            | Vector4
            | Quaternion
            | Matrix4
            | Vector4[],
      options: GoPropertyOptions,
    ): void;
    /**
     * Registers a script property, which the Defold editor exposes on every game
     * object and collection that uses the script. Defold accepts the call only at
     * the top level of the script, outside callbacks such as `init` and `update`.
     * A `string` default needs Defold 1.13.2 or later.
     *
     * @deprecated Don't call `go.property` yourself. Declare the property in
     * `defineScript({ properties })` — that is the only form that types it onto
     * `self`; the transpiler emits the `go.property(...)` registration for you.
     * A direct call still registers the property at runtime, but it reaches
     * neither `properties` nor `init`'s return, so reading `self.<name>` in a
     * hook is a compile error.
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
    /** @deprecated Declare text via the `defineScript({ properties })` field; needs Defold 1.13.2. */
    function property(name: string, value: string): ScriptProperty<string>;
  }
}
