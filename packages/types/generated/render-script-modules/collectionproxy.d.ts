/** @noSelfInFile */
declare global {
  /**
   * Messages for controlling and interacting with collection proxies
   * which are used to dynamically load collections into the runtime.
   */
  namespace collectionproxy {
    /**
     * Data delivered to a collectionproxy.load callback. The available
     * field depends on the callback message identifier.
     */
    interface load_data {
      /**
       * Loading progress from 0 to 1 for `proxy_loading`.
       */
      progress?: number;
      /**
       * Error code for `proxy_error`.
       */
      code?: number;
    }
    type TIME_STEP_MODE = 0 | 1;
    type RESULT = typeof collectionproxy.RESULT_ALREADY_LOADED | typeof collectionproxy.RESULT_LOADING | typeof collectionproxy.RESULT_NOT_EXCLUDED;
    /**
     * The collection proxy is already loaded, so its collection cannot be changed.
     */
    const RESULT_ALREADY_LOADED: number & { readonly __brand: "collectionproxy.RESULT_ALREADY_LOADED" };
    /**
     * The collection proxy is loading, so its collection cannot be changed.
     */
    const RESULT_LOADING: number & { readonly __brand: "collectionproxy.RESULT_LOADING" };
    /**
     * The collection proxy is not excluded from the bundle; only excluded proxies can change collections.
     */
    const RESULT_NOT_EXCLUDED: number & { readonly __brand: "collectionproxy.RESULT_NOT_EXCLUDED" };
  }
}

export {};
