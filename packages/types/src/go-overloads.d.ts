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

// The value go.set takes for key `K` of catalog `C`. gameobject.cpp `SetProperty`
// and comp_private.cpp take a number for an `.xy` key and apply it to x and y,
// while `GetProperty` returns the vector3 the catalog records.
type XyWrite<C, K extends keyof C> = K extends `${string}.xy` ? number | C[K] : C[K];

// The value go.get returns, and go.set takes, for a key no catalog names.
type WideValue =
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

// The `to` go.animate takes for a key no catalog names.
type WideAnimateTarget = number | Vector3 | Vector4 | Quaternion;

// A script's declared properties plus the elements of each vector or quaternion
// property: script_msg.cpp `FindPropertyName` resolves `"<name>.x"` and its
// siblings to one float. The four-element types are tested first, since a
// Vector4 carries every member a Vector3 does.
type ScriptCatalog<P> = P & {
  [K in keyof P & string as P[K] extends Vector4 | Quaternion
    ? `${K}.${"x" | "y" | "z" | "w"}`
    : P[K] extends Vector3
      ? `${K}.${"x" | "y" | "z"}`
      : never]: number;
};

// `T`, bounded by `B`. A catalogued value is always one the engine's property
// variant holds, so this changes no resolved type: it gives the unresolved
// signature a constraint, which `keyof` of a generic catalog cannot, and which
// the Lua annotation diff reads its declared kinds from.
type Bounded<T, B> = T extends infer V extends B ? V : never;

// The property catalog an address reads, and whether a key outside it is an
// engine error (`closed`) or may still name a material constant (open).
interface AddressCatalogShape {
  catalog: object;
  closed: boolean;
}

// A game object, whose only properties are its transform (gameobject.cpp
// `GetProperty` for component id 0).
type GameObject = { catalog: go.Properties; closed: true };

// An address that may name any component, or the calling script, whose
// properties no scene entry records: comp_script.cpp `CompScriptSetProperty`
// sets whatever a script declares, at the declared type. It names no key, so
// every key reads and writes the wide value.
type Opaque = { catalog: Record<never, never>; closed: false };

// The catalog of what a `SceneComponentAddresses` value names: a registered
// component kind, or the default export of a linked script. comp_script.cpp
// `CompScriptGetProperty` raises for a key the script does not declare, so a
// script's catalog is closed; a built-in kind also reads its material's
// constants by name, so its catalog stays open. `true` names neither.
type ComponentCatalog<V> = [V] extends [keyof SceneComponentCatalogs]
  ? { catalog: SceneComponentCatalogs[V]; closed: false }
  : [V] extends [true]
    ? Opaque
    : [V] extends [{ properties?: infer P }]
      ? { catalog: ScriptCatalog<NonNullable<P>>; closed: true }
      : Opaque;

// The catalog each member of an address union `R` reads. One the scene types
// name reads its component's catalog. Any other literal with no `#` resolves to
// fragment 0 — script_msg.cpp `ResolveURL` — and so does a hash, whose
// `ResolveURL` branch sets `m_Fragment = 0`: both are game objects. `""` and
// `"#"` resolve to the calling script (`ResolveURL` copies the default URL),
// another literal with a `#` names a component, and a wide string or a `Url`
// may name either, so those read `Opaque`. The `& keyof` index is `R` itself in
// that branch; spelled out, it keeps the nested conditionals within the depth
// TypeScript resolves a signature's constraint to. An `any` address may be
// anything, so it reads `Opaque` too.
type AddressCatalog<R> = 0 extends 1 & R
  ? Opaque
  : R extends keyof SceneComponentAddresses
    ? ComponentCatalog<SceneComponentAddresses[R & keyof SceneComponentAddresses]>
    : R extends Hash
      ? GameObject
      : R extends string
        ? string extends R
          ? Opaque
          : R extends "" | `${string}#${string}`
            ? Opaque
            : GameObject
        : Opaque;

// The string keys each member of address shape union `A` lists: every key its
// catalog names, or only those go.animate can tween when `Animatable` is true.
type CatalogKeys<A extends AddressCatalogShape, Animatable> = A extends unknown
  ? ([Animatable] extends [true] ? AnimatableKey<A["catalog"]> : keyof A["catalog"]) & string
  : never;

// The string keys every member of `A` lists. Inferring one parameter from the
// union of each member's function intersects their key sets, as `XyWriteEach`
// does for values.
type SharedKeys<A extends AddressCatalogShape, Animatable> = (
  A extends unknown
    ? (key: CatalogKeys<A, Animatable>) => void
    : never
) extends (key: infer K extends string) => void
  ? K
  : never;

