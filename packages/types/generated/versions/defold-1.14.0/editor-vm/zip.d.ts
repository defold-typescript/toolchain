/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace zip {
    namespace pack {
      type Entries = (string | zip.pack.Entry)[];
      type Entry = { 1: string; 2?: string; method?: unknown; level?: number };
      /**
       * Options for zip.pack
       */
      interface Options {
        /**
         * compression method, defaults to `zip.METHOD.DEFLATED`
         */
        method?: unknown;
        /**
         * compression level from 0 to 9 for deflated entries; defaults to 6
         */
        level?: number;
      }
    }
    namespace unpack {
      /**
       * Options for zip.unpack
       */
      interface Options {
        /**
         * conflict resolution strategy
         */
        on_conflict: unknown;
      }
    }
  }
}

export {};
