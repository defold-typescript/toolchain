/** @noSelfInFile */
import type { Hash, Opaque, Quaternion, Url, Vector3 } from "../src/core-types";

declare global {
  namespace factory {
    /**
     * loaded
     */
    const STATUS_LOADED: number & { readonly __brand: "factory.STATUS_LOADED" };
    /**
     * loading
     */
    const STATUS_LOADING: number & { readonly __brand: "factory.STATUS_LOADING" };
    /**
     * unloaded
     */
    const STATUS_UNLOADED: number & { readonly __brand: "factory.STATUS_UNLOADED" };
    /**
     * The URL identifies which factory should create the game object.
     * If the game object is created inside of the frame (e.g. from an update callback), the game object will be created instantly, but none of its component will be updated in the same frame.
     * Properties defined in scripts in the created game object can be overridden through the properties-parameter below.
     * See go.property for more information on script properties.
     * Calling factory.create on a factory that is marked as dynamic without having loaded resources
     * using factory.load will synchronously load and create resources which may affect application performance.
     *
     * @param url - the factory that should create a game object.
     * @param position - the position of the new game object, the position of the game object calling `factory.create()` is used by default, or if the value is `nil`.
     * @param rotation - the rotation of the new game object, the rotation of the game object calling `factory.create()` is used by default, or if the value is `nil`.
     * @param properties - the properties defined in a script attached to the new game object.
     * @param scale - the scale of the new game object (must be greater than 0), the scale of the game object containing the factory is used by default, or if the value is `nil`
     * @returns the global id of the spawned game object
     * @example
     * ```lua
     * How to create a new game object:
     * function init(self)
     *     -- create a new game object and provide property values
     *     self.my_created_object = factory.create("#factory", nil, nil, {my_value = 1})
     *     -- communicate with the object
     *     msg.post(self.my_created_object, "hello")
     * end
     *
     * And then let the new game object have a script attached:
     * go.property("my_value", 0)
     *
     * function init(self)
     *     -- do something with self.my_value which is now one
     * end
     * ```
     */
    function create(url: string | Hash | Url, position?: Vector3, rotation?: Quaternion, properties?: Record<string | number, unknown>, scale?: number | Vector3): Hash;
    /**
     * This returns status of the factory.
     * Calling this function when the factory is not marked as dynamic loading always returns
     * factory.STATUS_LOADED.
     *
     * @param url - the factory component to get status from
     * @returns status of the factory component
     * - `factory.STATUS_UNLOADED`
     * - `factory.STATUS_LOADING`
     * - `factory.STATUS_LOADED`
     */
    function get_status(url?: string | Hash | Url): Opaque<"constant">;
    /**
     * Resources are referenced by the factory component until the existing (parent) collection is destroyed or factory.unload is called.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the factory component to load
     * @param complete_function - function to call when resources are loaded.
     * `self`
     * object The current object.
     * `url`
     * url url of the factory component
     * `result`
     * boolean True if resources were loaded successfully
     * @example
     * ```lua
     * How to load resources of a factory prototype.
     * factory.load("#factory", function(self, url, result) end)
     * ```
     */
    function load(url?: string | Hash | Url, complete_function?: (self: unknown, url: unknown, result: unknown) => void): void;
    /**
     * Changes the prototype for the factory.
     *
     * @param url - the factory component
     * @param prototype - the path to the new prototype, or `nil`
     * @example
     * ```lua
     * How to unload the previous prototypes resources, and then spawn a new game object
     * factory.unload("#factory") -- unload the previous resources
     * factory.set_prototype("#factory", "/main/levels/enemyA.goc")
     * local id = factory.create("#factory", go.get_world_position(), vmath.quat())
     * ```
     */
    function set_prototype(url?: string | Hash | Url, prototype?: string): void;
    /**
     * This decreases the reference count for each resource loaded with factory.load. If reference is zero, the resource is destroyed.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the factory component to unload
     * @example
     * ```lua
     * How to unload resources of a factory prototype loaded with factory.load
     * factory.unload("#factory")
     * ```
     */
    function unload(url?: string | Hash | Url): void;
  }
}

export {};
