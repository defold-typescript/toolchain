/** @noSelfInFile */
declare global {
  /**
   * Functions for controlling factory components which are used to
   * dynamically spawn game objects into the runtime.
   */
  namespace factory {
    type STATUS = typeof factory.STATUS_LOADED | typeof factory.STATUS_LOADING | typeof factory.STATUS_UNLOADED;
    /**
     * The factory resources are loaded.
     */
    const STATUS_LOADED: number & { readonly __brand: "factory.STATUS_LOADED" };
    /**
     * The factory resources are loading.
     */
    const STATUS_LOADING: number & { readonly __brand: "factory.STATUS_LOADING" };
    /**
     * The factory resources are unloaded.
     */
    const STATUS_UNLOADED: number & { readonly __brand: "factory.STATUS_UNLOADED" };
  }
}

export {};
