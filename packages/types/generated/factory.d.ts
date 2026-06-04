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
     */
    function create(url: string | Hash | Url, position?: Vector3, rotation?: Quaternion, properties?: Record<string | number, unknown>, scale?: number | Vector3): Hash;
    /**
     * This returns status of the factory.
     * Calling this function when the factory is not marked as dynamic loading always returns
     * factory.STATUS_LOADED.
     *
     * @param url - the factory component to get status from
     * @returns status of the factory component
  - `factory.STATUS_UNLOADED`
  - `factory.STATUS_LOADING`
  - `factory.STATUS_LOADED`
     */
    function get_status(url?: string | Hash | Url): Opaque<"constant">;
    /**
     * Resources are referenced by the factory component until the existing (parent) collection is destroyed or factory.unload is called.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the factory component to load
     * @param complete_function - function to call when resources are loaded.
  `self`
  object The current object.
  `url`
  url url of the factory component
  `result`
  boolean True if resources were loaded successfully
     */
    function load(url?: string | Hash | Url, complete_function?: (self: unknown, url: unknown, result: unknown) => void): void;
    /**
     * Changes the prototype for the factory.
     *
     * @param url - the factory component
     * @param prototype - the path to the new prototype, or `nil`
     */
    function set_prototype(url?: string | Hash | Url, prototype?: string): void;
    /**
     * This decreases the reference count for each resource loaded with factory.load. If reference is zero, the resource is destroyed.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the factory component to unload
     */
    function unload(url?: string | Hash | Url): void;
  }
}

export {};
