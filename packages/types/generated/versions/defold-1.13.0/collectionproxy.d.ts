/** @noSelfInFile */
import type { Hash, Url } from "../../../src/core-types";

declare global {
  /**
   * Messages for controlling and interacting with collection proxies
   * which are used to dynamically load collections into the runtime.
   */
  namespace collectionproxy {
    /**
     * It's impossible to change the collection if the collection is already loaded.
     */
    const RESULT_ALREADY_LOADED: number & { readonly __brand: "collectionproxy.RESULT_ALREADY_LOADED" };
    /**
     * It's impossible to change the collection while the collection proxy is loading.
     */
    const RESULT_LOADING: number & { readonly __brand: "collectionproxy.RESULT_LOADING" };
    /**
     * It's impossible to change the collection for a proxy that isn't excluded.
     */
    const RESULT_NOT_EXCLUDED: number & { readonly __brand: "collectionproxy.RESULT_NOT_EXCLUDED" };
    /**
     * return an indexed table of resources for a collection proxy where the
     * referenced collection has been excluded using LiveUpdate. Each entry is a
     * hexadecimal string that represents the data of the specific resource.
     * This representation corresponds with the filename for each individual
     * resource that is exported when you bundle an application with LiveUpdate
     * functionality.
     *
     * @param collectionproxy - the collectionproxy to check for resources.
     * @returns the resources, or an empty list if the
     * collection was not excluded.
     * @example
     * ```ts
     * function print_resources(self, cproxy) {
     *   const resources = collectionproxy.get_resources(cproxy);
     *   for (const v of resources) {
     *     print(`Resource: ${v}`);
     *   }
     * }
     * ```
     */
    function get_resources(collectionproxy: Url): Hash[];
    /**
     * The collection should be loaded by the collection proxy.
     * Setting the collection to "nil" will revert it back to the original collection.
     * The collection proxy shouldn't be loaded and should have the 'Exclude' checkbox checked.
     * This functionality is designed to simplify the management of Live Update resources.
     *
     * @param url - the collection proxy component
     * @param prototype - the path to the new collection, or `nil`
     * @example
     * ```ts
     * // The example assumes the script belongs to an instance with a
     * // collection-proxy-component with id "proxy".
     * const [ok, error] = collectionproxy.set_collection("/go#collectionproxy", "/LU/3.collectionc");
     * if (ok) {
     *   print("The collection has been changed to /LU/3.collectionc");
     * } else {
     *   print("Error changing collection to /LU/3.collectionc ", error);
     * }
     * msg.post("/go#collectionproxy", "load");
     * msg.post("/go#collectionproxy", "init");
     * msg.post("/go#collectionproxy", "enable");
     * ```
     */
    function set_collection(url?: string | Hash | Url, prototype?: string): LuaMultiReturn<[boolean, number]>;
  }
}

export {};