// The keys an address shape union `A` takes. An open member takes any string,
// so a closed member alone constrains the key: with one, only a key every closed
// member lists; with none, any member's key or any other string. A hash is
// always taken.
type ShapeKeys<A extends AddressCatalogShape, Animatable> = [Extract<A, { closed: true }>] extends [
  never,
]
  ? CatalogKeys<A, Animatable> | (string & {}) | Hash
  : SharedKeys<Extract<A, { closed: true }>, Animatable> | Hash;

// The keys an address takes.
type PropertyName<A extends AddressCatalogShape> = ShapeKeys<A, false>;

// The keys go.cancel_animations takes: gameobject_script.cpp
// `Script_CancelAnimations` raises for a key the address does not have and for
// one whose value is not numerical, so a catalog offers only its animatable
// keys, plus any other string when it is open.
type AnimatablePropertyName<A extends AddressCatalogShape> = ShapeKeys<A, true>;

// A value go.set takes for every key in a union `K` of catalog `P`. Inferring
// one parameter from the union of each key's setter intersects their value
// types, where distributing over `K` would accept a value any one key takes. The
// `infer` constraint keeps the kinds a value may hold readable from the
// declaration.
type XyWriteEach<P, K extends keyof P> = (
  K extends unknown
    ? (value: XyWrite<P, K>) => void
    : never
) extends (value: infer V extends WideValue) => void
  ? V
  : never;

// A target go.animate takes for every key in a union `K` of catalog `P`.
type AnimateTargetEach<P, K extends keyof P> = (
  K extends unknown
    ? (to: AnimateTarget<P[K]>) => void
    : never
) extends (to: infer V extends WideAnimateTarget) => void
  ? V
  : never;

// The names each member of a key union `K` gives: a string key its own, and a
// hash the string `hash()` was called with. A bare `Hash` names nothing.
type KeyNames<K> = K extends Hash<infer S> ? (string extends S ? never : S) : K;

// The keys of address shape `A`'s catalog a key union `K` names, by string or
// by hash, so `"position" | Hash<"rotation">` names both on a game object. A
// dynamic string, a bare `Hash` and a name the catalog does not list name none.
// `Extract` filters member by member, where `& keyof` would let a wide `string`
// name every key.
type NamedKeys<A extends AddressCatalogShape, K> = Extract<KeyNames<K>, keyof A["catalog"]>;

// The literal hashes in key union `K` that name no key every closed member of
// `A` lists, among its animatable keys when `Animatable` is true. An open member
// may hold any key, so with no closed member there are none.
type UnlistedHashes<A extends AddressCatalogShape, K, Animatable> = [
  Extract<A, { closed: true }>,
] extends [never]
  ? never
  : K extends Hash<infer S>
    ? string extends S
      ? never
      : S extends SharedKeys<Extract<A, { closed: true }>, Animatable>
        ? never
        : K
    : never;

// `unknown` when key union `K` holds no hash a closed member of `A` refuses, and
// `never` when it does. Intersected into a `property` parameter, it refuses such
// a hash, which the key constraint cannot: `Hash<S>` is assignable to `Hash`.
type ListedHashes<A extends AddressCatalogShape, K, Animatable> = [
  UnlistedHashes<A, K, Animatable>,
] extends [never]
  ? unknown
  : never;

// What one address shape `A` returns for key `K`: the entries the members of `K`
// name, and the wide value when one of them names none.
type ShapeRead<A extends AddressCatalogShape, K> = K extends unknown
  ? [NamedKeys<A, K>] extends [never]
    ? WideValue
    : Bounded<A["catalog"][NamedKeys<A, K>], WideValue>
  : never;

// What go.get returns for key `K` of address shape union `A`: what any member
// returns.
type PropertyRead<A extends AddressCatalogShape, K> = A extends unknown ? ShapeRead<A, K> : never;

// The options go.get takes on address shape union `A`. gameobject_script_util.cpp
// `CheckGetPropertyResult` raises for `index` on a property that is not an
// array and for `key` on one that is not a hashtable, which no transform or
// script property is, so a closed member takes only `keys`; an open catalog may
// still name a material constant array.
type GetOptions<A extends AddressCatalogShape> = [Extract<A, { closed: true }>] extends [never]
  ? go.GoPropertyOptions
  : { index?: undefined; key?: undefined; keys?: (Hash | string)[] };

// What one address shape `A` constrains a go.set value to for key `K`: a value
// every key `K` names takes, nothing when one of them is `readonly`, and no
// constraint when `K` names none. `K` does not distribute inside these
// branches, so the intersection lives in an alias of its own.
type ShapeWrite<A extends AddressCatalogShape, K> = [NamedKeys<A, K>] extends [never]
  ? unknown
  : [NamedKeys<A, K>] extends [WritableKey<A["catalog"]>]
    ? XyWriteEach<A["catalog"], NamedKeys<A, K>>
    : never;

