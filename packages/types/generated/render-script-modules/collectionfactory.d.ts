/** @noSelfInFile */
declare global {
  /**
   * Functions for controlling collection factory components which are
   * used to dynamically spawn collections into the runtime.
   */
  namespace collectionfactory {
    type Status = typeof collectionfactory.STATUS_LOADED | typeof collectionfactory.STATUS_LOADING | typeof collectionfactory.STATUS_UNLOADED;
    /**
     * The collection factory resources are loaded.
     */
    const STATUS_LOADED: number & { readonly __brand: "collectionfactory.STATUS_LOADED" };
    /**
     * The collection factory resources are loading.
     */
    const STATUS_LOADING: number & { readonly __brand: "collectionfactory.STATUS_LOADING" };
    /**
     * The collection factory resources are unloaded.
     */
    const STATUS_UNLOADED: number & { readonly __brand: "collectionfactory.STATUS_UNLOADED" };
  }
}

export {};
