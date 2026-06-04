/** @noSelfInFile */
import type { Hash, Opaque, Quaternion, Url, Vector3 } from "../src/core-types";

declare global {
  namespace collectionfactory {
    const STATUS_LOADED: number & { readonly __brand: "collectionfactory.STATUS_LOADED" };
    const STATUS_LOADING: number & { readonly __brand: "collectionfactory.STATUS_LOADING" };
    const STATUS_UNLOADED: number & { readonly __brand: "collectionfactory.STATUS_UNLOADED" };
    /**
     * The URL identifies the collectionfactory component that should do the spawning.
     * Spawning is instant, but spawned game objects get their first update calls the following frame. The supplied parameters for position, rotation and scale
     * will be applied to the whole collection when spawned.
     * Script properties in the created game objects can be overridden through
     * a properties-parameter table. The table should contain game object ids
     * (hash) as keys and property tables as values to be used when initiating each
     * spawned game object.
     * See go.property for more information on script properties.
     * The function returns a table that contains a key for each game object
     * id (hash), as addressed if the collection file was top level, and the
     * corresponding spawned instance id (hash) as value with a unique path
     * prefix added to each instance.
     * Calling collectionfactory.create create on a collection factory that is marked as dynamic without having loaded resources
     * using collectionfactory.load will synchronously load and create resources which may affect application performance.
     *
     * @param url - the collection factory component to be used
     * @param position - position to assign to the newly spawned collection
     * @param rotation - rotation to assign to the newly spawned collection
     * @param properties - table of script properties to propagate to any new game object instances
     * @param scale - uniform scaling to apply to the newly spawned collection (must be greater than 0).
     * @returns a table mapping the id:s from the collection to the new instance id:s
     */
    function create(url: string | Hash | Url, position?: Vector3, rotation?: Quaternion, properties?: Record<string | number, unknown>, scale?: number | Vector3): Record<string | number, unknown>;
    /**
     * This returns status of the collection factory.
     * Calling this function when the factory is not marked as dynamic loading always returns COMP_COLLECTION_FACTORY_STATUS_LOADED.
     *
     * @param url - the collection factory component to get status from
     * @returns status of the collection factory component
  - `collectionfactory.STATUS_UNLOADED`
  - `collectionfactory.STATUS_LOADING`
  - `collectionfactory.STATUS_LOADED`
     */
    function get_status(url?: string | Hash | Url): Opaque<"constant">;
    /**
     * Resources loaded are referenced by the collection factory component until the existing (parent) collection is destroyed or collectionfactory.unload is called.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the collection factory component to load
     * @param complete_function - function to call when resources are loaded.
  `self`
  object The current object.
  `url`
  url url of the collection factory component
  `result`
  boolean True if resource were loaded successfully
     */
    function load(url?: string | Hash | Url, complete_function?: (self: unknown, url: unknown, result: unknown) => void): void;
    /**
     * Changes the prototype for the collection factory.
     * Setting the prototype to "nil" will revert back to the original prototype.
     *
     * @param url - the collection factory component
     * @param prototype - the path to the new prototype, or `nil`
     */
    function set_prototype(url?: string | Hash | Url, prototype?: string): void;
    /**
     * This decreases the reference count for each resource loaded with collectionfactory.load. If reference is zero, the resource is destroyed.
     * Calling this function when the factory is not marked as dynamic loading does nothing.
     *
     * @param url - the collection factory component to unload
     */
    function unload(url?: string | Hash | Url): void;
  }
}

export {};