// What go.set takes for key `K` of address shape union `A`: a value every
// member takes, and the wide value when no member names `K`. A member that names
// no key adds no constraint, so it never widens another member's.
type PropertyWriteEach<A extends AddressCatalogShape, K> = (
  A extends unknown
    ? (value: ShapeWrite<A, K>) => void
    : never
) extends (value: infer V) => void
  ? unknown extends V
    ? WideValue
    : Bounded<V, WideValue>
  : never;

// What one address shape `A` constrains a go.animate target to for key `K`: a
// target every key `K` names takes, nothing when the engine cannot animate one
// of them, and no constraint when `K` names none.
type ShapeAnimateTo<A extends AddressCatalogShape, K> = [NamedKeys<A, K>] extends [never]
  ? unknown
  : [NamedKeys<A, K>] extends [AnimatableKey<A["catalog"]>]
    ? AnimateTargetEach<A["catalog"], NamedKeys<A, K>>
    : never;

// What go.animate takes for key `K` of address shape union `A`: a target every
// member takes, and the wide target when no member names `K`.
type PropertyAnimateToEach<A extends AddressCatalogShape, K> = (
  A extends unknown
    ? (to: ShapeAnimateTo<A, K>) => void
    : never
) extends (to: infer V) => void
  ? unknown extends V
    ? WideAnimateTarget
    : Bounded<V, WideAnimateTarget>
  : never;

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
      to: AnimateTargetEach<P, K>,
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
    function animate<
      R extends SceneAddress | Hash | Url,
      K extends PropertyName<AddressCatalog<R>>,
    >(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
      playback: go.Playback,
      to: PropertyAnimateToEach<AddressCatalog<R>, K>,
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
    function animate<
      R extends SceneAddress | Hash | Url,
      K extends PropertyName<AddressCatalog<R>>,
    >(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
      playback: go.Playback,
      to: PropertyAnimateToEach<AddressCatalog<R>, K>,
      easing: Vector | go.Easing,
      duration: number,
      delay: number,
      complete_function?: (self: unknown, url: Url, property: Hash) => void,
    ): void;
    /**
     * By calling this function, all or specified stored property animations of the game object or component will be canceled.
     * See the properties guide for which properties can be animated and the animation guide for how to animate them.
     *
     * @param url - url of the game object or component
     * @param property - optional id of the property to cancel
     * @example
     * Cancel the animation of the position of a game object:
     * ```ts
     * go.cancel_animations(go.get_id(), "position");
     * ```
     * @example
     * Cancel all property animations of the current game object:
     * ```ts
     * go.cancel_animations(".");
     * ```
     * @example
     * Cancel all property animations of the sprite component of the current game object:
     * ```ts
     * go.cancel_animations("#sprite");
     * ```
     */
    function cancel_animations<
      R extends SceneAddress | Hash | Url,
      K extends AnimatablePropertyName<AddressCatalog<R>>,
    >(url?: R, property?: K & ListedHashes<AddressCatalog<R>, K, true>): void;
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
    // One signature per arity, typed from the address's catalog: a known key
    // reads its catalogued type, and a key no catalog names reads the wide value.
    function get<R extends SceneAddress | Hash | Url, K extends PropertyName<AddressCatalog<R>>>(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
    ): PropertyRead<AddressCatalog<R>, K>;
    function get<R extends SceneAddress | Hash | Url, K extends PropertyName<AddressCatalog<R>>>(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
      options: GetOptions<AddressCatalog<R>>,
    ): PropertyRead<AddressCatalog<R>, K>;
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
      value: XyWriteEach<P, K>,
      ...options: [] | [GoPropertyOptions]
    ) => void;
    // One signature per arity, with the value conditional on the address's
    // catalog and the key: a known key gets its own value type and no wide
    // overload to fall through to, while a key no catalog names gets the wide
    // union.
    function set<R extends SceneAddress | Hash | Url, K extends PropertyName<AddressCatalog<R>>>(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
      value: PropertyWriteEach<AddressCatalog<R>, K>,
    ): void;
    function set<R extends SceneAddress | Hash | Url, K extends PropertyName<AddressCatalog<R>>>(
      url: R,
      property: K & ListedHashes<AddressCatalog<R>, K, false>,
      value: PropertyWriteEach<AddressCatalog<R>, K>,
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
    /** @deprecated Declare properties via the `defineScript({ properties })` field. */
    function property(
      name: string,
      value: number | boolean | Hash | Url | Vector3 | Vector4 | Quaternion,
    ): ScriptProperty<number | boolean | Hash | Url | Vector3 | Vector4 | Quaternion>;
  }
}
