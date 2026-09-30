/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace json {
    namespace decode {
      /**
       * Options for json.decode
       */
      interface options {
        /**
         * if true, decodes all JSON values in a string and returns an array
         */
        all?: boolean;
      }
    }
  }
}

export {};
