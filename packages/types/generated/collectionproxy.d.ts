/** @noSelfInFile */
import type { Hash, Url } from "../src/core-types";

declare global {
  namespace collectionproxy {
    const RESULT_ALREADY_LOADED: number & { readonly __brand: "collectionproxy.RESULT_ALREADY_LOADED" };
    const RESULT_LOADING: number & { readonly __brand: "collectionproxy.RESULT_LOADING" };
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
  collection was not excluded.
     */
    function get_resources(collectionproxy: Url): Record<string | number, unknown>;
    /**
     * The collection should be loaded by the collection proxy.
     * Setting the collection to "nil" will revert it back to the original collection.
     * The collection proxy shouldn't be loaded and should have the 'Exclude' checkbox checked.
     * This functionality is designed to simplify the management of Live Update resources.
     *
     * @param url - the collection proxy component
     * @param prototype - the path to the new collection, or `nil`
     */
    function set_collection(url?: string | Hash | Url, prototype?: string): LuaMultiReturn<[boolean, number]>;
  }
}

export {};
