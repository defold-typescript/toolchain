/** @noSelfInFile */
declare global {
  /**
   * Functions for performing HTTP and HTTPS requests.
   */
  namespace http {
    /**
     * HTTP request options
     */
    interface RequestOptions {
      /**
       * timeout in seconds
       */
      timeout?: number;
      /**
       * absolute destination path; overwritten only for status 200
       */
      path?: string;
      /**
       * do not return cached data for status 304; unavailable on HTML5
       */
      ignore_cache?: boolean;
      /**
       * use chunked transfer encoding for HTTPS requests larger than 16 KB; defaults to true and is unavailable on HTML5
       */
      chunked_transfer?: boolean;
      /**
       * report transferred and total byte counts to the callback
       */
      report_progress?: boolean;
      /**
       * Proxy server URL; ignored on HTML5.
       */
      proxy?: string;
    }
  }
}

export {};
