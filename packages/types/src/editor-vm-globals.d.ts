/** @noSelfInFile */

// The editor VM surfaces the emitter cannot express, hand-authored and pinned to
// their vendored fixtures by `test/editor-vm-globals-parity.test.ts`. Two shapes
// land here: `pprint` is a bare global function with no namespace to hang off,
// and the two-segment VARIABLEs (`zip.METHOD.*`, `http.server.*`) fall outside
// the emitter's nested pass, which groups functions only. The namespaces below
// merge with the emitted `generated/editor-vm/` bodies rather than replacing
// them. Upstream records no type for a VARIABLE, so the annotations here are
// read from each member's own prose.

declare global {
  /**
   * Pretty-print a Lua value
   */
  function pprint(value: unknown): void;

  namespace http {
    namespace server {
      /**
       * Editor's HTTP server local url
       */
      const local_url: string;
      /**
       * Editor's HTTP server port
       */
      const port: number;
      /**
       * Editor's HTTP server url
       */
      const url: string;
    }
  }

  namespace zip {
    namespace METHOD {
      /**
       * `"deflated"` compression method
       */
      const DEFLATED: string;
      /**
       * `"stored"` compression method, i.e. no compression
       */
      const STORED: string;
    }
    namespace ON_CONFLICT {
      /**
       * `"error"`, any conflict aborts extraction
       */
      const ERROR: string;
      /**
       * `"skip"`, existing file is preserved
       */
      const SKIP: string;
      /**
       * `"skip"`, existing file is overwritten
       */
      const OVERWRITE: string;
    }
  }
}

export {};
